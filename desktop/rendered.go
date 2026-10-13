package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// RenderedPage is a page's HTML after its scripts have run, and the address
// that document ended up at, which relative links in the HTML resolve against.
type RenderedPage struct {
	URL  string `json:"url"`
	HTML string `json:"html"`
}

const (
	renderedLoadTimeout = 15 * time.Second
	// The app's WebView resolver gives a page up to five seconds to hydrate.
	renderedBudget      = 5 * time.Second
	browserStartTimeout = 15 * time.Second
)

type cdpMessage struct {
	ID     int             `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

// cdpClient speaks just enough of the Chrome DevTools Protocol to load one
// page and read it back.
type cdpClient struct {
	conn     *websocket.Conn
	messages chan cdpMessage
	next     int
	onEvent  func(cdpMessage)
}

func dialCDP(ctx context.Context, endpoint string) (*cdpClient, error) {
	// Only the handshake is bounded: the connection itself lives as long as ctx.
	dialing, stop := context.WithTimeout(ctx, browserStartTimeout)
	defer stop()
	conn, _, err := websocket.Dial(dialing, endpoint, nil)
	if err != nil {
		return nil, err
	}
	// A whole document comes back in one message.
	conn.SetReadLimit(-1)
	client := &cdpClient{conn: conn, messages: make(chan cdpMessage, 64)}
	go func() {
		defer close(client.messages)
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			var message cdpMessage
			if json.Unmarshal(data, &message) != nil {
				continue
			}
			select {
			case client.messages <- message:
			case <-ctx.Done():
				return
			}
		}
	}()
	return client, nil
}

func (c *cdpClient) dispatch(message cdpMessage) {
	if message.Method != "" && c.onEvent != nil {
		c.onEvent(message)
	}
}

// send writes a command without waiting for its reply, which call then drops as
// an answer nobody asked for.
func (c *cdpClient) send(ctx context.Context, session string, method string, params any) (int, error) {
	c.next++
	id := c.next
	body, err := json.Marshal(map[string]any{"id": id, "method": method, "params": params, "sessionId": session})
	if session == "" {
		body, err = json.Marshal(map[string]any{"id": id, "method": method, "params": params})
	}
	if err != nil {
		return 0, err
	}
	return id, c.conn.Write(ctx, websocket.MessageText, body)
}

// call sends a command and waits for its reply, handing over any events that
// arrive first.
func (c *cdpClient) call(ctx context.Context, session string, method string, params any) (json.RawMessage, error) {
	id, err := c.send(ctx, session, method, params)
	if err != nil {
		return nil, err
	}
	for {
		select {
		case message, ok := <-c.messages:
			if !ok {
				return nil, errors.New("browser closed the connection")
			}
			if message.ID != id {
				c.dispatch(message)
				continue
			}
			if message.Error != nil {
				return nil, fmt.Errorf("%s: %s", method, message.Error.Message)
			}
			return message.Result, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

// pump handles events for the given time. It reports false once the browser is gone.
func (c *cdpClient) pump(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	for {
		select {
		case message, ok := <-c.messages:
			if !ok {
				return false
			}
			c.dispatch(message)
		case <-timer.C:
			return true
		case <-ctx.Done():
			return false
		}
	}
}

// devToolsEndpoint waits for the browser to publish the port it picked.
func devToolsEndpoint(ctx context.Context, profile string) (string, error) {
	ctx, stop := context.WithTimeout(ctx, browserStartTimeout)
	defer stop()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		if body, err := os.ReadFile(filepath.Join(profile, "DevToolsActivePort")); err == nil {
			if lines := strings.Split(strings.TrimSpace(string(body)), "\n"); len(lines) >= 2 && lines[0] != "" {
				return "ws://127.0.0.1:" + strings.TrimSpace(lines[0]) + strings.TrimSpace(lines[1]), nil
			}
		}
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return "", errors.New("browser did not start")
		}
	}
}

// headlessPage is a throwaway headless browser with one blank page attached.
type headlessPage struct {
	client  *cdpClient
	session string
	// close quits the browser and removes its profile.
	close func()
}

// openHeadlessPage starts a browser that lives until ctx ends or close is
// called. It shares Screenshot's isolation: a throwaway profile in a temporary
// directory, never the user's own.
func openHeadlessPage(ctx context.Context, cancel context.CancelFunc) (*headlessPage, error) {
	browser, err := previewBrowser()
	if err != nil {
		return nil, err
	}
	directory, err := os.MkdirTemp("", "nori-rendered-")
	if err != nil {
		return nil, err
	}
	profile := filepath.Join(directory, "profile")
	cmd := exec.CommandContext(ctx, browser,
		"--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
		"--user-data-dir="+profile, "--remote-debugging-port=0", "about:blank")
	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(directory)
		return nil, err
	}
	page := &headlessPage{}
	// Ask the browser to quit before falling back to killing it: a killed
	// browser's child processes can still be writing to the profile, and the
	// directory then outlives the removal below.
	page.close = func() {
		exited := make(chan struct{})
		go func() {
			_ = cmd.Wait()
			close(exited)
		}()
		if page.client != nil && ctx.Err() == nil {
			// Bounded as a whole: a browser that has stopped answering never
			// replies, and ctx may have no deadline of its own.
			closing, stop := context.WithTimeout(ctx, 3*time.Second)
			_, _ = page.client.call(closing, "", "Browser.close", map[string]any{})
			select {
			case <-exited:
			case <-closing.Done():
			}
			stop()
		}
		cancel()
		<-exited
		if page.client != nil {
			_ = page.client.conn.CloseNow()
		}
		for attempt := 0; attempt < 5 && os.RemoveAll(directory) != nil; attempt++ {
			time.Sleep(100 * time.Millisecond)
		}
	}

	endpoint, err := devToolsEndpoint(ctx, profile)
	if err != nil {
		page.close()
		return nil, err
	}
	client, err := dialCDP(ctx, endpoint)
	if err != nil {
		page.close()
		return nil, err
	}
	page.client = client

	var target struct {
		TargetID string `json:"targetId"`
	}
	result, err := client.call(ctx, "", "Target.createTarget", map[string]any{"url": "about:blank"})
	if err != nil || json.Unmarshal(result, &target) != nil {
		page.close()
		return nil, fmt.Errorf("could not open a page: %w", err)
	}
	var attached struct {
		SessionID string `json:"sessionId"`
	}
	result, err = client.call(ctx, "", "Target.attachToTarget", map[string]any{"targetId": target.TargetID, "flatten": true})
	if err != nil || json.Unmarshal(result, &attached) != nil {
		page.close()
		return nil, fmt.Errorf("could not attach to the page: %w", err)
	}
	page.session = attached.SessionID
	return page, nil
}

// document reads the page's HTML and its address from the same document: a
// script may have redirected, and only the browser knows where to.
func (p *headlessPage) document(ctx context.Context) (RenderedPage, error) {
	expression := fmt.Sprintf("JSON.stringify({url: location.href, html: document.documentElement.outerHTML.slice(0, %d)})", maxPageBytes)
	var evaluated struct {
		Result struct {
			Value string `json:"value"`
		} `json:"result"`
	}
	result, err := p.client.call(ctx, p.session, "Runtime.evaluate", map[string]any{"expression": expression, "returnByValue": true})
	if err != nil {
		return RenderedPage{}, err
	}
	var page RenderedPage
	if json.Unmarshal(result, &evaluated) != nil || json.Unmarshal([]byte(evaluated.Result.Value), &page) != nil || page.HTML == "" {
		return RenderedPage{}, errors.New("rendered page was empty")
	}
	return page, nil
}

// Rendered returns the page's HTML after its scripts have run, for sites whose
// title only exists once they have.
//
// The page is driven over the DevTools protocol rather than --dump-dom so the
// HTML and its address are read from the same document.
func (s *PageService) Rendered(value string) (RenderedPage, error) {
	if err := previewURL(value); err != nil {
		return RenderedPage{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	browser, err := openHeadlessPage(ctx, cancel)
	if err != nil {
		return RenderedPage{}, err
	}
	defer browser.close()
	client, session := browser.client, browser.session

	// Scripts get renderedBudget of the page's own time before it is read, which
	// the browser fast-forwards through: a title set by a timer two seconds in is
	// there without two seconds passing, and the clock stops while requests are
	// still in flight. The page is frozen once the budget is spent, so the title
	// and address read below cannot change underneath the read. A script redirect
	// is just more of the same budget, spent in the page it leads to.
	expired := false
	client.onEvent = func(message cdpMessage) {
		if message.Method == "Emulation.virtualTimeBudgetExpired" {
			expired = true
		}
	}
	if _, err := client.call(ctx, session, "Page.enable", map[string]any{}); err != nil {
		return RenderedPage{}, err
	}
	if _, err := client.call(ctx, session, "Page.navigate", map[string]any{"url": value}); err != nil {
		return RenderedPage{}, err
	}
	// Started once the navigation has committed: set any earlier, the budget is
	// spent on the blank page before this one begins.
	if _, err := client.call(ctx, session, "Emulation.setVirtualTimePolicy", map[string]any{
		"policy": "pauseIfNetworkFetchesPending",
		"budget": renderedBudget.Milliseconds(),
	}); err != nil {
		return RenderedPage{}, err
	}
	// A page that keeps the clock stopped (a request that never answers) is read
	// as it stands when the real time is up.
	deadline := time.Now().Add(renderedLoadTimeout)
	for !expired && time.Now().Before(deadline) {
		if !client.pump(ctx, 50*time.Millisecond) {
			return RenderedPage{}, errors.New("browser closed before the page loaded")
		}
	}

	return browser.document(ctx)
}
