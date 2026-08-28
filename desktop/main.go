package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The frontend is a Vite build of the shared Nori UI (see frontend/).
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
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

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "Nori",
		Width:            520,
		Height:           940,
		MinWidth:         380,
		MinHeight:        520,
		URL:              "/",
		DevToolsEnabled:  true,
		BackgroundColour: application.RGBA{Red: 245, Green: 245, Blue: 244, Alpha: 255},
	})

	initUpdater(app)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
