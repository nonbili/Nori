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
	runUpdateHelper()

	store, err := NewStoreService()
	if err != nil {
		log.Fatal(err)
	}
	auth := NewAuthService()

	var icon *tray
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
		// The app can be open with no window to show for it, and two copies would
		// write over each other's saved state: starting it again brings back the one
		// already running.
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "jp.nonbili.nori",
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if icon != nil {
					icon.show()
				}
			},
		},
	})
	icon = newTray(app, store)
	app.RegisterService(application.NewService(&TrayService{tray: icon}))

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
			icon.adopt(window)
			fitWindowToScreen(window, windowOptions.MinWidth, windowOptions.MinHeight)
			window.Show()
		})
	} else {
		icon.adopt(app.Window.NewWithOptions(windowOptions))
	}

	initUpdater(app)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
