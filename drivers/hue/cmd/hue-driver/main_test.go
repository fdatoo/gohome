package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/fdatoo/gohome-driverkit/drivertest"

	"github.com/fdatoo/gohome/drivers/hue/internal/bridge"
)

const fakeBridgeListLightsBody = `{
  "errors": [],
  "data": [
    {
      "id": "12345678-90ab-cdef-1234-567890abcdef",
      "type": "light",
      "metadata": { "name": "Kitchen" },
      "on": { "on": false },
      "dimming": { "brightness": 50 }
    }
  ]
}`

func TestDriver_TurnOnAndSetBrightness(t *testing.T) {
	var seenSetLight string
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/clip/v2/resource/light":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(fakeBridgeListLightsBody))
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/clip/v2/resource/light/"):
			seenSetLight = r.URL.Path
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/eventstream/clip/v2":
			// Hold the connection open until the harness closes the test.
			w.Header().Set("Content-Type", "text/event-stream")
			flusher, _ := w.(http.Flusher)
			flusher.Flush()
			<-r.Context().Done()
		default:
			http.Error(w, "unexpected", http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)

	client, err := bridge.New(strings.TrimPrefix(srv.URL, "https://"), "test-key", true)
	if err != nil {
		t.Fatalf("bridge.New: %v", err)
	}
	client.SetHTTPClientForTest(srv.Client())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	d, _, err := buildDriver(ctx, client)
	if err != nil {
		t.Fatalf("buildDriver: %v", err)
	}

	h := drivertest.New(t, d)
	defer h.Close()

	const entityID = "light.hue_12345678"

	if _, err := h.SendCommand(ctx, entityID, "turn_on", nil); err != nil {
		t.Fatalf("turn_on: %v", err)
	}
	if _, err := h.SendCommand(ctx, entityID, "set_brightness", map[string]string{"brightness": "128"}); err != nil {
		t.Fatalf("set_brightness: %v", err)
	}

	if !strings.HasSuffix(seenSetLight, "/12345678-90ab-cdef-1234-567890abcdef") {
		t.Fatalf("expected SetLight call to bridge, got %q", seenSetLight)
	}
}
