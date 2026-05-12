package config

import (
	"sync"
	"testing"
	"time"
)

func TestPubsub_PublishToSingleSubscriber(t *testing.T) {
	ps := NewConfigPubsub(16)
	ch, _ := ps.Subscribe()

	ps.Publish(ConfigChangedEvent{AtUnixMs: 100, BundleHash: "h1"})
	select {
	case ev := <-ch:
		if ev.AtUnixMs != 100 || ev.BundleHash != "h1" {
			t.Errorf("got %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("did not receive event")
	}
}

func TestPubsub_FanOut(t *testing.T) {
	ps := NewConfigPubsub(16)
	ch1, _ := ps.Subscribe()
	ch2, _ := ps.Subscribe()
	ch3, _ := ps.Subscribe()

	ps.Publish(ConfigChangedEvent{AtUnixMs: 200, BundleHash: "h2"})

	for i, ch := range []<-chan ConfigChangedEvent{ch1, ch2, ch3} {
		select {
		case ev := <-ch:
			if ev.BundleHash != "h2" {
				t.Errorf("subscriber %d got %q", i, ev.BundleHash)
			}
		case <-time.After(time.Second):
			t.Fatalf("subscriber %d did not receive event", i)
		}
	}
}

func TestPubsub_UnsubscribeStopsDelivery(t *testing.T) {
	ps := NewConfigPubsub(16)
	ch, unsubscribe := ps.Subscribe()

	unsubscribe()
	ps.Publish(ConfigChangedEvent{AtUnixMs: 300, BundleHash: "h3"})

	select {
	case ev, ok := <-ch:
		if ok {
			t.Errorf("expected channel closed, got event %+v", ev)
		}
	case <-time.After(100 * time.Millisecond):
		// Channel may be closed or never receive; either is acceptable.
	}
}

func TestPubsub_DropsOldestOnFullBuffer(t *testing.T) {
	ps := NewConfigPubsub(2)
	ch, _ := ps.Subscribe()

	ps.Publish(ConfigChangedEvent{AtUnixMs: 1, BundleHash: "h1"})
	ps.Publish(ConfigChangedEvent{AtUnixMs: 2, BundleHash: "h2"})
	ps.Publish(ConfigChangedEvent{AtUnixMs: 3, BundleHash: "h3"})

	got := []string{}
	for i := 0; i < 2; i++ {
		select {
		case ev := <-ch:
			got = append(got, ev.BundleHash)
		case <-time.After(100 * time.Millisecond):
			t.Fatalf("expected 2 events, got %d", i)
		}
	}
	if len(got) != 2 || got[0] != "h2" || got[1] != "h3" {
		t.Errorf("want [h2, h3], got %v", got)
	}
}

func TestPubsub_ConcurrentPublishSafe(t *testing.T) {
	ps := NewConfigPubsub(128)
	ch, _ := ps.Subscribe()

	var wg sync.WaitGroup
	const n = 100
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ps.Publish(ConfigChangedEvent{AtUnixMs: int64(i)})
		}(i)
	}
	wg.Wait()

	count := 0
	timeout := time.After(time.Second)
	for {
		select {
		case <-ch:
			count++
			if count >= n {
				return
			}
		case <-timeout:
			t.Fatalf("got %d / %d events before timeout", count, n)
		}
	}
}
