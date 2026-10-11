package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRestageUpdate(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "nori.exe")
	stagingDir := filepath.Join(dir, "wails-update-test")
	if err := os.Mkdir(stagingDir, 0o700); err != nil {
		t.Fatal(err)
	}
	staged := filepath.Join(stagingDir, "nori.exe")
	for path, content := range map[string]string{target: "old binary", staged: "new binary"} {
		if err := os.WriteFile(path, []byte(content), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("WAILS_UPDATER_HELPER", "1")
	t.Setenv("WAILS_UPDATER_HELPER_TARGET", target)
	t.Setenv("WAILS_UPDATER_HELPER_NEW", staged)
	if err := restageUpdate(); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]string{target: "old binary", target + ".new": "new binary"} {
		data, err := os.ReadFile(path)
		if err != nil || string(data) != want {
			t.Fatalf("read %s = %q, %v; want %q", path, data, err, want)
		}
	}
	if got := os.Getenv("WAILS_UPDATER_HELPER_NEW"); got != target+".new" {
		t.Fatalf("helper staged path = %s", got)
	}
	if _, err := os.Stat(stagingDir); !os.IsNotExist(err) {
		t.Fatalf("staging directory still exists: %v", err)
	}
}

func TestUpdateHelperLogsRestageFailure(t *testing.T) {
	dir := t.TempDir()
	// A regular file in place of the destination directory makes writes fail
	// on every OS, even when tests run as root.
	blocked := filepath.Join(dir, "blocked")
	staged := filepath.Join(dir, "downloaded.exe")
	for _, path := range []string{blocked, staged} {
		if err := os.WriteFile(path, []byte("untouched"), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	logPath := filepath.Join(dir, "wails-update-test.log")
	t.Setenv("NORI_TEST_UPDATE_HELPER", "1")
	t.Setenv("WAILS_UPDATER_HELPER", "1")
	t.Setenv("WAILS_UPDATER_HELPER_TARGET", filepath.Join(blocked, "nori.exe"))
	t.Setenv("WAILS_UPDATER_HELPER_NEW", staged)
	t.Setenv("WAILS_UPDATER_HELPER_LOG", logPath)
	cmd := exec.Command(os.Args[0], "-test.run=^TestUpdateHelperProcess$")
	if err := cmd.Run(); err == nil {
		t.Fatal("helper succeeded despite unwritable staging destination")
	}
	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("helper failed without creating a log: %v", err)
	}
	if !strings.Contains(string(data), "preparing update helper") || !strings.Contains(string(data), "restage") {
		t.Fatalf("helper log omitted early failure: %s", data)
	}
	for _, path := range []string{blocked, staged} {
		data, err := os.ReadFile(path)
		if err != nil || string(data) != "untouched" {
			t.Fatalf("failed staging modified %s: %q, %v", path, data, err)
		}
	}
}

func TestUpdateHelperProcess(t *testing.T) {
	if os.Getenv("NORI_TEST_UPDATE_HELPER") != "1" {
		return
	}
	runUpdateHelper()
	t.Fatal("update helper returned instead of exiting")
}
