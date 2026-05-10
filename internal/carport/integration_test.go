//go:build integration

package carport_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	promtestutil "github.com/prometheus/client_golang/prometheus/testutil"

	entitypb "github.com/fdatoo/switchyard/gen/switchyard/entity/v1"
	eventpb "github.com/fdatoo/switchyard/gen/switchyard/event/v1"
	"github.com/fdatoo/switchyard/internal/carport"
	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/observability"
	"github.com/fdatoo/switchyard/internal/registry"
)

// buildTestDriver compiles cmd/testdriver into a test-temp binary and returns
// its path. Each call is a separate compile; fast enough for a handful of tests.
func buildTestDriver(t *testing.T) string {
	t.Helper()
	outDir := t.TempDir()
	bin := filepath.Join(outDir, "testdriver")
	cmd := exec.Command("go", "build", "-o", bin, "./cmd/testdriver")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	cmd.Dir = findRepoRoot(t)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go build testdriver: %v\n%s", err, out)
	}
	return bin
}

func findRepoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for d := wd; d != "/"; d = filepath.Dir(d) {
		if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
			return d
		}
	}
	t.Fatal("repo root not found")
	return ""
}

// waitFor polls cond every 20ms up to d. Returns true if cond() returned true
// before the deadline.
func waitFor(d time.Duration, cond func() bool) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return cond()
}

// runScenario sets up a host running one instance with the given TESTDRIVER_MODE
// and waits until `until` returns true, failing the test if it doesn't within 10s.
// Caller gets the running host back for further assertions.
func runScenario(t *testing.T, mode string, until func(*carport.Host) bool) *carport.Host {
	t.Helper()
	return runCarportTestHelper(t, mode, until).host
}

type carportTestHelper struct {
	host    *carport.Host
	store   *eventstore.Store
	reg     *registry.Registry
	metrics *observability.Metrics
}

func runCarportTestHelper(t *testing.T, mode string, until func(*carport.Host) bool) *carportTestHelper {
	t.Helper()
	bin := buildTestDriver(t)
	f := newStoreFixtureForTest(t)
	reg, err := registry.New(context.Background(), f.db)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.store.RegisterProjector(reg, eventstore.ProjectorModeSync); err != nil {
		t.Fatal(err)
	}

	sockDir, err := os.MkdirTemp("", "ghsd")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(sockDir) })
	metrics := newTestMetrics()
	h, err := carport.New(carport.HostConfig{SocketDir: sockDir},
		f.db, f.store, reg, newTestLogger(), metrics)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() {
		cancel()
		h.Stop(context.Background())
	})
	if err := h.Start(ctx); err != nil {
		t.Fatal(err)
	}
	params := []byte(`{"TESTDRIVER_MODE":"` + mode + `"}`)
	// Use short timeouts so scenarios resolve within the 10 s test window.
	// The default lifecycle has 15 s health probes which would cause crash-detection
	// tests to time out before the supervisor transitions out of StateRunning.
	lc := carport.LifecycleConfig{
		HandshakeDeadline:       2 * time.Second,
		HealthProbeInterval:     500 * time.Millisecond,
		HealthProbeTimeout:      300 * time.Millisecond,
		HealthFailuresToRestart: 2,
		RestartBackoffInitial:   100 * time.Millisecond,
		RestartBackoffMax:       500 * time.Millisecond,
		RestartBudgetWindow:     time.Minute,
		RestartBudgetMax:        3,
		ShutdownGrace:           time.Second,
	}
	if err := h.RegisterInstanceWithLifecycle(ctx, "test_one", "testdriver", bin, params, lc); err != nil {
		t.Fatal(err)
	}
	if !waitFor(10*time.Second, func() bool { return until(h) }) {
		t.Fatalf("scenario %s: never reached expected state; current=%s", mode, h.InstanceState("test_one"))
	}
	return &carportTestHelper{host: h, store: f.store, reg: reg, metrics: metrics}
}

func TestIntegration_SupervisorNormalLifecycle(t *testing.T) {
	h := runScenario(t, "normal", func(h *carport.Host) bool {
		return h.InstanceState("test_one") == carport.StateRunning
	})
	h.Stop(context.Background())
	if !waitFor(5*time.Second, func() bool {
		return h.InstanceState("test_one") == carport.StateStopped
	}) {
		t.Fatalf("never stopped; state=%s", h.InstanceState("test_one"))
	}
}

func TestIntegration_CrashAfterHandshake(t *testing.T) {
	runScenario(t, "crash_after_handshake", func(h *carport.Host) bool {
		s := h.InstanceState("test_one")
		return s == carport.StateBackoff || s == carport.StateQuarantined || s == carport.StateSpawning
	})
}

func TestIntegration_CrashMidStream(t *testing.T) {
	runScenario(t, "crash_mid_stream", func(h *carport.Host) bool {
		s := h.InstanceState("test_one")
		return s == carport.StateBackoff || s == carport.StateQuarantined || s == carport.StateSpawning
	})
}

func TestIntegration_BadProtocolVersion(t *testing.T) {
	runScenario(t, "bad_protocol_version", func(h *carport.Host) bool {
		s := h.InstanceState("test_one")
		return s == carport.StateBackoff || s == carport.StateQuarantined
	})
}

func TestIntegration_BadSecret(t *testing.T) {
	runScenario(t, "bad_secret", func(h *carport.Host) bool {
		s := h.InstanceState("test_one")
		return s == carport.StateBackoff || s == carport.StateQuarantined
	})
}

