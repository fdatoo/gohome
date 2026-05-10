package diagnostics

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"testing"
	"time"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	eventv1 "github.com/fdatoo/switchyard/gen/switchyard/event/v1"
	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/observability"
)

func TestBuild_IncludesExpectedFilesAndConfigHash(t *testing.T) {
	generatedAt := time.Unix(1700000000, 0).UTC()
	bundle, configHash, gotAt, err := Build(Options{
		BuildInfo:   BuildInfo{Version: "1.2.3", Commit: "abc", GoVersion: "go1.24.0"},
		MetricsDump: "switchyard_build_info 1\n",
		EventsTail: []eventstore.Event{{
			Position:  7,
			Timestamp: generatedAt,
			Kind:      "system",
			Source:    "test",
			Payload: &eventv1.Payload{Kind: &eventv1.Payload_System{
				System: &eventv1.SystemEvent{Kind: "startup"},
			}},
		}},
		ProjectionCursors: []observability.ProjectionCursor{{
			Name: "state", Position: 7, UpdatedAt: generatedAt,
		}},
		ConfigSnapshot: &configpb.ConfigSnapshot{
			ConfigDir: "/config",
			DriverInstances: []*configpb.DriverInstanceConfig{{
				Id:     "hue",
				Params: []byte(`{"apiKey":"[REDACTED]"}`),
			}},
		},
		Health:      HealthInfo{Phase: 5, Status: "ready", UptimeSeconds: 12.5},
		GeneratedAt: generatedAt,
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if !gotAt.Equal(generatedAt) {
		t.Fatalf("generatedAt = %v, want %v", gotAt, generatedAt)
	}

	files := readZip(t, bundle)
	for _, name := range []string{
		"build_info.json",
		"metrics_dump.txt",
		"events_tail.jsonl",
		"projection_cursors.json",
		"config_snapshot.json",
		"health.json",
		"goroutines.txt",
	} {
		if _, ok := files[name]; !ok {
			t.Fatalf("missing %s", name)
		}
	}
	sum := sha256.Sum256(files["config_snapshot.json"])
	if configHash != hex.EncodeToString(sum[:]) {
		t.Fatalf("configHash = %q, want hash of config_snapshot.json", configHash)
	}
	if bytes.Contains(files["config_snapshot.json"], []byte("secret-value")) {
		t.Fatal("config snapshot contains raw secret")
	}
	if !bytes.Contains(files["metrics_dump.txt"], []byte("switchyard_build_info")) {
		t.Fatalf("metrics dump missing expected content: %s", files["metrics_dump.txt"])
	}

	var health HealthInfo
	if err := json.Unmarshal(files["health.json"], &health); err != nil {
		t.Fatalf("unmarshal health: %v", err)
	}
	if health.Phase != 5 || health.Status != "ready" {
		t.Fatalf("health = %+v", health)
	}
}

func readZip(t *testing.T, data []byte) map[string][]byte {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip.NewReader: %v", err)
	}
	files := make(map[string][]byte, len(zr.File))
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open %s: %v", f.Name, err)
		}
		body, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read %s: %v", f.Name, err)
		}
		files[f.Name] = body
	}
	return files
}
