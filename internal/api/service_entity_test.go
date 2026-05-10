package api_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/protobuf/types/known/structpb"

	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/api"
	"github.com/fdatoo/switchyard/internal/policy"
)

type fakeEntities struct{ entities []api.Entity }

func (f *fakeEntities) ListEntities(_ context.Context, sel api.EntitySelector, _ api.PageReq) ([]api.Entity, api.Cursor, error) {
	var out []api.Entity
	for _, e := range f.entities {
		if len(sel.Areas) > 0 && !contains(sel.Areas, e.AreaID) {
			continue
		}
		out = append(out, e)
	}
	return out, api.Cursor{}, nil
}
func (f *fakeEntities) GetEntity(_ context.Context, id string) (api.Entity, error) {
	for _, e := range f.entities {
		if e.ID == id {
			return e, nil
		}
	}
	return api.Entity{}, api.ErrEntityNotFound
}

type fakeCaller struct {
	called    []callRec
	returnErr error
}
type callRec struct{ id, cap string }

func (f *fakeCaller) Call(_ context.Context, id, cap string, _ map[string]any) (api.CapabilityCallResult, error) {
	if f.returnErr != nil {
		return api.CapabilityCallResult{}, f.returnErr
	}
	f.called = append(f.called, callRec{id, cap})
	return api.CapabilityCallResult{CorrelationID: "cmd-" + id, Success: true}, nil
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func TestEntityService_List_AreaFilter(t *testing.T) {
	s := api.NewEntityService(&fakeEntities{entities: []api.Entity{
		{ID: "light.a", AreaID: "kitchen"},
		{ID: "light.b", AreaID: "bedroom"},
	}}, nil)
	resp, err := s.List(context.Background(), connect.NewRequest(&v1.ListEntitiesRequest{
		Selector: &v1.EntitySelector{Areas: []string{"kitchen"}},
	}))
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(resp.Msg.Entities) != 1 || resp.Msg.Entities[0].Id != "light.a" {
		t.Errorf("got %+v", resp.Msg.Entities)
	}
}

func TestEntityService_CallCapability(t *testing.T) {
	fc := &fakeCaller{}
	s := api.NewEntityService(&fakeEntities{entities: []api.Entity{{ID: "light.a"}}}, fc)
	params, _ := structpb.NewStruct(map[string]any{"brightness": 75})
	resp, err := s.CallCapability(context.Background(), connect.NewRequest(&v1.CallCapabilityRequest{
		EntityId: "light.a", Capability: "set_brightness", Parameters: params,
	}))
	if err != nil {
		t.Fatalf("CallCapability: %v", err)
	}
	if resp.Msg.CorrelationId != "cmd-light.a" {
		t.Errorf("correlation = %q", resp.Msg.CorrelationId)
	}
}

func TestEntityService_CallCapability_DriverDown(t *testing.T) {
	fc := &fakeCaller{returnErr: api.ErrDriverUnavailable}
	s := api.NewEntityService(&fakeEntities{}, fc)
	_, err := s.CallCapability(context.Background(), connect.NewRequest(&v1.CallCapabilityRequest{
		EntityId: "light.a", Capability: "turn_on",
	}))
	var ce *connect.Error
	if !errors.As(err, &ce) || ce.Code() != connect.CodeUnavailable {
		t.Fatalf("err = %v", err)
	}
}

type fakeEntityStreamSource struct {
	ch <-chan api.EntityChange
}

func (f *fakeEntityStreamSource) Subscribe(_ context.Context, _ api.EntitySelector, _ uint64) (<-chan api.EntityChange, func(), error) {
	return f.ch, func() {}, nil
}

func TestEntityService_SubscribeStrictModeRejectsDeniedSelector(t *testing.T) {
	rt := policy.NewRuntime(testNoopRoles{})
	rt.Replace(testEmptyCompiled())

	ch := make(chan api.EntityChange)
	s := api.NewEntityService(&fakeEntities{entities: []api.Entity{{ID: "light.secret", Type: "light"}}}, nil)
	s.SetStreamSource(&fakeEntityStreamSource{ch: ch})
	s.SetPolicyRuntime(rt)
	client, cleanup := newEntityServiceClient(t, s)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	stream, err := client.Subscribe(ctx, connect.NewRequest(&v1.SubscribeEntitiesRequest{
		Selector:   &v1.EntitySelector{EntityIds: []string{"light.secret"}},
		PolicyMode: v1.PolicyMode_POLICY_MODE_STRICT,
	}))
	if err != nil {
		assertConnectCode(t, err, connect.CodePermissionDenied)
		return
	}
	defer stream.Close()
	if stream.Receive() {
		t.Fatalf("unexpected stream message: %+v", stream.Msg())
	}
	assertConnectCode(t, stream.Err(), connect.CodePermissionDenied)
}

func TestEntityService_SubscribeFilterModeDropsDeniedChanges(t *testing.T) {
	api.SetStreamConfig(api.StreamConfig{HeartbeatInterval: 10 * time.Millisecond, BufSize: 4})
	defer api.SetStreamConfig(api.DefaultStreamConfig())

	rt := policy.NewRuntime(testNoopRoles{})
	rt.Replace(testEmptyCompiled())

	ch := make(chan api.EntityChange, 1)
	ch <- api.EntityChange{
		EntityID: "light.secret",
		Cursor:   7,
		AtUnixMs: time.Now().UnixMilli(),
		Entity:   api.Entity{ID: "light.secret", Type: "light"},
	}
	s := api.NewEntityService(&fakeEntities{entities: []api.Entity{{ID: "light.secret", Type: "light"}}}, nil)
	s.SetStreamSource(&fakeEntityStreamSource{ch: ch})
	s.SetPolicyRuntime(rt)
	client, cleanup := newEntityServiceClient(t, s)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	stream, err := client.Subscribe(ctx, connect.NewRequest(&v1.SubscribeEntitiesRequest{
		Selector:   &v1.EntitySelector{EntityIds: []string{"light.secret"}},
		PolicyMode: v1.PolicyMode_POLICY_MODE_FILTER,
	}))
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer stream.Close()

	for stream.Receive() {
		if change := stream.Msg().GetChange(); change != nil {
			t.Fatalf("denied change was streamed: %+v", change)
		}
		if hb := stream.Msg().GetHeartbeat(); hb != nil && hb.GetLatestCursor() == 7 {
			return
		}
	}
	if err := stream.Err(); err != nil {
		t.Fatalf("stream error: %v", err)
	}
	t.Fatal("stream closed before heartbeat")
}

func newEntityServiceClient(t *testing.T, svc *api.EntityService) (switchyardv1alpha1connect.EntityServiceClient, func()) {
	t.Helper()
	mux := http.NewServeMux()
	path, handler := switchyardv1alpha1connect.NewEntityServiceHandler(svc)
	mux.Handle(path, handler)
	srv := httptest.NewUnstartedServer(h2c.NewHandler(mux, &http2.Server{}))
	srv.Start()
	return switchyardv1alpha1connect.NewEntityServiceClient(srv.Client(), srv.URL, connect.WithGRPC()), srv.Close
}

func assertConnectCode(t *testing.T, err error, code connect.Code) {
	t.Helper()
	var ce *connect.Error
	if !errors.As(err, &ce) || ce.Code() != code {
		t.Fatalf("err = %v, want %s", err, code)
	}
}
