//go:build !linux

package main

// trayShown reports whether the desktop has somewhere to show the icon, which
// Windows and macOS always do.
func trayShown() bool { return true }
