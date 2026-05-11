package editsession

import (
	"context"
	"testing"
	"time"
)

func TestLockManager_Acquire_ReturnsToken(t *testing.T) {
	lm := NewLockManager()
	token, err := lm.Acquire("test.pkl")
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestLockManager_TwoSessions_DistinctTokens(t *testing.T) {
	lm := NewLockManager()
	tok1, _ := lm.Acquire("a.pkl")
	tok2, _ := lm.Acquire("a.pkl")
	if tok1 == tok2 {
		t.Fatalf("expected distinct tokens, got both %q", tok1)
	}
	ok1, expired1 := lm.Validate(tok1)
	ok2, expired2 := lm.Validate(tok2)
	if !ok1 || expired1 {
		t.Errorf("tok1 should be valid, got ok=%v expired=%v", ok1, expired1)
	}
	if !ok2 || expired2 {
		t.Errorf("tok2 should be valid, got ok=%v expired=%v", ok2, expired2)
	}
}

func TestLockManager_TTLExpiry(t *testing.T) {
	lm := newLockManagerWithTTL(50 * time.Millisecond)
	tok, _ := lm.Acquire("b.pkl")
	// Before expiry — valid
	ok, expired := lm.Validate(tok)
	if !ok || expired {
		t.Fatalf("expected valid before TTL, got ok=%v expired=%v", ok, expired)
	}
	time.Sleep(80 * time.Millisecond)
	// After expiry — expired
	ok, expired = lm.Validate(tok)
	if ok || !expired {
		t.Fatalf("expected expired after TTL, got ok=%v expired=%v", ok, expired)
	}
}

func TestLockManager_Heartbeat_ResetsExpiry(t *testing.T) {
	lm := newLockManagerWithTTL(80 * time.Millisecond)
	tok, _ := lm.Acquire("c.pkl")
	time.Sleep(60 * time.Millisecond)
	// Heartbeat before expiry
	if err := lm.Heartbeat(tok); err != nil {
		t.Fatalf("Heartbeat: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	// TTL was reset so 50ms since heartbeat < 80ms TTL
	ok, expired := lm.Validate(tok)
	if !ok || expired {
		t.Fatalf("expected still valid after heartbeat, got ok=%v expired=%v", ok, expired)
	}
}

func TestLockManager_Release_Invalidates(t *testing.T) {
	lm := NewLockManager()
	tok, _ := lm.Acquire("d.pkl")
	lm.Release(tok)
	ok, expired := lm.Validate(tok)
	if ok || expired {
		t.Fatalf("expected not-valid after release, got ok=%v expired=%v", ok, expired)
	}
}

func TestLockManager_Sweep_RunsWithContext(t *testing.T) {
	lm := newLockManagerWithTTL(20 * time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	lm.StartSweep(ctx)
	tok, _ := lm.Acquire("e.pkl")
	time.Sleep(60 * time.Millisecond)
	// After sweep has run, expired lock should be gone from the map
	_ = tok
	cancel()
}
