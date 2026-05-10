package daemon

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"

	entityv1 "github.com/fdatoo/switchyard/gen/switchyard/entity/v1"
	eventv1 "github.com/fdatoo/switchyard/gen/switchyard/event/v1"
	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/api"
	"github.com/fdatoo/switchyard/internal/api/listener"
	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/observability"
	"github.com/fdatoo/switchyard/internal/registry"
	"github.com/fdatoo/switchyard/internal/state"
	"github.com/fdatoo/switchyard/internal/testutil"
)

func TestEntityStreamSourceAdapter_SubscribeAndResume(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	db := testutil.NewTestDB(t)
	metrics := observability.NewMetrics()
	logger := observability.Init(observability.LogConfig{Level: slog.LevelInfo, Format: "json", Output: &bytes.Buffer{}})
	store, err := eventstore.Open(ctx, eventstore.Config{}, db, logger, metrics)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close(context.Background()) })
	cache := state.New()
	reg, err := registry.New(ctx, db)
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	if err := store.RegisterProjector(cache, eventstore.ProjectorModeSync); err != nil {
		t.Fatalf("register cache projector: %v", err)
	}
	if err := store.RegisterProjector(reg, eventstore.ProjectorModeSync); err != nil {
		t.Fatalf("register registry projector: %v", err)
	}
	if err := store.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	if _, err := store.Append(ctx, entityRegisteredEvent("light.kitchen")); err != nil {
		t.Fatalf("append entity_registered: %v", err)
	}

	reader := &entityReaderAdapter{reg: reg, cache: cache}
	entitySvc := api.NewEntityService(reader, nil)
	entitySvc.SetStreamSource(&entityStreamSourceAdapter{store: store, reader: reader})

	sockDir, err := os.MkdirTemp("/tmp", "swy")
	if err != nil {
		t.Fatalf("temp socket dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(sockDir) })

	path, handler := switchyardv1alpha1connect.NewEntityServiceHandler(entitySvc)
	l, err := listener.Build(listener.Config{
		UDSPath: filepath.Join(sockDir, "s.sock"),
		UDSMode: 0o600,
		TCPBind: "127.0.0.1:0",
	}, listener.Deps{
		HealthProbe:   func() error { return nil },
		ConnectRoutes: []listener.Route{{Path: path, Handler: handler}},
	})
	if err != nil {
		t.Fatalf("listener Build: %v", err)
	}
	if err := l.Start(ctx); err != nil {
		t.Fatalf("listener Start: %v", err)
	}
	t.Cleanup(func() { _ = l.Shutdown(context.Background()) })

	client := switchyardv1alpha1connect.NewEntityServiceClient(
		&http.Client{},
		"http://"+l.TCPAddr().String(),
	)
	type positions struct {
		first  uint64
		second uint64
	}
	posCh := make(chan positions, 1)
	go func() {
		time.Sleep(10 * time.Millisecond)
		pos1, err := store.Append(ctx, testutil.StateChanged("light.kitchen", 10))
		if err != nil {
			t.Errorf("append state 1: %v", err)
			return
		}
		pos2, err := store.Append(ctx, testutil.StateChanged("light.kitchen", 20))
		if err != nil {
			t.Errorf("append state 2: %v", err)
			return
		}
		posCh <- positions{first: pos1, second: pos2}
	}()

	stream, err := client.Subscribe(ctx, connect.NewRequest(&v1.SubscribeEntitiesRequest{
		Selector: &v1.EntitySelector{EntityIds: []string{"light.kitchen"}},
	}))
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	t.Cleanup(func() { _ = stream.Close() })
	var pos positions
	select {
	case pos = <-posCh:
	case <-ctx.Done():
		t.Fatalf("state appends timed out: %v", ctx.Err())
	}

	first := nextEntityChange(t, stream)
	second := nextEntityChange(t, stream)
	if first.GetCursor() != pos.first || first.GetEntityId() != "light.kitchen" || first.GetEntity().GetState().GetLight().GetBrightness() != 10 {
		t.Fatalf("first change = %+v", first)
	}
	if second.GetCursor() != pos.second || second.GetEntityId() != "light.kitchen" || second.GetEntity().GetState().GetLight().GetBrightness() != 20 {
		t.Fatalf("second change = %+v", second)
	}
	_ = stream.Close()

	resumed, err := client.Subscribe(ctx, connect.NewRequest(&v1.SubscribeEntitiesRequest{
		Selector:   &v1.EntitySelector{EntityIds: []string{"light.kitchen"}},
		FromCursor: pos.first,
	}))
	if err != nil {
		t.Fatalf("Subscribe resume: %v", err)
	}
	t.Cleanup(func() { _ = resumed.Close() })

	replayed := nextEntityChange(t, resumed)
	if replayed.GetCursor() != pos.second || replayed.GetEntity().GetState().GetLight().GetBrightness() != 20 {
		t.Fatalf("replayed change = %+v", replayed)
	}
}

func entityRegisteredEvent(entityID string) eventstore.Event {
	return eventstore.Event{
		Kind:      "entity_registered",
		Entity:    entityID,
		Source:    "driver:test",
		Timestamp: time.Now(),
		Payload: &eventv1.Payload{Kind: &eventv1.Payload_EntityRegistered{
			EntityRegistered: &eventv1.EntityRegistered{
				DriverInstanceId: "driver.test",
				DeviceId:         "device.test",
				EntityType:       "light",
				FriendlyName:     "Kitchen Light",
				Capabilities:     &entityv1.Attributes{Kind: &entityv1.Attributes_Light{Light: &entityv1.Light{}}},
			},
		}},
	}
}

func nextEntityChange(t *testing.T, stream *connect.ServerStreamForClient[v1.SubscribeEntitiesResponse]) *v1.EntityChange {
	t.Helper()
	for stream.Receive() {
		if change := stream.Msg().GetChange(); change != nil {
			return change
		}
	}
	if err := stream.Err(); err != nil {
		t.Fatalf("stream error: %v", err)
	}
	t.Fatal("stream closed before entity change")
	return nil
}
