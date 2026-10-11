package main

import (
	"embed"
	"log"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// The frontend is a Vite build of the shared Nori UI (see frontend/).
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	restageUpdate()

	store, err := NewStoreService()
	if err != nil {
		log.Fatal(err)
	}
	auth := NewAuthService()

	app := application.New(application.Options{
		Name:        "Nori",
		Description: "Beautiful bookmark manager and launcher",
		Services: []application.Service{
			application.NewService(store),
			application.NewService(auth),
			application.NewService(&ShellService{}),
			application.NewService(NewPageService()),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	windowOptions := application.WebviewWindowOptions{
		Name:             "main",
		Title:            "Nori",
		Width:            520,
		Height:           940,
		MinWidth:         380,
		MinHeight:        520,
		URL:              "/",
		DevToolsEnabled:  true,
		BackgroundColour: application.RGBA{Red: 245, Green: 245, Blue: 244, Alpha: 255},
	}
	if runtime.GOOS == "windows" {
		// Screen information is available after the native app starts. Create
		// the window hidden so its native frame can be fitted before showing it.
		windowOptions.Hidden = true
		app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
			window := app.Window.NewWithOptions(windowOptions)
			fitWindowToScreen(window, windowOptions.MinWidth, windowOptions.MinHeight)
			window.Show()
		})
	} else {
		app.Window.NewWithOptions(windowOptions)
	}

	initUpdater(app)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
