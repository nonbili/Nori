package main

import (
	"encoding/json"
	"errors"
	"maps"
	"os"
	"path/filepath"
	"sync"
)

// StoreService is the desktop counterpart of the extension's
// `browser.storage.local`: a flat key -> JSON map persisted to disk. The
// frontend keeps the exact same keys ("nori-state", "auth:*"), so the shared
// storage/sync code runs unchanged.
type StoreService struct {
	mu     sync.Mutex
	path   string
	values map[string]json.RawMessage
}

func NewStoreService() (*StoreService, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	dir = filepath.Join(dir, "Nori")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	store := &StoreService{
		path:   filepath.Join(dir, "state.json"),
		values: map[string]json.RawMessage{},
	}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *StoreService) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(data) == 0 {
		return nil
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal(data, &values); err != nil {
		return err
	}
	if values == nil {
		values = map[string]json.RawMessage{}
	}
	s.values = values
	return nil
}

// persist writes the whole map through a temporary file so a crash mid-write
// cannot leave a truncated store behind.
func (s *StoreService) persist(values map[string]json.RawMessage) error {
	data, err := json.Marshal(values)
	if err != nil {
		return err
	}
	temp := s.path + ".tmp"
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(temp, s.path); err != nil {
		_ = os.Remove(temp)
		return err
	}
	// Publish only after the durable write succeeds. Failed writes must not
	// change what subsequent Get calls or unrelated writes see.
	s.values = values
	return nil
}

// Get returns the raw JSON stored under key, or an empty string when unset.
func (s *StoreService) Get(key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.values[key]
	if !ok {
		return "", nil
	}
	return string(value), nil
}

// Set stores raw JSON under key.
func (s *StoreService) Set(key string, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !json.Valid([]byte(value)) {
		return errors.New("invalid JSON value")
	}
	values := maps.Clone(s.values)
	if values == nil {
		values = map[string]json.RawMessage{}
	}
	values[key] = json.RawMessage(value)
	return s.persist(values)
}

// Delete removes key from the store.
func (s *StoreService) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.values[key]; !ok {
		return nil
	}
	values := maps.Clone(s.values)
	delete(values, key)
	return s.persist(values)
}
