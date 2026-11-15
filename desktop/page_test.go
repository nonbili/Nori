package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPageServiceBinaryImageRoundTrip(t *testing.T) {
	// Invalid UTF-8 and more than the HTML bridge's 2 MiB limit.
	image := bytes.Repeat([]byte{0xff, 0xd8, 0x00, 0x80}, 600000)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != "crawler" {
			t.Error("missing crawler header")
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(image)
	}))
	defer server.Close()
	res, err := NewPageService().Fetch(server.URL, "GET", map[string]string{"User-Agent": "crawler"})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	var decoded PageResponse
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	data, err := base64.StdEncoding.DecodeString(decoded.BodyBase64)
	if err != nil || decoded.Body != "" || !bytes.Equal(data, image) {
		t.Fatal("binary image corrupted through JSON bridge")
	}
}

func TestPageServiceRejectsOversizedImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(bytes.Repeat([]byte{0xff}, maxPreviewBytes+1))
	}))
	defer server.Close()
	if _, err := NewPageService().Fetch(server.URL, "GET", nil); err == nil {
		t.Fatal("oversized image must not be silently truncated")
	}
}

func TestPageServicePreservesLargeHTMLPrefix(t *testing.T) {
	html := "<title>Large page</title>" + strings.Repeat("x", maxPageBytes)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(html))
	}))
	defer server.Close()
	res, err := NewPageService().Fetch(server.URL, "GET", nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Body != html[:maxPageBytes] || res.BodyBase64 != "" {
		t.Fatal("large HTML must retain its metadata prefix")
	}
}

func TestPageServiceFetch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != "test-agent" {
			t.Errorf("headers not forwarded: %q", r.Header.Get("User-Agent"))
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method == http.MethodHead {
			return
		}
		w.Write([]byte("<html><head><title>Real Title</title></head></html>"))
	}))
	defer server.Close()

	service := NewPageService()

	res, err := service.Fetch(server.URL, "GET", map[string]string{"User-Agent": "test-agent"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != 200 || !strings.Contains(res.Body, "Real Title") {
		t.Fatalf("unexpected response: %+v", res)
	}
	if !strings.HasPrefix(res.ContentType, "text/html") {
		t.Fatalf("unexpected content type: %q", res.ContentType)
	}

	head, err := service.Fetch(server.URL, "HEAD", map[string]string{"User-Agent": "test-agent"})
	if err != nil {
		t.Fatal(err)
	}
	if head.Status != 200 || head.Body != "" {
		t.Fatalf("unexpected head response: %+v", head)
	}
}

func TestPageServicePreservesRedirectURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/share" {
			http.Redirect(w, r, "/comments/abc123/", http.StatusFound)
			return
		}
		w.Write([]byte("<title>Post</title>"))
	}))
	defer server.Close()

	res, err := NewPageService().Fetch(server.URL+"/share", "GET", nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.URL != server.URL+"/comments/abc123/" {
		t.Fatalf("unexpected resolved URL: %q", res.URL)
	}
}
