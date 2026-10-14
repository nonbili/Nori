package main

import "testing"

func TestCloseToTrayPreference(t *testing.T) {
	for state, want := range map[string]bool{
		"":                                      true,
		"not json":                              true,
		`{"preferences":{}}`:                    true,
		`{"preferences":{"closeToTray":true}}`:  true,
		`{"preferences":{"closeToTray":false}}`: false,
		`{"preferences":{"closeToTray":"false"}}`:  true,
		`{"version":1,"preferences":{"theme":""}}`: true,
	} {
		if got := closeToTrayPreference(state); got != want {
			t.Errorf("closeToTrayPreference(%q) = %v, want %v", state, got, want)
		}
	}
}
