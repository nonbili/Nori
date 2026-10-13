package main

import (
	"io"
	"net/http"
	"sync"
	"time"
)

// Responses are only ever parsed for <title>/og:title, a cover image and a
// favicon link, all of which live in <head>, so there is no reason to pull a
// whole page across. The head is not always near the top, though: Google Play
// puts some 900 KB of inline script ahead of its meta tags, and at the old
// 512 KB cap such a page had no title or cover image at all.
const maxPageBytes = 2 * 1024 * 1024

// PageService fetches other sites' HTML for the shared bookmark metadata code.
// The webview is a normal web origin, so its own `fetch` is blocked by CORS;
// the extension gets the same reach from its host permissions.
type PageService struct {
	client *http.Client

	liveMu sync.Mutex
	live   *livePage
}

func NewPageService() *PageService {
	return &PageService{client: &http.Client{Timeout: 15 * time.Second}}
}

// PageResponse mirrors the sliver of `Response` the frontend rebuilds.
type PageResponse struct {
	URL         string `json:"url"`
	Status      int    `json:"status"`
	ContentType string `json:"contentType"`
	Body        string `json:"body"`
}

func (s *PageService) Fetch(url string, method string, headers map[string]string) (PageResponse, error) {
	if method != http.MethodHead {
		method = http.MethodGet
	}

	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return PageResponse{}, err
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	res, err := s.client.Do(req)
	if err != nil {
		return PageResponse{}, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(io.LimitReader(res.Body, maxPageBytes))
	if err != nil {
		return PageResponse{}, err
	}

	return PageResponse{
		URL:         res.Request.URL.String(),
		Status:      res.StatusCode,
		ContentType: res.Header.Get("Content-Type"),
		Body:        string(body),
	}, nil
}
