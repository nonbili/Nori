package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const authTimeout = 5 * time.Minute

const authDonePage = `<!doctype html><meta charset="utf-8"><title>Nori</title>
<body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#fafaf9;color:#1c1917">
<p>Signed in to Nori. You can close this tab.</p>`

// AuthService replaces the extension's `browser.identity` web auth flow. The
// hosted sign-in page needs somewhere to redirect back to, so we run a
// loopback HTTP listener and hand its URL out as the redirect_uri.
type AuthService struct {
	mu       sync.Mutex
	listener net.Listener
	server   *http.Server
	pending  chan string
}

func NewAuthService() *AuthService {
	return &AuthService{}
}

// start brings the loopback listener up on first use and keeps it for the
// lifetime of the app, so the redirect URI stays stable across sign-in
// attempts within a session.
func (a *AuthService) start() error {
	if a.listener != nil {
		return nil
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", a.handleCallback)
	a.listener = listener
	a.server = &http.Server{Handler: mux}
	go func() { _ = a.server.Serve(listener) }()
	return nil
}

func (a *AuthService) handleCallback(writer http.ResponseWriter, request *http.Request) {
	a.mu.Lock()
	pending := a.pending
	a.pending = nil
	address := a.listener.Addr().String()
	a.mu.Unlock()

	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = writer.Write([]byte(authDonePage))

	if pending != nil {
		pending <- fmt.Sprintf("http://%s%s", address, request.URL.RequestURI())
	}
}

// RedirectURL mirrors `browser.identity.getRedirectURL()`: the base the hosted
// sign-in page redirects back to. Any path under it completes the flow.
func (a *AuthService) RedirectURL() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.start(); err != nil {
		return "", err
	}
	return fmt.Sprintf("http://%s", a.listener.Addr().String()), nil
}

// LaunchWebAuthFlow mirrors `browser.identity.launchWebAuthFlow()`: it opens
// the hosted sign-in page in the system browser and resolves with the callback
// URL the page redirects to.
func (a *AuthService) LaunchWebAuthFlow(authURL string) (string, error) {
	a.mu.Lock()
	if err := a.start(); err != nil {
		a.mu.Unlock()
		return "", err
	}
	// A second attempt supersedes any flow the user walked away from.
	if a.pending != nil {
		close(a.pending)
	}
	pending := make(chan string, 1)
	a.pending = pending
	a.mu.Unlock()

	if err := application.Get().Browser.OpenURL(authURL); err != nil {
		return "", err
	}

	select {
	case callback, ok := <-pending:
		if !ok {
			return "", errors.New("Sign-in was cancelled")
		}
		return callback, nil
	case <-time.After(authTimeout):
		a.mu.Lock()
		if a.pending == pending {
			a.pending = nil
		}
		a.mu.Unlock()
		return "", errors.New("Sign-in timed out")
	}
}

func (a *AuthService) ServiceShutdown() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.server == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	return a.server.Shutdown(ctx)
}
