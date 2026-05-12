package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	configv1 "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
)

type fakeSceneSnap struct{ snap *configv1.ConfigSnapshot }

func (f *fakeSceneSnap) Current() *configv1.ConfigSnapshot { return f.snap }

type fakeInvoker struct {
	called    int
	lastID    string
	returnErr error
}

func (f *fakeInvoker) Invoke(_ context.Context, sceneID, _, _ string) error {
	f.called++
	f.lastID = sceneID
	return f.returnErr
}

func TestSceneService_List(t *testing.T) {
	snap := &configv1.ConfigSnapshot{
		Scenes: []*configv1.SceneConfig{
			{Id: "global-off", DisplayName: "All off"},
			{Id: "kitchen-bright", DisplayName: "Kitchen bright", AreaId: "kitchen"},
		},
	}
	svc := NewRealSceneService(&fakeSceneSnap{snap: snap}, &fakeInvoker{}, nil)

	resp, err := svc.List(context.Background(), connect.NewRequest(&v1.ListScenesRequest{}))
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if got := len(resp.Msg.GetScenes()); got != 2 {
		t.Errorf("want 2 scenes, got %d", got)
	}
	if resp.Msg.GetScenes()[1].GetAreaId() != "kitchen" {
		t.Errorf("area_id not projected: %+v", resp.Msg.GetScenes()[1])
	}
}

func TestSceneService_ApplyHappy(t *testing.T) {
	snap := &configv1.ConfigSnapshot{Scenes: []*configv1.SceneConfig{{Id: "test"}}}
	inv := &fakeInvoker{}
	svc := NewRealSceneService(&fakeSceneSnap{snap: snap}, inv, nil)

	resp, err := svc.Apply(context.Background(), connect.NewRequest(&v1.ApplySceneRequest{Id: "test"}))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if resp.Msg.GetCorrelationId() == "" {
		t.Error("want non-empty correlation_id")
	}
	if inv.called != 1 || inv.lastID != "test" {
		t.Errorf("invoker not called correctly: %+v", inv)
	}
}

func TestSceneService_ApplyNotFound(t *testing.T) {
	inv := &fakeInvoker{returnErr: errSceneNotFoundSentinel}
	svc := NewRealSceneService(&fakeSceneSnap{snap: &configv1.ConfigSnapshot{}}, inv, nil)

	_, err := svc.Apply(context.Background(), connect.NewRequest(&v1.ApplySceneRequest{Id: "ghost"}))
	if err == nil {
		t.Fatal("want NotFound error")
	}
	var cerr *connect.Error
	if !errors.As(err, &cerr) || cerr.Code() != connect.CodeNotFound {
		t.Errorf("want NotFound, got %v (type %T)", err, err)
	}
}

func TestSceneService_PreviewLines(t *testing.T) {
	snap := &configv1.ConfigSnapshot{
		Scenes: []*configv1.SceneConfig{
			{Id: "tv", Actions: []*configv1.ActionConfig{
				{Kind: &configv1.ActionConfig_CallService{CallService: &configv1.CallServiceAction{
					Entity: "light.tv", Capability: "turn_off",
				}}},
				{Kind: &configv1.ActionConfig_CallService{CallService: &configv1.CallServiceAction{
					Entity: "blind.living", Capability: "lower",
				}}},
			}},
		},
	}
	svc := NewRealSceneService(&fakeSceneSnap{snap: snap}, &fakeInvoker{}, nil)
	resp, err := svc.Preview(context.Background(), connect.NewRequest(&v1.PreviewSceneRequest{Id: "tv"}))
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if got := len(resp.Msg.GetLines()); got != 2 {
		t.Errorf("want 2 lines, got %d (%v)", got, resp.Msg.GetLines())
	}
	if !strings.Contains(resp.Msg.GetLines()[0], "light.tv") {
		t.Errorf("first line should mention entity: %v", resp.Msg.GetLines())
	}
}

func TestSceneService_FullRoundTrip(t *testing.T) {
	snap := &configv1.ConfigSnapshot{Scenes: []*configv1.SceneConfig{{Id: "x"}}}
	svc := NewRealSceneService(&fakeSceneSnap{snap: snap}, &fakeInvoker{}, nil)
	path, handler := switchyardv1alpha1connect.NewSceneServiceHandler(svc)
	mux := http.NewServeMux()
	mux.Handle(path, handler)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := switchyardv1alpha1connect.NewSceneServiceClient(srv.Client(), srv.URL)
	resp, err := client.Apply(context.Background(), connect.NewRequest(&v1.ApplySceneRequest{Id: "x"}))
	if err != nil {
		t.Fatalf("client.Apply: %v", err)
	}
	if resp.Msg.GetCorrelationId() == "" {
		t.Error("want correlation_id from RPC round-trip")
	}
}
