// Package state translates between Philips Hue CLIP v2 resources and
// gohome entityv1 attributes. Pure functions, no I/O.
package state

import (
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
