package main

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreviewImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/image":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("image"))
		case "/large":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte(strings.Repeat("a", maxPreviewBytes+1)))
		case "/missing":
			w.WriteHeader(http.StatusNotFound)
		case "/busy":
			w.WriteHeader(http.StatusServiceUnavailable)
		case "/rate-limited":
			w.WriteHeader(http.StatusTooManyRequests)
		default:
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("not an image"))
		}
	}))
	defer server.Close()
	service := NewPageService()
	image, err := service.Image(server.URL + "/image")
	if err != nil || image.DataURL != "data:image/png;base64,aW1hZ2U=" || image.Error != "" {
		t.Fatalf("image = %+v, error = %v", image, err)
	}
	for _, test := range []struct {
		path       string
		persistent bool
	}{
		{"/large", true}, {"/html", true}, {"/missing", true}, {"/busy", false}, {"/rate-limited", false},
	} {
		result, err := service.Image(server.URL + test.path)
		if err != nil || result.Error == "" || result.Persistent != test.persistent {
			t.Errorf("image failure %s = %+v, error = %v", test.path, result, err)
		}
	}
}

func TestPreviewRejectsNonWebURLs(t *testing.T) {
	service := NewPageService()
	for _, value := range []string{"file:///etc/passwd", "javascript:alert(1)", "--help", "https:///path"} {
		if _, err := service.Image(value); err == nil {
			t.Errorf("Image accepted %q", value)
		}
		if _, err := service.Screenshot(value); err == nil {
			t.Errorf("Screenshot accepted %q", value)
		}
	}
}

func TestPreviewScreenshot(t *testing.T) {
	if _, err := previewBrowser(); err != nil {
		t.Skip("no supported browser installed")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><body style="background:#124455"><h1>Preview capture</h1></body></html>`))
	}))
	defer server.Close()
	data, err := NewPageService().Screenshot(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(data, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	image, err := png.Decode(bytes.NewReader(decoded))
	if err != nil {
		t.Fatal(err)
	}
	if image.Bounds().Dx() != 1000 || image.Bounds().Dy() != 750 {
		t.Fatalf("unexpected capture dimensions: %v", image.Bounds())
	}
	r, g, b, _ := image.At(10, 200).RGBA()
	if r>>8 != 0x12 || g>>8 != 0x44 || b>>8 != 0x55 {
		t.Fatalf("page was not rendered: pixel = %x %x %x", r>>8, g>>8, b>>8)
	}
}
