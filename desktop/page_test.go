package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
