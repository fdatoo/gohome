//go:build linux || darwin

package listener_test

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"

	eventv1 "github.com/fdatoo/switchyard/gen/switchyard/event/v1"
	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/api"
	"github.com/fdatoo/switchyard/internal/api/listener"
	"github.com/fdatoo/switchyard/internal/auth"
	"github.com/fdatoo/switchyard/internal/auth/audit"
)

func TestListener_UDSPeerCredBypassAndTCPReject(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	appender := &captureAuthAppender{}
	recorder := audit.New(appender)
	entitySvc := api.NewEntityService(fakeEntityReader{}, nil)
	path, handler := switchyardv1alpha1connect.NewEntityServiceHandler(entitySvc, connect.WithInterceptors(
		listener.RequestIDInterceptor(),
		api.NewAuthenticate(auth.Chain(auth.LocalPeerCred{}, auth.RejectAll{}), nil, nil),
		api.NewAuthorize(nil, nil, recorder, nil),
	))

	sockDir, err := os.MkdirTemp("/tmp", "swy")
	if err != nil {
		t.Fatalf("temp socket dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(sockDir) })
	sock := filepath.Join(sockDir, "s.sock")
	l, err := listener.Build(listener.Config{
		UDSPath: sock,
		UDSMode: 0o600,
		TCPBind: "127.0.0.1:0",
	}, listener.Deps{
		HealthProbe:   func() error { return nil },
		ConnectRoutes: []listener.Route{{Path: path, Handler: handler}},
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = l.Shutdown(context.Background()) })

	udsClient := switchyardv1alpha1connect.NewEntityServiceClient(unixHTTPClient(sock), "http://unix")
	resp, err := udsClient.List(ctx, connect.NewRequest(&v1.ListEntitiesRequest{}))
	if err != nil {
		t.Fatalf("UDS List: %v", err)
	}
	if got := len(resp.Msg.GetEntities()); got != 1 {
		t.Fatalf("UDS List returned %d entities, want 1", got)
	}
	if !appender.hasSystemLocalBypass() {
		t.Fatalf("missing policy bypass audit event for system:local; events=%v", appender.eventsSnapshot())
	}

	tcpClient := switchyardv1alpha1connect.NewEntityServiceClient(http.DefaultClient, "http://"+l.TCPAddr().String())
	_, err = tcpClient.List(ctx, connect.NewRequest(&v1.ListEntitiesRequest{}))
	var ce *connect.Error
	if !errors.As(err, &ce) || ce.Code() != connect.CodeUnauthenticated {
		t.Fatalf("TCP List err = %v, want unauthenticated", err)
	}
}

func unixHTTPClient(sock string) *http.Client {
	return &http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", sock)
		},
	}}
}

type fakeEntityReader struct{}

func (fakeEntityReader) ListEntities(context.Context, api.EntitySelector, api.PageReq) ([]api.Entity, api.Cursor, error) {
	return []api.Entity{{ID: "light.kitchen", Type: "light", FriendlyName: "Kitchen"}}, api.Cursor{}, nil
}

func (fakeEntityReader) GetEntity(context.Context, string) (api.Entity, error) {
	return api.Entity{}, errors.New("not found")
}

type captureAuthAppender struct {
	mu     sync.Mutex
	events []*eventv1.AuthEvent
}

func (a *captureAuthAppender) AppendAuth(_ context.Context, ev *eventv1.AuthEvent) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.events = append(a.events, ev)
	return nil
}

func (a *captureAuthAppender) hasSystemLocalBypass() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, ev := range a.events {
		if ev.GetIdentity().GetPrincipalId() == "system:local" && ev.GetPolicyBypassed().GetReason() == "system_local" {
			return true
		}
	}
	return false
}

func (a *captureAuthAppender) eventsSnapshot() []*eventv1.AuthEvent {
	a.mu.Lock()
	defer a.mu.Unlock()
	events := make([]*eventv1.AuthEvent, len(a.events))
	copy(events, a.events)
	return events
}
