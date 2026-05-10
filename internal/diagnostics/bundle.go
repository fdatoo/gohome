package diagnostics

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"runtime"
	"time"

	"google.golang.org/protobuf/encoding/protojson"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/observability"
)

type BuildInfo struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	GoVersion string `json:"goversion"`
}

type RecoveryInfo struct {
	Reason         string `json:"reason"`
	FailedPosition uint64 `json:"failedPosition"`
}

type HealthInfo struct {
	Phase         int32         `json:"phase"`
	Status        string        `json:"status"`
	UptimeSeconds float64       `json:"uptimeSeconds"`
	InRecovery    bool          `json:"inRecovery"`
	Recovery      *RecoveryInfo `json:"recovery,omitempty"`
}

type Options struct {
	BuildInfo         BuildInfo
	MetricsDump       string
	EventsTail        []eventstore.Event
	ProjectionCursors []observability.ProjectionCursor
	ConfigSnapshot    *configpb.ConfigSnapshot
	Health            HealthInfo
	GeneratedAt       time.Time
}

type eventRecord struct {
	Position      uint64          `json:"position"`
	Timestamp     time.Time       `json:"timestamp"`
	Kind          string          `json:"kind"`
	Entity        string          `json:"entity,omitempty"`
	Source        string          `json:"source"`
	CorrelationID string          `json:"correlationId,omitempty"`
	CausePosition uint64          `json:"causePosition,omitempty"`
	Payload       json.RawMessage `json:"payload,omitempty"`
}

var protoJSON = protojson.MarshalOptions{
	UseProtoNames:   true,
	EmitUnpopulated: true,
	Multiline:       true,
	Indent:          "  ",
}

func Build(opts Options) ([]byte, string, time.Time, error) {
	generatedAt := opts.GeneratedAt
	if generatedAt.IsZero() {
		generatedAt = time.Now()
	}

	configJSON, err := configSnapshotJSON(opts.ConfigSnapshot)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	sum := sha256.Sum256(configJSON)
	configHash := hex.EncodeToString(sum[:])

	buildInfoJSON, err := jsonBytes(opts.BuildInfo)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("marshal build info: %w", err)
	}
	eventsTailJSONL, err := eventsJSONL(opts.EventsTail)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	cursors := opts.ProjectionCursors
	if cursors == nil {
		cursors = []observability.ProjectionCursor{}
	}
	cursorsJSON, err := jsonBytes(cursors)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("marshal projection cursors: %w", err)
	}
	healthJSON, err := jsonBytes(opts.Health)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("marshal health: %w", err)
	}

	files := []struct {
		name string
		data []byte
	}{
		{"build_info.json", buildInfoJSON},
		{"metrics_dump.txt", []byte(opts.MetricsDump)},
		{"events_tail.jsonl", eventsTailJSONL},
		{"projection_cursors.json", cursorsJSON},
		{"config_snapshot.json", configJSON},
		{"health.json", healthJSON},
		{"goroutines.txt", goroutineDump()},
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, file := range files {
		h := &zip.FileHeader{Name: file.name, Method: zip.Deflate, Modified: generatedAt}
		w, err := zw.CreateHeader(h)
		if err != nil {
			_ = zw.Close()
			return nil, "", time.Time{}, fmt.Errorf("create %s: %w", file.name, err)
		}
		if _, err := w.Write(file.data); err != nil {
			_ = zw.Close()
			return nil, "", time.Time{}, fmt.Errorf("write %s: %w", file.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		return nil, "", time.Time{}, fmt.Errorf("close diagnostics zip: %w", err)
	}
	return buf.Bytes(), configHash, generatedAt, nil
}

func configSnapshotJSON(snap *configpb.ConfigSnapshot) ([]byte, error) {
	if snap == nil {
		snap = &configpb.ConfigSnapshot{}
	}
	data, err := protoJSON.Marshal(snap)
	if err != nil {
		return nil, fmt.Errorf("marshal config snapshot: %w", err)
	}
	data = append(data, '\n')
	return data, nil
}

func jsonBytes(v any) ([]byte, error) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, err
	}
	data = append(data, '\n')
	return data, nil
}

func eventsJSONL(events []eventstore.Event) ([]byte, error) {
	var buf bytes.Buffer
	for _, e := range events {
		rec := eventRecord{
			Position:      e.Position,
			Timestamp:     e.Timestamp,
			Kind:          e.Kind,
			Entity:        e.Entity,
			Source:        e.Source,
			CorrelationID: e.CorrelationID.String(),
			CausePosition: e.CausePosition,
		}
		if e.CorrelationID.String() == "00000000-0000-0000-0000-000000000000" {
			rec.CorrelationID = ""
		}
		if e.Payload != nil {
			payload, err := protojson.Marshal(e.Payload)
			if err != nil {
				return nil, fmt.Errorf("marshal event %d payload: %w", e.Position, err)
			}
			rec.Payload = payload
		}
		line, err := json.Marshal(rec)
		if err != nil {
			return nil, fmt.Errorf("marshal event %d: %w", e.Position, err)
		}
		buf.Write(line)
		buf.WriteByte('\n')
	}
	return buf.Bytes(), nil
}

func goroutineDump() []byte {
	size := 1 << 20
	for {
		buf := make([]byte, size)
		n := runtime.Stack(buf, true)
		if n < len(buf) || size >= 16<<20 {
			return buf[:n]
		}
		size *= 2
	}
}
