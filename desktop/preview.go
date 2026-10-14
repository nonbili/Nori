package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
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

// How much of its own time a page gets to settle before it is captured.
const screenshotBudget = 3 * time.Second

const imageUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

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
	req, err := http.NewRequest(http.MethodGet, value, nil)
	if err != nil {
		return PreviewImageResponse{}, err
	}
	// Image hosts refuse Go's own User-Agent as a bot's, where the app and the
	// extension ask as the browsers they are.
	req.Header.Set("User-Agent", imageUserAgent)
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
	res, err := s.client.Do(req)
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
//
// The image is asked for over the DevTools protocol rather than with
// --screenshot, which has the browser write a file this then has to find: on
// some Windows machines that file never appeared.
func (s *PageService) Screenshot(value string) (string, error) {
	if err := previewURL(value); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	browser, err := openHeadlessPage(ctx, cancel)
	if err != nil {
		return "", err
	}
	defer browser.close()
	client, session := browser.client, browser.session
	// A scale of one whatever the display's: at 200% the capture has four times
	// the pixels, which can pass maxPreviewBytes and never yield a usable image.
	if _, err := client.call(ctx, session, "Emulation.setDeviceMetricsOverride", map[string]any{
		"width": 1000, "height": 750, "deviceScaleFactor": 1, "mobile": false,
	}); err != nil {
		return "", err
	}
	if err := browser.load(ctx, value, screenshotBudget); err != nil {
		return "", err
	}
	var shot struct {
		Data string `json:"data"`
	}
	result, err := client.call(ctx, session, "Page.captureScreenshot", map[string]any{"format": "png"})
	if err != nil {
		return "", err
	}
	if json.Unmarshal(result, &shot) != nil || shot.Data == "" {
		return "", errors.New("preview screenshot was empty")
	}
	if len(shot.Data)/4*3 > maxPreviewBytes {
		return "", errors.New("preview image too large")
	}
	return "data:image/png;base64," + shot.Data, nil
}
