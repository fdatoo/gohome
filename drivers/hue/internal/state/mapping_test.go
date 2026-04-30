package state

import (
	"testing"

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
