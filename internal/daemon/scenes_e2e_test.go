//go:build integration

package daemon_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"

	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/daemon"
	"github.com/fdatoo/switchyard/internal/observability"
)

func TestScene_ApplyAndNotFound(t *testing.T) {
	dir := shortTempDir(t)
	configDir := filepath.Join(dir, "config")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Allocate a free TCP port for the Connect listener embedded in main.pkl.
	// The Pkl default is "127.0.0.1:8080" which can collide with other processes.
	connectPort := freeTCPPort(t)

	// Embed a single scene in the inline-config form.
	// The entity referenced ("light.testdriver_lamp") has no real driver; Apply
	// still succeeds synchronously because action dispatch is fire-and-forget.
	mainPkl := fmt.Sprintf(`amends "switchyard:config"

import "switchyard:scenes" as sc
import "switchyard:automations" as auto

listener {
  tcp {
    bind = "127.0.0.1:%d"
  }
}

scenes {
  new sc.Scene {
    id = "test-apply"
    displayName = "Test apply"
    actions {
      new auto.CallServiceAction {
        entity = "light.testdriver_lamp"
        capability = "turn_off"
      }
    }
  }
}
`, connectPort)
	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(mainPkl), 0o644); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	metrics := observability.NewMetrics()
	adminPort := freeTCPPort(t)
	sockName := fmt.Sprintf("switchyardd-%d.sock", os.Getpid())

	d := daemon.New(daemon.Config{
		DataDir:    dir,
		ConfigDir:  configDir,
		LogLevel:   slog.LevelInfo,
		LogFormat:  "json",
		AdminPort:  adminPort,
		SocketPath: sockName,
	}, logger, metrics)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- d.Run(ctx) }()
	t.Cleanup(func() {
		cancel()
		<-done
	})

	// Wait for daemon to report ready (Phase 5).
	healthURL := fmt.Sprintf("http://127.0.0.1:%d/health", adminPort)
	deadline := time.Now().Add(60 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		// Check if the daemon exited early with an error.
		select {
		case runErr := <-done:
			t.Fatalf("daemon exited before ready: %v", runErr)
		default:
		}
		resp, err := http.Get(healthURL) //nolint:noctx
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				ready = true
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !ready {
		t.Fatal("daemon did not report ready within 60s")
	}
	t.Log("daemon ready")

	// Connect via Unix-domain socket (LocalPeerCred auth, same as TestDaemon_APIVersion).
	// The API listener UDS path defaults to <dataDir>/switchyardd.sock (from Pkl default).
	sock := filepath.Join(dir, "switchyardd.sock")
	udsClient := &http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", sock)
		},
	}}
	client := switchyardv1alpha1connect.NewSceneServiceClient(udsClient, "http://unix")

	// List should return our scene.
	listResp, err := client.List(ctx, connect.NewRequest(&v1.ListScenesRequest{}))
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	scenes := listResp.Msg.GetScenes()
	if len(scenes) != 1 || scenes[0].GetId() != "test-apply" {
		t.Fatalf("List got %+v", scenes)
	}
	t.Logf("List returned scene id=%q", scenes[0].GetId())

	// Apply should succeed and return a correlation_id.
	applyResp, err := client.Apply(ctx, connect.NewRequest(&v1.ApplySceneRequest{Id: "test-apply"}))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if applyResp.Msg.GetCorrelationId() == "" {
		t.Error("Apply: want non-empty correlation_id")
	}
	t.Logf("Apply correlation_id=%q", applyResp.Msg.GetCorrelationId())

	// Apply of a missing scene must return gRPC NotFound.
	_, err = client.Apply(ctx, connect.NewRequest(&v1.ApplySceneRequest{Id: "ghost"}))
	if err == nil {
		t.Fatal("Apply(ghost): want error, got nil")
	}
	var cerr *connect.Error
	if !errors.As(err, &cerr) || cerr.Code() != connect.CodeNotFound {
		t.Errorf("Apply(ghost): want NotFound, got %v", err)
	}
	t.Logf("Apply(ghost) correctly returned NotFound")
}
