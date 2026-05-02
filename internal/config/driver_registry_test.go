package config

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeManifest(t *testing.T, root, dir, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, dir, "manifest.pkl"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDriverRegistry_EmptyRoot(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reg, err := NewDriverRegistry(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("NewDriverRegistry: %v", err)
	}
	if got := reg.Names(); len(got) != 0 {
		t.Fatalf("Names() = %v, want []", got)
	}
}

func TestDriverRegistry_NonExistentRoot(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reg, err := NewDriverRegistry(ctx, "/does/not/exist/anywhere/zzz")
	if err != nil {
		t.Fatalf("NewDriverRegistry on missing root should not error, got: %v", err)
	}
	if got := reg.Names(); len(got) != 0 {
		t.Fatalf("Names() = %v, want []", got)
	}
}

func TestDriverRegistry_ScansValidDriver(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "hue", `
extends "switchyard:driver"
const name = "hue"
const version = "1.0.0"
produces = new { "light" }
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatalf("NewDriverRegistry: %v", err)
	}
	names := reg.Names()
	if len(names) != 1 || names[0] != "hue" {
		t.Fatalf("Names() = %v, want [hue]", names)
	}
	entry, ok := reg.Lookup("hue")
	if !ok {
		t.Fatal("Lookup(hue) not found")
	}
	wantBinary := filepath.Join(root, "hue", "hue-driver")
	if entry.BinaryPath != wantBinary {
		t.Fatalf("BinaryPath = %q, want %q", entry.BinaryPath, wantBinary)
	}
	if entry.Version != "1.0.0" {
		t.Errorf("Version = %q, want 1.0.0", entry.Version)
	}
}

func TestDriverRegistry_NameMismatch(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "hue", `
extends "switchyard:driver"
const name = "wrongname"
const version = "1.0.0"
produces = new { "light" }
`)
	_, err := NewDriverRegistry(ctx, root)
	if err == nil {
		t.Fatal("expected name-mismatch error, got nil")
	}
	if !strings.Contains(err.Error(), "wrongname") || !strings.Contains(err.Error(), "hue") {
		t.Fatalf("error = %q; want both directory name and manifest name", err.Error())
	}
}

func TestDriverRegistry_ExplicitBinaryRelative(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "z2m", `
extends "switchyard:driver"
const name = "z2m"
const version = "1.0.0"
produces = new { "light" }
binary = "z2m-driver-bin"
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := reg.Lookup("z2m")
	want := filepath.Join(root, "z2m", "z2m-driver-bin")
	if entry.BinaryPath != want {
		t.Fatalf("BinaryPath = %q, want %q", entry.BinaryPath, want)
	}
}

func TestDriverRegistry_ExplicitBinaryAbsolute(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "x", `
extends "switchyard:driver"
const name = "x"
const version = "1.0.0"
produces = new { "sensor" }
binary = "/opt/x/bin/x"
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := reg.Lookup("x")
	if entry.BinaryPath != "/opt/x/bin/x" {
		t.Fatalf("BinaryPath = %q, want absolute", entry.BinaryPath)
	}
}

func TestDriverRegistry_LookupMissing(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reg, _ := NewDriverRegistry(ctx, t.TempDir())
	if _, ok := reg.Lookup("ghost"); ok {
		t.Fatal("Lookup(ghost) returned ok=true on empty registry")
	}
}

func TestDriverRegistry_LifecycleDefaults(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "fast", `
extends "switchyard:driver"
const name = "fast"
const version = "1.0.0"
produces = new { "light" }
lifecycleDefaults {
  restartBudgetMax = 7
  handshakeDeadline = 2.s
}
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := reg.Lookup("fast")
	if entry.LifecycleDefaults.RestartBudgetMax == nil || *entry.LifecycleDefaults.RestartBudgetMax != 7 {
		t.Errorf("RestartBudgetMax = %v, want pointer to 7", entry.LifecycleDefaults.RestartBudgetMax)
	}
	if entry.LifecycleDefaults.HandshakeDeadline == nil || *entry.LifecycleDefaults.HandshakeDeadline != 2*time.Second {
		t.Errorf("HandshakeDeadline = %v, want pointer to 2s", entry.LifecycleDefaults.HandshakeDeadline)
	}
	if entry.LifecycleDefaults.HealthProbeInterval != nil {
		t.Errorf("HealthProbeInterval = %v, want nil (unset)", entry.LifecycleDefaults.HealthProbeInterval)
	}
}
