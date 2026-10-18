package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func testStore(t *testing.T) *StoreService {
	t.Helper()
	return &StoreService{path: filepath.Join(t.TempDir(), "state.json"), values: map[string]json.RawMessage{}}
}

func readStore(t *testing.T, store *StoreService) *StoreService {
	t.Helper()
	loaded := &StoreService{path: store.path, values: map[string]json.RawMessage{}}
	if err := loaded.load(); err != nil {
		t.Fatal(err)
	}
	return loaded
}

func requireStored(t *testing.T, store *StoreService, key, want string) {
	t.Helper()
	got, err := store.Get(key)
	if err != nil || got != want {
		t.Fatalf("Get(%q) = %q, %v; want %q", key, got, err, want)
	}
}

func TestStoreRoundTrip(t *testing.T) {
	store := testStore(t)
	for key, value := range map[string]string{
		"nori-state": `{"profiles":{"anonymous":{"bookmarks":[{"title":"日本語 🍙"}]}}}`,
		"auth:token": `"secret-token"`,
	} {
		if err := store.Set(key, value); err != nil {
			t.Fatal(err)
		}
		requireStored(t, readStore(t, store), key, value)
	}
	if err := store.Delete("auth:token"); err != nil {
		t.Fatal(err)
	}
	loaded := readStore(t, store)
	requireStored(t, loaded, "auth:token", "")
	requireStored(t, loaded, "missing", "")
	if err := loaded.Delete("missing"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(store.path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("successful write left a temporary file: %v", err)
	}
}

func TestStoreLoad(t *testing.T) {
	for _, content := range []string{"", "{}", "null"} {
		t.Run(content, func(t *testing.T) {
			store := testStore(t)
			if err := os.WriteFile(store.path, []byte(content), 0o600); err != nil {
				t.Fatal(err)
			}
			loaded := readStore(t, store)
			if err := loaded.Set("key", `"value"`); err != nil {
				t.Fatal(err)
			}
			requireStored(t, readStore(t, loaded), "key", `"value"`)
		})
	}
	t.Run("missing", func(t *testing.T) { requireStored(t, readStore(t, testStore(t)), "key", "") })
	t.Run("malformed", func(t *testing.T) {
		store := testStore(t)
		content := []byte(`{"nori-state":`)
		if err := os.WriteFile(store.path, content, 0o600); err != nil {
			t.Fatal(err)
		}
		if err := store.load(); err == nil {
			t.Fatal("malformed store silently accepted")
		}
		data, err := os.ReadFile(store.path)
		if err != nil || string(data) != string(content) {
			t.Fatalf("load modified malformed file: %q, %v", data, err)
		}
	})
}

func TestStoreRejectsInvalidJSONWithoutPoisoningFutureWrites(t *testing.T) {
	store := testStore(t)
	if err := store.Set("key", `"old"`); err != nil {
		t.Fatal(err)
	}
	if err := store.Set("key", `{invalid`); err == nil {
		t.Fatal("invalid JSON accepted")
	}
	requireStored(t, store, "key", `"old"`)
	requireStored(t, readStore(t, store), "key", `"old"`)
	if err := store.Set("another", `true`); err != nil {
		t.Fatalf("invalid write poisoned future writes: %v", err)
	}
}

func TestStoreWriteFailurePreservesMemoryAndDisk(t *testing.T) {
	for _, operation := range []string{"set", "delete"} {
		t.Run(operation, func(t *testing.T) {
			store := testStore(t)
			if err := store.Set("key", `"old"`); err != nil {
				t.Fatal(err)
			}
			// A directory at the temporary-file path fails even when tests run as root.
			if err := os.Mkdir(store.path+".tmp", 0o700); err != nil {
				t.Fatal(err)
			}
			var err error
			if operation == "set" {
				err = store.Set("key", `"new"`)
			} else {
				err = store.Delete("key")
			}
			if err == nil {
				t.Fatal("write succeeded despite blocked temporary path")
			}
			requireStored(t, store, "key", `"old"`)
			requireStored(t, readStore(t, store), "key", `"old"`)
			if err := os.Remove(store.path + ".tmp"); err != nil {
				t.Fatal(err)
			}
			if err := store.Set("key", `"recovered"`); err != nil {
				t.Fatal(err)
			}
			requireStored(t, readStore(t, store), "key", `"recovered"`)
		})
	}
}

func TestStoreConcurrentWrites(t *testing.T) {
	store := testStore(t)
	var workers sync.WaitGroup
	for _, key := range []string{"one", "two", "three", "four"} {
		workers.Add(1)
		go func(key string) {
			defer workers.Done()
			if err := store.Set(key, `true`); err != nil {
				t.Error(err)
			}
		}(key)
	}
	workers.Wait()
	loaded := readStore(t, store)
	for _, key := range []string{"one", "two", "three", "four"} {
		requireStored(t, loaded, key, `true`)
	}
}

func TestStoreRenameFailurePreservesPreviousState(t *testing.T) {
	store := testStore(t)
	if err := store.Set("key", `"old"`); err != nil {
		t.Fatal(err)
	}
	originalPath := store.path
	store.path = filepath.Join(t.TempDir(), "blocked")
	if err := os.Mkdir(store.path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := store.Set("key", `"new"`); err == nil {
		t.Fatal("rename over directory succeeded")
	}
	requireStored(t, store, "key", `"old"`)
	if _, err := os.Stat(store.path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("failed rename left a temporary file: %v", err)
	}
	store.path = originalPath
	requireStored(t, readStore(t, store), "key", `"old"`)
}
