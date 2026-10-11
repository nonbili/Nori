package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestFitWindowBounds(t *testing.T) {
	for _, test := range []struct {
		name     string
		bounds   application.Rect
		workArea application.Rect
		want     application.Rect
	}{
		{
			name:     "large screen preserves preferred size",
			bounds:   application.Rect{Width: 520, Height: 940},
			workArea: application.Rect{Width: 1920, Height: 1040},
			want:     application.Rect{X: 700, Y: 50, Width: 520, Height: 940},
		},
		{
			name:     "short screen keeps title bar on screen",
			bounds:   application.Rect{X: 423, Y: -106, Width: 520, Height: 940},
			workArea: application.Rect{Width: 1366, Height: 728},
			want:     application.Rect{X: 423, Width: 520, Height: 728},
		},
		{
			name:     "150 percent scaling with top taskbar",
			bounds:   application.Rect{Width: 780, Height: 1410},
			workArea: application.Rect{Y: 60, Width: 1920, Height: 1020},
			want:     application.Rect{X: 570, Y: 60, Width: 780, Height: 1020},
		},
		{
			name:     "secondary monitor above and left of primary",
			bounds:   application.Rect{X: -950, Y: -1086, Width: 520, Height: 940},
			workArea: application.Rect{X: -1366, Y: -980, Width: 1366, Height: 728},
			want:     application.Rect{X: -943, Y: -980, Width: 520, Height: 728},
		},
		{
			name:     "work area smaller than both preferred dimensions",
			bounds:   application.Rect{Width: 520, Height: 940},
			workArea: application.Rect{X: 40, Y: 20, Width: 360, Height: 480},
			want:     application.Rect{X: 40, Y: 20, Width: 360, Height: 480},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := fitWindowBounds(test.bounds, test.workArea)
			if got != test.want {
				t.Fatalf("fitWindowBounds() = %+v, want %+v", got, test.want)
			}
		})
	}
}
