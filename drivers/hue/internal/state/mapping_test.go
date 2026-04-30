package state

import (
	"testing"

	entityv1 "github.com/fdatoo/gohome/gen/gohome/entity/v1"
	"github.com/fdatoo/gohome/drivers/hue/internal/bridge"
)

func TestEntityID(t *testing.T) {
	cases := []struct {
		name string
		in   bridge.Light
		want string
	}{
		{
			name: "uses first 8 chars of UUID",
			in:   bridge.Light{ID: "12345678-90ab-cdef-1234-567890abcdef"},
			want: "light.hue_12345678",
		},
		{
			name: "stable across name changes",
			in:   bridge.Light{ID: "deadbeef-0000-0000-0000-000000000000", Metadata: bridge.LightMetadata{Name: "Renamed"}},
			want: "light.hue_deadbeef",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := EntityID(tc.in)
			if got != tc.want {
				t.Fatalf("EntityID = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestLightToAttrs(t *testing.T) {
	mirek := uint32(366)
	cases := []struct {
		name string
		in   bridge.Light
		want *entityv1.Light
	}{
		{
			name: "on with brightness and color temp",
			in: bridge.Light{
				On:               bridge.OnState{On: true},
				Dimming:          &bridge.Dimming{Brightness: 50},
				ColorTemperature: &bridge.ColorTemperature{Mirek: &mirek},
			},
			want: &entityv1.Light{On: true, Brightness: 128, ColorTemp: 366},
		},
		{
			name: "off, no dimming or color temp",
			in:   bridge.Light{On: bridge.OnState{On: false}},
			want: &entityv1.Light{On: false},
		},
		{
			name: "rounds brightness up",
			in: bridge.Light{
				On:      bridge.OnState{On: true},
				Dimming: &bridge.Dimming{Brightness: 100},
			},
			want: &entityv1.Light{On: true, Brightness: 255},
		},
		{
			name: "color_temperature with nil mirek (white-only bulb)",
			in: bridge.Light{
				On:               bridge.OnState{On: true},
				ColorTemperature: &bridge.ColorTemperature{Mirek: nil},
			},
			want: &entityv1.Light{On: true},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := LightToAttrs(tc.in)
			gotLight := got.GetLight()
			if gotLight.GetOn() != tc.want.GetOn() ||
				gotLight.GetBrightness() != tc.want.GetBrightness() ||
				gotLight.GetColorTemp() != tc.want.GetColorTemp() {
				t.Fatalf("LightToAttrs = %+v, want %+v", gotLight, tc.want)
			}
		})
	}
}
