package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

const (
	liveCallTimeout = 10 * time.Second
	// How long LiveFrame holds a request open when the page has not changed.
	liveFrameWait = 20 * time.Second
	// The window asks for frames for as long as it shows the page. Once it has
	// stopped asking (closed, reloaded, crashed), the browser is not left running.
	liveAbandoned = time.Minute
	// Frames and the capture are twice the layout size, so a small frame in the
	// window still saves a sharp image.
	liveScale = 2
)

var errLiveClosed = errors.New("preview page is closed")

// LiveFrame is what the page looks like now. Image is empty when it has not
// changed since the frame the caller already has.
type LiveFrame struct {
	Seq     int    `json:"seq"`
	Image   string `json:"image"`
	Loading bool   `json:"loading"`
	Closed  bool   `json:"closed"`
}

// LiveInput is a mouse or key event to replay in the page, named as the
// DevTools protocol names them.
type LiveInput struct {
	Type       string  `json:"type"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	DeltaX     float64 `json:"deltaX"`
	DeltaY     float64 `json:"deltaY"`
	Button     string  `json:"button"`
	Buttons    int     `json:"buttons"`
	ClickCount int     `json:"clickCount"`
	Modifiers  int     `json:"modifiers"`
	Key        string  `json:"key"`
	Code       string  `json:"code"`
	Text       string  `json:"text"`
	KeyCode    int     `json:"keyCode"`
}

// livePage is a page kept open in a headless browser for the user to scroll and
// click through before capturing it. The browser has no window of its own: its
// frames are shown in the app's window, which sends the input back.
type livePage struct {
	id      string
	ctx     context.Context
	browser *headlessPage
	// The DevTools connection is used from one goroutine, so everything done to
	// the page is queued here and run by that goroutine between events.
	commands chan func()
	quit     chan struct{}
	quitOnce sync.Once
	done     chan struct{}
	seen     atomic.Int64

	mu        sync.Mutex
	seq       int
	image     string
	imageSeq  int
	loading   bool
	changed   chan struct{}
	mainFrame string
}

func (p *livePage) update(change func()) {
	p.mu.Lock()
	change()
	p.seq++
	close(p.changed)
	p.changed = make(chan struct{})
	p.mu.Unlock()
}

func (p *livePage) onEvent(message cdpMessage) {
	switch message.Method {
	case "Page.screencastFrame":
		var frame struct {
			Data      string `json:"data"`
			SessionID int    `json:"sessionId"`
		}
		if json.Unmarshal(message.Params, &frame) != nil {
			return
		}
		// The browser holds the next frame back until this one is acknowledged.
		_, _ = p.browser.client.send(p.ctx, p.browser.session, "Page.screencastFrameAck", map[string]any{"sessionId": frame.SessionID})
		p.update(func() {
			p.image = "data:image/jpeg;base64," + frame.Data
			p.imageSeq = p.seq + 1
		})
	case "Page.frameStartedLoading", "Page.frameStoppedLoading":
		var frame struct {
			FrameID string `json:"frameId"`
		}
		if json.Unmarshal(message.Params, &frame) != nil || frame.FrameID != p.mainFrame {
			return
		}
		p.update(func() { p.loading = message.Method == "Page.frameStartedLoading" })
	}
}

func (p *livePage) call(method string, params any) (json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(p.ctx, liveCallTimeout)
	defer cancel()
	return p.browser.client.call(ctx, p.browser.session, method, params)
}

// do runs a command on the page's goroutine and waits for it.
func (p *livePage) do(command func() error) error {
	result := make(chan error, 1)
	select {
	case p.commands <- func() { result <- command() }:
	case <-p.done:
		return errLiveClosed
	}
	select {
	case err := <-result:
		return err
	case <-p.done:
		return errLiveClosed
	}
}

func (p *livePage) run() {
	defer close(p.done)
	defer p.browser.close()
	abandoned := time.NewTicker(liveAbandoned / 4)
	defer abandoned.Stop()
	for {
		select {
		case command := <-p.commands:
			command()
		case message, ok := <-p.browser.client.messages:
			if !ok {
				return
			}
			p.browser.client.dispatch(message)
		case <-abandoned.C:
			if time.Since(time.UnixMilli(p.seen.Load())) > liveAbandoned {
				return
			}
		case <-p.quit:
			return
		}
	}
}

func (p *livePage) stop() {
	p.quitOnce.Do(func() { close(p.quit) })
	<-p.done
}

func liveSize(width, height int) map[string]any {
	return map[string]any{
		"width":             min(max(width, 240), 1920),
		"height":            min(max(height, 160), 1920),
		"deviceScaleFactor": liveScale,
		"mobile":            false,
	}
}

func (s *PageService) livePage(id string) (*livePage, error) {
	s.liveMu.Lock()
	defer s.liveMu.Unlock()
	if s.live == nil || s.live.id != id {
		return nil, errLiveClosed
	}
	return s.live, nil
}

// LiveOpen loads a page for the user to interact with and returns the handle the
// other Live methods take. Only one is open at a time: opening another closes it.
func (s *PageService) LiveOpen(value string, width, height int) (string, error) {
	if err := previewURL(value); err != nil {
		return "", err
	}
	s.liveMu.Lock()
	defer s.liveMu.Unlock()
	if s.live != nil {
		s.live.stop()
		s.live = nil
	}
	token := make([]byte, 8)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	ctx, cancel := context.WithCancel(context.Background())
	browser, err := openHeadlessPage(ctx, cancel)
	if err != nil {
		cancel()
		return "", err
	}
	page := &livePage{
		id:       hex.EncodeToString(token),
		ctx:      ctx,
		browser:  browser,
		commands: make(chan func()),
		quit:     make(chan struct{}),
		done:     make(chan struct{}),
		changed:  make(chan struct{}),
		loading:  true,
	}
	page.seen.Store(time.Now().UnixMilli())
	browser.client.onEvent = page.onEvent

	fail := func(err error) (string, error) {
		browser.close()
		return "", err
	}
	var tree struct {
		FrameTree struct {
			Frame struct {
				ID string `json:"id"`
			} `json:"frame"`
		} `json:"frameTree"`
	}
	if result, err := page.call("Page.getFrameTree", map[string]any{}); err != nil || json.Unmarshal(result, &tree) != nil {
		return fail(errors.New("could not read the page"))
	}
	page.mainFrame = tree.FrameTree.Frame.ID
	for _, setup := range []struct {
		method string
		params map[string]any
	}{
		{"Page.enable", map[string]any{}},
		{"Emulation.setDeviceMetricsOverride", liveSize(width, height)},
		// Without it a page nobody is looking at ignores the keys typed into it.
		{"Emulation.setFocusEmulationEnabled", map[string]any{"enabled": true}},
		{"Page.startScreencast", map[string]any{"format": "jpeg", "quality": 70}},
	} {
		if _, err := page.call(setup.method, setup.params); err != nil {
			return fail(err)
		}
	}
	// Sent, not awaited: the reply only comes once the site has answered, and the
	// window shows the page loading in the meantime.
	if _, err := browser.client.send(ctx, browser.session, "Page.navigate", map[string]any{"url": value}); err != nil {
		return fail(err)
	}
	go page.run()
	s.live = page
	return page.id, nil
}

// LiveFrame waits for the page to change from the frame numbered seq.
func (s *PageService) LiveFrame(id string, seq int) (LiveFrame, error) {
	page, err := s.livePage(id)
	if err != nil {
		return LiveFrame{Closed: true}, nil
	}
	page.seen.Store(time.Now().UnixMilli())
	timer := time.NewTimer(liveFrameWait)
	defer timer.Stop()
	for {
		page.mu.Lock()
		frame := LiveFrame{Seq: page.seq, Loading: page.loading}
		if page.imageSeq > seq {
			frame.Image = page.image
		}
		changed := page.changed
		page.mu.Unlock()
		if frame.Seq != seq {
			return frame, nil
		}
		select {
		case <-changed:
		case <-timer.C:
			return frame, nil
		case <-page.done:
			return LiveFrame{Closed: true}, nil
		}
	}
}

var liveMouseTypes = map[string]bool{"mousePressed": true, "mouseReleased": true, "mouseMoved": true, "mouseWheel": true}

// LiveInput replays a mouse or key event in the page.
func (s *PageService) LiveInput(id string, input LiveInput) error {
	page, err := s.livePage(id)
	if err != nil {
		return err
	}
	method := "Input.dispatchMouseEvent"
	params := map[string]any{"type": input.Type, "modifiers": input.Modifiers}
	switch {
	case liveMouseTypes[input.Type]:
		params["x"], params["y"] = input.X, input.Y
		params["buttons"] = input.Buttons
		if input.Type == "mouseWheel" {
			params["deltaX"], params["deltaY"] = input.DeltaX, input.DeltaY
		} else {
			button := input.Button
			if button != "left" && button != "middle" && button != "right" {
				button = "none"
			}
			params["button"], params["clickCount"] = button, input.ClickCount
		}
	case input.Type == "keyDown" || input.Type == "keyUp":
		method = "Input.dispatchKeyEvent"
		params["key"], params["code"] = input.Key, input.Code
		params["windowsVirtualKeyCode"] = input.KeyCode
		if input.Type == "keyDown" {
			// Only a key press that carries text types it.
			if input.Text == "" {
				params["type"] = "rawKeyDown"
			} else {
				params["text"] = input.Text
			}
		}
	default:
		return errors.New("unknown input type")
	}
	// Not awaited: the browser answers a wheel event only once the page has
	// scrolled, and the next one should not wait for that.
	return page.do(func() error {
		_, err := page.browser.client.send(page.ctx, page.browser.session, method, params)
		return err
	})
}

// LiveResize lays the page out again for a frame whose size has changed.
func (s *PageService) LiveResize(id string, width, height int) error {
	page, err := s.livePage(id)
	if err != nil {
		return err
	}
	return page.do(func() error {
		_, err := page.call("Emulation.setDeviceMetricsOverride", liveSize(width, height))
		return err
	})
}

func (s *PageService) LiveReload(id string) error {
	page, err := s.livePage(id)
	if err != nil {
		return err
	}
	return page.do(func() error {
		_, err := page.call("Page.reload", map[string]any{})
		return err
	})
}

// LiveRead returns the page's HTML as it stands, for its title and cover image.
func (s *PageService) LiveRead(id string) (RenderedPage, error) {
	page, err := s.livePage(id)
	if err != nil {
		return RenderedPage{}, err
	}
	var document RenderedPage
	err = page.do(func() error {
		ctx, cancel := context.WithTimeout(page.ctx, liveCallTimeout)
		defer cancel()
		var err error
		document, err = page.browser.document(ctx)
		return err
	})
	return document, err
}

// LiveCapture returns what the page is showing as an image.
func (s *PageService) LiveCapture(id string) (string, error) {
	page, err := s.livePage(id)
	if err != nil {
		return "", err
	}
	var shot struct {
		Data string `json:"data"`
	}
	err = page.do(func() error {
		result, err := page.call("Page.captureScreenshot", map[string]any{"format": "jpeg", "quality": 80})
		if err != nil {
			return err
		}
		return json.Unmarshal(result, &shot)
	})
	if err != nil {
		return "", err
	}
	if shot.Data == "" || len(shot.Data)/4*3 > maxPreviewBytes {
		return "", errors.New("preview image too large")
	}
	return "data:image/jpeg;base64," + shot.Data, nil
}

func (s *PageService) LiveClose(id string) {
	s.liveMu.Lock()
	defer s.liveMu.Unlock()
	if s.live != nil && s.live.id == id {
		s.live.stop()
		s.live = nil
	}
}

// ServiceShutdown keeps a page left open from outliving the app.
func (s *PageService) ServiceShutdown() error {
	s.liveMu.Lock()
	defer s.liveMu.Unlock()
	if s.live != nil {
		s.live.stop()
		s.live = nil
	}
	return nil
}
