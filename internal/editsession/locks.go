package editsession

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

const defaultLockTTL = 30 * time.Minute
const sweepInterval = time.Minute

// ErrLockExpired is returned by Heartbeat when the token has expired or does
// not exist.
var ErrLockExpired = errors.New("editsession: lock expired or not found")

// lockEntry holds the state for a single acquired lock.
type lockEntry struct {
	filePath  string
	expiresAt time.Time
}

// LockManager is an in-memory lock manager with TTL and heartbeat.
// Multiple sessions on the same file are permitted simultaneously.
// Server restart clears all sessions; clients receive LOCK_EXPIRED on next commit.
type LockManager struct {
	ttl time.Duration

	mu    sync.Mutex
	locks map[string]*lockEntry // key: token
}

// NewLockManager creates a LockManager with the default 30-minute TTL.
func NewLockManager() *LockManager {
	return newLockManagerWithTTL(defaultLockTTL)
}

// newLockManagerWithTTL creates a LockManager with a custom TTL (for tests).
func newLockManagerWithTTL(ttl time.Duration) *LockManager {
	return &LockManager{
		ttl:   ttl,
		locks: make(map[string]*lockEntry),
	}
}

// Acquire acquires a new lock token for filePath. Multiple tokens on the same
// file are allowed; first-to-commit wins.
func (m *LockManager) Acquire(filePath string) (string, error) {
	token, err := newToken()
	if err != nil {
		return "", err
	}
	m.mu.Lock()
	m.locks[token] = &lockEntry{
		filePath:  filePath,
		expiresAt: time.Now().Add(m.ttl),
	}
	m.mu.Unlock()
	return token, nil
}

// Validate returns (valid=true, expired=false) for a live token,
// (valid=false, expired=true) for an expired token, and
// (valid=false, expired=false) for an unknown token.
func (m *LockManager) Validate(token string) (valid, expired bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.locks[token]
	if !ok {
		return false, false
	}
	if time.Now().After(entry.expiresAt) {
		return false, true
	}
	return true, false
}

// FilePath returns the file path associated with the token, and whether the
// token exists (and is not expired).
func (m *LockManager) FilePath(token string) (filePath string, ok bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, exists := m.locks[token]
	if !exists {
		return "", false
	}
	if time.Now().After(entry.expiresAt) {
		return "", false
	}
	return entry.filePath, true
}

// Heartbeat resets the TTL for a token. Returns ErrLockExpired if the token
// is unknown or has already expired.
func (m *LockManager) Heartbeat(token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.locks[token]
	if !ok {
		return ErrLockExpired
	}
	if time.Now().After(entry.expiresAt) {
		return ErrLockExpired
	}
	entry.expiresAt = time.Now().Add(m.ttl)
	return nil
}

// Release removes a lock token. Safe to call multiple times (idempotent).
func (m *LockManager) Release(token string) {
	m.mu.Lock()
	delete(m.locks, token)
	m.mu.Unlock()
}

// StartSweep starts a background goroutine that prunes expired locks every
// minute. It stops when ctx is cancelled.
func (m *LockManager) StartSweep(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(sweepInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.sweep()
			}
		}
	}()
}

func (m *LockManager) sweep() {
	now := time.Now()
	m.mu.Lock()
	for token, entry := range m.locks {
		if now.After(entry.expiresAt) {
			delete(m.locks, token)
		}
	}
	m.mu.Unlock()
}

func newToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
