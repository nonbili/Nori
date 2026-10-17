package main

import "os"

// WebKitGTK's DMA-BUF renderer flashes the whole window blank when a dialog
// opens (seen on Wayland with an AMD GPU). The web process reads this when it
// starts, so it is set before Wails creates the webview. A value the user set
// is left alone.
func init() {
	if _, set := os.LookupEnv("WEBKIT_DISABLE_DMABUF_RENDERER"); !set {
		os.Setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
	}
}
