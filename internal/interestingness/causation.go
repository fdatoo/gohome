package interestingness

import (
	"context"
	"fmt"
	"sync"

	"github.com/google/uuid"

	"github.com/fdatoo/switchyard/internal/eventstore"
)

// DefaultFanOutThreshold is the number of downstream events from a single
// correlation group that triggers a high_fan_out tag.
const DefaultFanOutThreshold = 10

// CausationConfig holds tunable thresholds for the CausationDetector.
type CausationConfig struct {
	// FanOutThreshold is the max downstream event count before tagging high_fan_out.
	// Defaults to DefaultFanOutThreshold.
	FanOutThreshold int
}

func (c *CausationConfig) withDefaults() {
	if c.FanOutThreshold == 0 {
		c.FanOutThreshold = DefaultFanOutThreshold
	}
}

// correlationWindow tracks how many events have been seen for a correlation group.
type correlationWindow struct {
	count int
	fired bool
}

// CausationDetector tags high fan-out correlation groups, automation triggers,
// and state changes without a preceding command.
type CausationDetector struct {
	cfg CausationConfig

	mu      sync.Mutex
	windows map[uuid.UUID]*correlationWindow
}

// NewCausationDetector creates a CausationDetector with the given config.
func NewCausationDetector(cfg CausationConfig) *CausationDetector {
	cfg.withDefaults()
	return &CausationDetector{
		cfg:     cfg,
		windows: make(map[uuid.UUID]*correlationWindow),
	}
}

// Category implements Detector.
func (d *CausationDetector) Category() Category { return CategoryCausation }

// Examine implements Detector.
func (d *CausationDetector) Examine(_ context.Context, e eventstore.Event) ([]Tag, error) {
	var tags []Tag

	// Automation trigger detection.
	if e.Kind == "automation.triggered" {
		tags = append(tags, Tag{
			Category:    CategoryCausation,
			Name:        "automation_triggered",
			Explanation: "An automation was triggered, cascading downstream events",
		})
	}

	// High fan-out detection — track event count per correlation group.
	corrID := e.CorrelationID
	if corrID == (uuid.UUID{}) {
		return tags, nil
	}

	d.mu.Lock()
	w, ok := d.windows[corrID]
	if !ok {
		w = &correlationWindow{}
		d.windows[corrID] = w
	}
	w.count++
	count := w.count
	fired := w.fired
	if count >= d.cfg.FanOutThreshold && !fired {
		w.fired = true
	}
	d.mu.Unlock()

	if count >= d.cfg.FanOutThreshold && !fired {
		tags = append(tags, Tag{
			Category:    CategoryCausation,
			Name:        "high_fan_out",
			Explanation: fmt.Sprintf("Correlation group produced %d downstream events (threshold: %d)", count, d.cfg.FanOutThreshold),
		})
	}

	return tags, nil
}
