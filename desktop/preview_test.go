package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPreviewImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/image":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("image"))
		case "/browsers-only":
			// What a host does that turns bots away by their User-Agent.
			if !strings.HasPrefix(r.UserAgent(), "Mozilla/5.0") {
				w.WriteHeader(http.StatusForbidden)
				return
			}
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
	if image, err := service.Image(server.URL + "/browsers-only"); err != nil || image.Error != "" {
		t.Fatalf("image from a host that refuses bots = %+v, error = %v", image, err)
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

func TestRenderedPage(t *testing.T) {
	if _, err := previewBrowser(); err != nil {
		t.Skip("no supported browser installed")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if r.URL.Path == "/share" {
			// A redirect only the browser can follow.
			_, _ = w.Write([]byte(`<html><head><title>Redirecting</title></head><body><script>location.replace('/posts/123')</script></body></html>`))
			return
		}
		if r.URL.Path == "/stalled" {
			// Never answers, as a page behind a hanging request never settles.
			<-r.Context().Done()
			return
		}
		if r.URL.Path == "/agent" {
			_, _ = w.Write([]byte(`<html><head><title>` + r.UserAgent() + `</title></head></html>`))
			return
		}
		// Later than a page merely finishing its load would wait for.
		_, _ = w.Write([]byte(`<html><head><title>Site name</title></head><body><script>setTimeout(() => { document.title = 'Set by script' }, 2500)</script></body></html>`))
	}))
	defer server.Close()
	service := NewPageService()
	page, err := service.Rendered(context.Background(), server.URL+"/share")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(page.HTML, "<title>Set by script</title>") {
		t.Fatalf("scripts did not run before the page was read: %s", page.HTML)
	}
	// Relative links in the HTML belong to where the script redirected to.
	if page.URL != server.URL+"/posts/123" {
		t.Fatalf("url = %q", page.URL)
	}
	// Bot protection refuses a browser that says it is headless.
	if page, err := service.Rendered(context.Background(), server.URL+"/agent"); err != nil || strings.Contains(page.HTML, "Headless") || !strings.Contains(page.HTML, "Chrome/") {
		t.Fatalf("user agent page = %q, error = %v", page.HTML, err)
	}
	// A page nobody is waiting for any more is given up at once, not loaded to the end.
	abandoned, abandon := context.WithCancel(context.Background())
	time.AfterFunc(500*time.Millisecond, abandon)
	started := time.Now()
	if _, err := service.Rendered(abandoned, server.URL+"/stalled"); err == nil {
		t.Error("Rendered returned a page after its caller had gone")
	}
	if waited := time.Since(started); waited > 5*time.Second {
		t.Errorf("Rendered took %v to give up", waited)
	}
	if _, err := service.Rendered(context.Background(), "file:///etc/passwd"); err == nil {
		t.Error("Rendered accepted a non-http URL")
	}
}
