//go:build integration

package cli_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/fdatoo/switchyard/internal/cli"
)

// configTestdataDir returns the absolute path to a directory under
// internal/config/testdata.
func configTestdataDir(t *testing.T, name string) string {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	// internal/cli/config_offline_test.go → internal/config/testdata/<name>
	return filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "config", "testdata", name))
}

// TestConfigValidate_OfflineSucceedsWithoutDaemon exercises the --offline
// branch against a known-good Pkl fixture; it must succeed without any daemon
// reachable. This is the regression guard for audit item #10 (C4 plan §Task 9).
func TestConfigValidate_OfflineSucceedsWithoutDaemon(t *testing.T) {
	dir := configTestdataDir(t, "valid")

	root := cli.NewRoot()
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)
	// Point endpoint at a UDS that is guaranteed not to exist; if the offline
	// flag is ignored and we accidentally fall through to the daemon path the
	// test will visibly fail with a connect error.
	root.SetArgs([]string{
		"config", "validate",
		"--offline",
		"--config-dir", dir,
		"--endpoint", "unix:///nonexistent/switchyardd.sock",
	})

	if err := root.ExecuteContext(context.Background()); err != nil {
		t.Fatalf("offline validate failed: %v\noutput:\n%s", err, out.String())
	}
	if !strings.Contains(out.String(), "Config valid") {
		t.Errorf("expected success line, got:\n%s", out.String())
	}
	if !strings.Contains(out.String(), "(offline)") {
		t.Errorf("expected offline marker, got:\n%s", out.String())
	}
}

// TestConfigValidate_OfflineWithDriverImport exercises the full driver:<name>
// resolution path through the offline validator: a hand-rolled driver manifest,
// a main.pkl that imports it, and a successful validate run.
func TestConfigValidate_OfflineWithDriverImport(t *testing.T) {
	driversDir := t.TempDir()
	configDir := t.TempDir()

	if err := os.MkdirAll(filepath.Join(driversDir, "fake"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(driversDir, "fake", "manifest.pkl"), []byte(`
extends "switchyard:driver"
const name = "fake"
const version = "0.0.1"
produces = new { "light" }
class FakeInstance extends Instance {
  driverName = name
}
`), 0o644); err != nil {
		t.Fatal(err)
	}
	// Touch a fake binary at the expected path to make the install look real.
	if err := os.WriteFile(filepath.Join(driversDir, "fake", "fake-driver"), []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`
amends "switchyard:config"
import "driver:fake" as fake

driverInstances = new {
  new fake.FakeInstance {
    id = "fake_one"
  }
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	root := cli.NewRoot()
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{
		"config", "validate",
		"--offline",
		"--config-dir", configDir,
		"--drivers-dir", driversDir,
	})

	if err := root.ExecuteContext(context.Background()); err != nil {
		t.Fatalf("validate failed: %v\noutput:\n%s", err, out.String())
	}
	if !strings.Contains(out.String(), "Config valid") {
		t.Errorf("expected success line, got:\n%s", out.String())
	}
}

// TestConfigValidate_OfflineMissingMainPkl reports a clear error when the
// config dir does not contain main.pkl, rather than blowing up downstream.
func TestConfigValidate_OfflineMissingMainPkl(t *testing.T) {
	dir := t.TempDir()

	root := cli.NewRoot()
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{
		"config", "validate",
		"--offline",
		"--config-dir", dir,
	})

	err := root.ExecuteContext(context.Background())
	if err == nil {
		t.Fatal("expected error for missing main.pkl, got nil")
	}
	if !strings.Contains(err.Error(), "main.pkl") {
		t.Errorf("error should mention main.pkl, got: %v", err)
	}
}
