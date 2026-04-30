// Package state translates between Philips Hue CLIP v2 resources and
// gohome entityv1 attributes. Pure functions, no I/O.
package state

import (
	"math"

	entityv1 "github.com/fdatoo/gohome/gen/gohome/entity/v1"
	"github.com/fdatoo/gohome/drivers/hue/internal/bridge"
)

// EntityID returns the gohome entity ID for a Hue light. The first 8 chars
// of the Hue v2 stable resource UUID are deterministic across renames and
// short enough to read in logs.
func EntityID(l bridge.Light) string {
	id := l.ID
	if len(id) > 8 {
		id = id[:8]
	}
	return "light.hue_" + id
}

// LightToAttrs builds a full entityv1.Attributes from a Hue light. Used at
// startup enumeration and when resyncing after an SSE drop.
func LightToAttrs(l bridge.Light) *entityv1.Attributes {
	light := &entityv1.Light{On: l.On.On}
	if l.Dimming != nil {
		light.Brightness = brightnessHueToGohome(l.Dimming.Brightness)
	}
	if l.ColorTemperature != nil && l.ColorTemperature.Mirek != nil {
		light.ColorTemp = *l.ColorTemperature.Mirek
	}
	return &entityv1.Attributes{Kind: &entityv1.Attributes_Light{Light: light}}
}

// brightnessHueToGohome converts Hue's 0-100 float to gohome's 0-255 uint32.
func brightnessHueToGohome(h float64) uint32 {
	if h < 0 {
		h = 0
	}
	if h > 100 {
		h = 100
	}
	return uint32(math.Round(h * 255 / 100))
}
