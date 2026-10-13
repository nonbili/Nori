package main

import (
	"bytes"
	"encoding/base64"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLivePage(t *testing.T) {
	if _, err := previewBrowser(); err != nil {
		t.Skip(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<!doctype html><title>Live</title><body style="margin:0"><div style="height:5000px">tall</div>
<input id="field" style="position:fixed;top:0;left:0;width:200px;height:40px">
<script>
addEventListener('scroll', () => { document.body.dataset.scrolled = scrollY > 0 ? 'yes' : 'no' })
field.addEventListener('input', () => { document.body.dataset.typed = field.value })
</script>`))
	}))
	defer server.Close()
	service := NewPageService()
	defer service.ServiceShutdown()

	id, err := service.LiveOpen(server.URL, 400, 300)
	if err != nil {
		t.Fatal(err)
	}
	// Each change is waited for rather than slept through.
	seq, image := 0, ""
	wait := func(what string, reached func(LiveFrame) bool) {
		t.Helper()
		deadline := time.Now().Add(20 * time.Second)
		for time.Now().Before(deadline) {
			frame, err := service.LiveFrame(id, seq)
			if err != nil || frame.Closed {
				t.Fatalf("%s: frame = %+v, error = %v", what, frame, err)
			}
			seq = frame.Seq
			if frame.Image != "" {
				image = frame.Image
			}
			if reached(frame) {
				return
			}
		}
		t.Fatalf("%s: timed out", what)
	}
	document := func() string {
		t.Helper()
		page, err := service.LiveRead(id)
		if err != nil {
			t.Fatal(err)
		}
		return page.HTML
	}
	wait("load", func(frame LiveFrame) bool {
		return !frame.Loading && image != "" && strings.Contains(document(), "tall")
	})

	if err := service.LiveInput(id, LiveInput{Type: "mouseWheel", X: 200, Y: 150, DeltaY: 400}); err != nil {
		t.Fatal(err)
	}
	wait("scroll", func(LiveFrame) bool { return strings.Contains(document(), `data-scrolled="yes"`) })

	for _, input := range []LiveInput{
		{Type: "mousePressed", X: 50, Y: 20, Button: "left", Buttons: 1, ClickCount: 1},
		{Type: "mouseReleased", X: 50, Y: 20, Button: "left", ClickCount: 1},
		{Type: "keyDown", Key: "a", Code: "KeyA", Text: "a", KeyCode: 65},
		{Type: "keyUp", Key: "a", Code: "KeyA", KeyCode: 65},
	} {
		if err := service.LiveInput(id, input); err != nil {
			t.Fatal(err)
		}
	}
	wait("type", func(LiveFrame) bool { return strings.Contains(document(), `data-typed="a"`) })

	shot, err := service.LiveCapture(id)
	if err != nil {
		t.Fatal(err)
	}
	body, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(shot, "data:image/jpeg;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(body))
	if err != nil || config.Width != 400*liveScale || config.Height != 300*liveScale {
		t.Fatalf("capture = %dx%d, error = %v", config.Width, config.Height, err)
	}

	service.LiveClose(id)
	if frame, _ := service.LiveFrame(id, seq); !frame.Closed {
		t.Errorf("frame after close = %+v", frame)
	}
	if err := service.LiveInput(id, LiveInput{Type: "mouseMoved"}); err == nil {
		t.Error("input accepted after close")
	}
	if _, err := service.LiveOpen("file:///etc/passwd", 400, 300); err == nil {
		t.Error("LiveOpen accepted a non-http URL")
	}
}