func TestIntegration_SlowHandshake(t *testing.T) {
	// handshake_deadline_ms=2000; driver sleeps 10s.
	runScenario(t, "slow_handshake", func(h *carport.Host) bool {
		s := h.InstanceState("test_one")
		return s == carport.StateBackoff || s == carport.StateQuarantined
	})
}

func TestIntegration_HangOnShutdown(t *testing.T) {
	h := runScenario(t, "hang_on_shutdown", func(h *carport.Host) bool {
		return h.InstanceState("test_one") == carport.StateRunning
	})
	h.Stop(context.Background())
	// shutdown_grace_ms=1000; shutdown RPC hangs forever but supervisor should
	// still force the instance to Stopped via proc.Wait timeout/kill path.
	if !waitFor(8*time.Second, func() bool {
		return h.InstanceState("test_one") == carport.StateStopped
	}) {
		t.Fatalf("hang_on_shutdown never stopped; state=%s", h.InstanceState("test_one"))
	}
}

func TestIntegration_HangOnCommand(t *testing.T) {
	helper := runCarportTestHelper(t, "hang_on_command", func(h *carport.Host) bool {
		return h.InstanceState("test_one") == carport.StateRunning
	})
	seedTestLight(t, helper.store)

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	_, err := helper.host.Dispatch(ctx, "test_light", "turn_on", nil)
	if !errors.Is(err, carport.ErrDispatchTimeout) {
		t.Fatalf("Dispatch err = %v, want ErrDispatchTimeout", err)
	}

	evs, err := helper.store.Query(context.Background(), eventstore.QueryOptions{
		Filter: eventstore.Filter{Kinds: []string{"command_ack"}},
		Limit:  100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("command_ack events = %d, want 1", len(evs))
	}
	ack := evs[0].Payload.GetCommandAck()
	if ack == nil {
		t.Fatal("command_ack event missing payload")
	}
	if ack.GetSuccess() {
		t.Fatal("CommandAck success = true, want false")
	}
	if got := ack.GetErrorMessage(); got != "dispatch timeout" {
		t.Fatalf("CommandAck error_message = %q, want %q", got, "dispatch timeout")
	}
}

func TestIntegration_RepeatRegister(t *testing.T) {
	helper := runCarportTestHelper(t, "repeat_register", func(h *carport.Host) bool {
		return h.InstanceState("test_one") == carport.StateRunning
	})
	assertOneTestLight(t, helper.reg)

	if err := helper.host.RestartInstance(context.Background(), "test_one"); err != nil {
		t.Fatalf("RestartInstance: %v", err)
	}
	if !waitFor(10*time.Second, func() bool {
		return helper.host.InstanceState("test_one") == carport.StateRunning
	}) {
		t.Fatalf("repeat_register never restarted; state=%s", helper.host.InstanceState("test_one"))
	}
	assertOneTestLight(t, helper.reg)
}

func TestIntegration_Chatty(t *testing.T) {
	helper := runCarportTestHelper(t, "chatty", func(h *carport.Host) bool {
		return h.InstanceState("test_one") == carport.StateRunning
	})
	if !waitFor(20*time.Second, func() bool {
		return stateChangedCount(t, helper.store) == 1000 &&
			promtestutil.ToFloat64(helper.metrics.CarportEventsIngestedTotal.WithLabelValues("test_one", "state_changed")) == 1000 &&
			promtestutil.ToFloat64(helper.metrics.CarportStreamMessagesTotal.WithLabelValues("test_one", "state_changed")) == 1000
	}) {
		t.Fatalf("chatty did not drain: events=%d ingested=%v stream=%v",
			stateChangedCount(t, helper.store),
			promtestutil.ToFloat64(helper.metrics.CarportEventsIngestedTotal.WithLabelValues("test_one", "state_changed")),
			promtestutil.ToFloat64(helper.metrics.CarportStreamMessagesTotal.WithLabelValues("test_one", "state_changed")),
		)
	}
}

func seedTestLight(t *testing.T, store *eventstore.Store) {
	t.Helper()
	_, err := store.Append(context.Background(), eventstore.Event{
		Kind:   "entity_registered",
		Entity: "test_light",
		Source: "driver:test_one",
		Payload: &eventpb.Payload{Kind: &eventpb.Payload_EntityRegistered{
			EntityRegistered: &eventpb.EntityRegistered{
				DriverInstanceId: "test_one",
				DeviceId:         "test_light",
				EntityType:       "light",
				FriendlyName:     "test_light",
				Capabilities:     &entitypb.Attributes{},
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
}

func assertOneTestLight(t *testing.T, reg *registry.Registry) {
	t.Helper()
	entities, err := reg.ListEntities(context.Background(), registry.EntityFilter{IncludeDisabled: true})
	if err != nil {
		t.Fatal(err)
	}
	matches := 0
	for _, entity := range entities {
		if entity.ID == "test_light" {
			matches++
		}
	}
	if matches != 1 {
		t.Fatalf("registry rows for test_light = %d, want 1; entities=%v", matches, entities)
	}
}

func stateChangedCount(t *testing.T, store *eventstore.Store) int {
	t.Helper()
	evs, err := store.Query(context.Background(), eventstore.QueryOptions{
		Filter: eventstore.Filter{Kinds: []string{"state_changed"}},
		Limit:  2000,
	})
	if err != nil {
		t.Fatal(err)
	}
	return len(evs)
}
