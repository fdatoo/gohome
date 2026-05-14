// Package editsession — file watcher → session push integration.
// Implements a polling-based FileWatcher that detects external changes to
// watched Pkl files and pushes ExternalEditDetected events to active sessions.
package editsession

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"sync"
	"time"
)

const (
	defaultPollInterval = 500 * time.Millisecond
	eventBufferDuration = 60 * time.Second
	eventChanCapacity   = 64
)

// FileEvent carries an external-edit notification for a watched file.
type FileEvent struct {
	Path       string
	Hash       string
	ModifiedAt time.Time
}

// Subscriber holds the event channel for one session subscription.
type subscriber struct {
	ch   chan FileEvent
	path string
}

// FileWatcher polls watched Pkl files and pushes FileEvent to any subscribed
// sessions when file content changes.
type FileWatcher struct {
	pollInterval time.Duration

	mu          sync.Mutex
	watched     map[string]watchedFile // key: path
	subscribers []subscriber
}

type watchedFile struct {
	hash    string
	modTime time.Time
}

// NewFileWatcher creates a FileWatcher.
func NewFileWatcher(pollInterval time.Duration) *FileWatcher {
	if pollInterval <= 0 {
		pollInterval = defaultPollInterval
	}
	return &FileWatcher{
		pollInterval: pollInterval,
		watched:      make(map[string]watchedFile),
	}
}

// Start begins the polling loop. It stops when ctx is cancelled.
func (w *FileWatcher) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(w.pollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				w.poll()
			}
		}
	}()
}

// Subscribe registers a subscription for path. Returns a receive channel and
// an unsubscribe function. The channel is buffered with eventChanCapacity
// slots; slow readers will miss events but will not block the watcher.
func (w *FileWatcher) Subscribe(path string) (<-chan FileEvent, func()) {
	ch := make(chan FileEvent, eventChanCapacity)

	w.mu.Lock()
	// Record initial state so we can detect future changes.
	if _, known := w.watched[path]; !known {
		if h, mt, err := statFile(path); err == nil {
			w.watched[path] = watchedFile{hash: h, modTime: mt}
		}
	}
	sub := subscriber{ch: ch, path: path}
	w.subscribers = append(w.subscribers, sub)
	w.mu.Unlock()

	unsubscribe := func() {
		w.mu.Lock()
		defer w.mu.Unlock()
		for i, s := range w.subscribers {
			if s.ch == ch {
				w.subscribers = append(w.subscribers[:i], w.subscribers[i+1:]...)
				close(ch)
				break
			}
		}
	}
	return ch, unsubscribe
}

// poll checks all watched files for changes and notifies subscribers.
func (w *FileWatcher) poll() {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Collect unique paths from subscribers
	paths := make(map[string]struct{})
	for _, sub := range w.subscribers {
		paths[sub.path] = struct{}{}
	}

	for path := range paths {
		h, mt, err := statFile(path)
		if err != nil {
			continue
		}
		prev, known := w.watched[path]
		if !known || prev.hash != h {
			w.watched[path] = watchedFile{hash: h, modTime: mt}
			if !known {
				continue // first observation; don't emit event
			}
			evt := FileEvent{Path: path, Hash: h, ModifiedAt: mt}
			for _, sub := range w.subscribers {
				if sub.path == path {
					select {
					case sub.ch <- evt:
					default:
						// Channel full; drop event (subscriber too slow).
					}
				}
			}
		}
	}
}

// statFile returns the SHA-256 hex hash and modification time of the file.
func statFile(path string) (hash string, modTime time.Time, err error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", time.Time{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", time.Time{}, err
	}
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:]), info.ModTime(), nil
}

// WatcherSubscriber is the interface the editsession package exposes to the
// daemon so it can hook into the config file watcher. The daemon calls
// Subscribe to wire the config.Watcher → editsession push path.
type WatcherSubscriber interface {
	// Subscribe registers fn to be called when any file at path changes.
	Subscribe(path string) (<-chan FileEvent, func())
}
