package interestingness

import (
	"context"
	"sync"
	"time"

	"github.com/fdatoo/switchyard/internal/eventstore"
)

const (
	// DefaultDormancyThreshold is how long without events before an entity is
	// considered dormant. An event from a dormant entity triggers a re-appearing tag.
	DefaultDormancyThreshold = 24 * time.Hour
)

// entityWindow tracks the min/max seen values and last-seen time for an entity.
type entityWindow struct {
	min      float64
	max      float64
	seen     int
	lastSeen time.Time
}

// AnomalyConfig holds tunable parameters for the AnomalyDetector.
type AnomalyConfig struct {
	// DormancyThreshold is the time without events after which an entity is
	// considered dormant. Defaults to DefaultDormancyThreshold.
	DormancyThreshold time.Duration
}

func (c *AnomalyConfig) withDefaults() {
	if c.DormancyThreshold == 0 {
		c.DormancyThreshold = DefaultDormancyThreshold
	}
}

// AnomalyDetector tags out-of-band values and dormant entity re-appearances.
type AnomalyDetector struct {
	cfg AnomalyConfig

	mu      sync.Mutex
	windows map[string]*entityWindow // entity → window
}

// NewAnomalyDetector creates an AnomalyDetector with the given config.
func NewAnomalyDetector(cfg AnomalyConfig) *AnomalyDetector {
	cfg.withDefaults()
	return &AnomalyDetector{
		cfg:     cfg,
		windows: make(map[string]*entityWindow),
	}
}

// Category implements Detector.
func (d *AnomalyDetector) Category() Category { return CategoryAnomaly }

// Examine implements Detector.
func (d *AnomalyDetector) Examine(_ context.Context, e eventstore.Event) ([]Tag, error) {
	if e.Entity == "" {
		return nil, nil
	}

	var tags []Tag

	d.mu.Lock()
	defer d.mu.Unlock()

	w, exists := d.windows[e.Entity]
	if !exists {
		w = &entityWindow{min: 0, max: 0, seen: 0}
		d.windows[e.Entity] = w
	}

	// Dormancy re-appearance check.
	if exists && w.seen > 0 && !w.lastSeen.IsZero() && e.Timestamp.Sub(w.lastSeen) > d.cfg.DormancyThreshold {
		tags = append(tags, Tag{
			Category:    CategoryAnomaly,
			Name:        "dormant_entity_reappeared",
			Explanation: "Entity " + e.Entity + " re-appeared after " + e.Timestamp.Sub(w.lastSeen).Round(time.Minute).String() + " of inactivity",
		})
	}

	w.lastSeen = e.Timestamp
	w.seen++

	return tags, nil
}
