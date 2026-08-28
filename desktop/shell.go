package main

import "github.com/wailsapp/wails/v3/pkg/application"

// ShellService stands in for `browser.tabs.create`: bookmarks and external
// links open in the user's real browser rather than inside the app window.
type ShellService struct{}

func (s *ShellService) OpenURL(url string) error {
	return application.Get().Browser.OpenURL(url)
}
