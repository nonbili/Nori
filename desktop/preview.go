package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const maxPreviewBytes = 5 * 1024 * 1024

type PreviewImageResponse struct {
	DataURL    string `json:"dataUrl"`
	Error      string `json:"error,omitempty"`
	Persistent bool   `json:"persistent"`
}

func previewURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return errors.New("invalid preview URL")
	}
	return nil
}

// Image keeps binary downloads out of the HTML bridge's small response limit.
func (s *PageService) Image(value string) (PreviewImageResponse, error) {
	if err := previewURL(value); err != nil {
		return PreviewImageResponse{}, err
	}
	res, err := s.client.Get(value)
	if err != nil {
		return PreviewImageResponse{}, err
	}
	defer res.Body.Close()
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0]))
	ok := res.StatusCode >= http.StatusOK && res.StatusCode < http.StatusMultipleChoices
	if !ok || !strings.HasPrefix(contentType, "image/") {
		persistent := ok || (res.StatusCode >= http.StatusBadRequest && res.StatusCode < http.StatusInternalServerError && res.StatusCode != http.StatusRequestTimeout && res.StatusCode != http.StatusTooManyRequests)
		return PreviewImageResponse{Error: "preview_image_failed", Persistent: persistent}, nil
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxPreviewBytes+1))
	if err != nil {
		return PreviewImageResponse{}, err
	}
	if len(body) > maxPreviewBytes {
		return PreviewImageResponse{Error: "preview_image_too_large", Persistent: true}, nil
	}
	return PreviewImageResponse{DataURL: "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(body)}, nil
}

func previewBrowser() (string, error) {
	for _, name := range []string{"google-chrome", "chromium", "chromium-browser", "chrome", "msedge"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	candidates := []string{
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	}
	for _, root := range []string{os.Getenv("PROGRAMFILES"), os.Getenv("PROGRAMFILES(X86)"), os.Getenv("LOCALAPPDATA")} {
		if root != "" {
			candidates = append(candidates, filepath.Join(root, "Google", "Chrome", "Application", "chrome.exe"), filepath.Join(root, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path, nil
		}
	}
	return "", errors.New("install Chrome, Chromium or Edge to capture previews")
}

// Screenshot uses an isolated temporary browser profile, never the user's
// browsing profile. Captures remain local and no screenshot service is used.
func (s *PageService) Screenshot(value string) (string, error) {
	if err := previewURL(value); err != nil {
		return "", err
	}
	browser, err := previewBrowser()
	if err != nil {
		return "", err
	}
	directory, err := os.MkdirTemp("", "nori-preview-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(directory)
	image := filepath.Join(directory, "preview.png")
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, browser,
		"--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
		"--user-data-dir="+filepath.Join(directory, "profile"), "--window-size=1000,750",
		"--hide-scrollbars", "--timeout=15000", "--virtual-time-budget=3000", "--screenshot="+image, value)
	if err := cmd.Start(); err != nil {
		return "", err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	readImage := func() (string, error) {
		info, err := os.Stat(image)
		if err != nil {
			return "", err
		}
		if info.Size() > maxPreviewBytes {
			return "", errors.New("preview image too large")
		}
		body, err := os.ReadFile(image)
		if err != nil {
			return "", err
		}
		// Chrome can keep running after writing its screenshot. Wait for a complete
		// PNG rather than waiting for the browser process to exit on its own.
		if _, err := png.Decode(bytes.NewReader(body)); err != nil {
			return "", err
		}
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(body), nil
	}
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if result, err := readImage(); err == nil {
				cancel()
				<-done
				return result, nil
			}
		case <-done:
			return readImage()
		case <-ctx.Done():
			<-done
			return "", errors.New("preview screenshot timed out")
		}
	}
}
