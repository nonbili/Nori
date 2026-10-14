package main

import "github.com/godbus/dbus/v5"

// trayShown reports whether the desktop has somewhere to show the icon. Not
// every one does: GNOME needs an extension for it. A window hidden there would
// have no way back, so closing it quits as it always has.
func trayShown() bool {
	conn, err := dbus.SessionBus()
	if err != nil {
		return false
	}
	var owned bool
	err = conn.BusObject().Call("org.freedesktop.DBus.NameHasOwner", 0, "org.kde.StatusNotifierWatcher").Store(&owned)
	return err == nil && owned
}
