package main

import (
	_ "embed"
	"encoding/json"
	"runtime"
	"sync"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed build/trayicon.png
var trayIcon []byte

// macOS tints a template image to suit the menu bar, light or dark.
//
//go:embed build/trayicon-template.png
var trayTemplateIcon []byte

// The frontend keeps its preferences in the store under this key.
const stateKey = "nori-state"

// tray is the app's icon in the notification area, and what closing the window
// means while it is there: the window hides and the app stays open behind the
// icon, so it need not hold a place on the taskbar.
type tray struct {
	app   *application.App
	store *StoreService

	mu     sync.Mutex
	window application.Window

	quitting atomic.Bool
}

func newTray(app *application.App, store *StoreService) *tray {
	t := &tray{app: app, store: store}

	menu := app.NewMenu()
	menu.Add("Show Nori").OnClick(func(*application.Context) { t.show() })
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(*application.Context) { t.quit() })

	icon := app.SystemTray.New().SetMenu(menu)
	icon.SetTooltip("Nori")
	if runtime.GOOS == "darwin" {
		// A click on a menu bar icon opens its menu there, which is left as it is.
		icon.SetTemplateIcon(trayTemplateIcon)
		// The Dock icon is the other way back to a window that was closed.
		app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) { t.show() })
	} else {
		icon.SetIcon(trayIcon)
		icon.OnClick(t.toggle)
	}
	app.OnShutdown(func() { t.quitting.Store(true) })
	return t
}

// adopt makes closing the window hide it instead, for as long as that is wanted.
func (t *tray) adopt(window application.Window) {
	t.mu.Lock()
	t.window = window
	t.mu.Unlock()
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if t.closesToTray() {
			event.Cancel()
			window.Hide()
		}
	})
}

func (t *tray) current() application.Window {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.window
}

func (t *tray) show() {
	window := t.current()
	if window == nil {
		return
	}
	if window.IsMinimised() {
		window.UnMinimise()
	}
	window.Show().Focus()
}

func (t *tray) toggle() {
	window := t.current()
	if window == nil {
		return
	}
	if window.IsVisible() && !window.IsMinimised() {
		window.Hide()
	} else {
		t.show()
	}
}

func (t *tray) quit() {
	t.quitting.Store(true)
	t.app.Quit()
}

// closesToTray is asked each time the window is closed: the setting can change
// while the app runs, and so can whether the desktop has anywhere to show the icon.
func (t *tray) closesToTray() bool {
	if t.quitting.Load() || !trayShown() {
		return false
	}
	raw, err := t.store.Get(stateKey)
	if err != nil {
		return true
	}
	return closeToTrayPreference(raw)
}

// closeToTrayPreference reads the setting out of the frontend's saved state. It
// is on unless it was turned off, as it is for state saved before it existed.
func closeToTrayPreference(state string) bool {
	var stored struct {
		Preferences struct {
			CloseToTray *bool `json:"closeToTray"`
		} `json:"preferences"`
	}
	if json.Unmarshal([]byte(state), &stored) != nil || stored.Preferences.CloseToTray == nil {
		return true
	}
	return *stored.Preferences.CloseToTray
}
