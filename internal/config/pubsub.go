package config

import "sync"

// ConfigChangedEvent is published on every successful Manager.Apply where
// the resulting snapshot's bundle_hash differs from the previously
// published one.
type ConfigChangedEvent struct {
	AtUnixMs   int64
	BundleHash string
}

// ConfigPubsub is a small fan-out broker for ConfigChangedEvent. Each
// Subscribe call returns a bounded buffered channel; if a subscriber falls
// behind by more than the buffer capacity, Publish drops the oldest pending
// event for that subscriber rather than blocking.
type ConfigPubsub struct {
	mu      sync.Mutex
	bufSize int
	subs    map[*subscriber]struct{}
}

type subscriber struct {
	ch chan ConfigChangedEvent
}

// NewConfigPubsub creates a broker with the given per-subscriber buffer.
// Recommended cap: 16.
func NewConfigPubsub(bufSize int) *ConfigPubsub {
	if bufSize <= 0 {
		bufSize = 16
	}
	return &ConfigPubsub{
		bufSize: bufSize,
		subs:    map[*subscriber]struct{}{},
	}
}

// Subscribe registers a new subscriber. Returns a receive-only channel and
// an unsubscribe function. The channel is closed when unsubscribe runs.
func (p *ConfigPubsub) Subscribe() (<-chan ConfigChangedEvent, func()) {
	s := &subscriber{ch: make(chan ConfigChangedEvent, p.bufSize)}
	p.mu.Lock()
	p.subs[s] = struct{}{}
	p.mu.Unlock()
	unsubscribe := func() {
		p.mu.Lock()
		if _, ok := p.subs[s]; ok {
			delete(p.subs, s)
			close(s.ch)
		}
		p.mu.Unlock()
	}
	return s.ch, unsubscribe
}

// Publish fans out the event to every current subscriber. If a
// subscriber's channel is full, the oldest pending event is dropped
// to make room.
func (p *ConfigPubsub) Publish(ev ConfigChangedEvent) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for s := range p.subs {
		sent := false
		for !sent {
			select {
			case s.ch <- ev:
				sent = true
			default:
				// Buffer full — drop oldest and retry once
				select {
				case <-s.ch:
					// Made room; loop will retry send
				default:
					// Shouldn't happen, but if it does, give up
					sent = true
				}
			}
		}
	}
}
