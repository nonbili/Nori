package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func fitWindowToScreen(window *application.WebviewWindow, minWidth, minHeight int) {
	screen, err := window.GetScreen()
	if err != nil || screen == nil {
		log.Printf("Could not fit the startup window: screen unavailable (%v)", err)
		return
	}
	workArea := screen.PhysicalWorkArea
	if workArea.Width <= 0 || workArea.Height <= 0 || screen.ScaleFactor <= 0 {
		log.Print("Could not fit the startup window: invalid screen geometry")
		return
	}

	// Bounds include the title bar and borders. Keep both rectangles in
	// physical pixels to avoid rounding and mixed-DPI monitor conversions.
	bounds := fitWindowBounds(window.PhysicalBounds(), workArea)
	// On unusually small work areas, the normal minimum size must not prevent
	// the native window from fitting. Wails size constraints use logical pixels.
	window.SetMinSize(
		min(minWidth, int(float64(workArea.Width)/float64(screen.ScaleFactor))),
		min(minHeight, int(float64(workArea.Height)/float64(screen.ScaleFactor))),
	)
	window.SetPhysicalBounds(bounds)
}

func fitWindowBounds(bounds, workArea application.Rect) application.Rect {
	bounds.Width = min(bounds.Width, workArea.Width)
	bounds.Height = min(bounds.Height, workArea.Height)
	bounds.X = workArea.X + (workArea.Width-bounds.Width)/2
	bounds.Y = workArea.Y + (workArea.Height-bounds.Height)/2
	return bounds
}
