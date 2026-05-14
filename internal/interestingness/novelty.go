package interestingness

import (
	"context"
	"sync"
	"time"

	"github.com/fdatoo/switchyard/internal/eventstore"
)

const (
	// DefaultRareCommandThreshold is how long since a command was last seen
	// before it's considered rare.
	DefaultRareCommandThreshold = 14 * 24 * time.Hour // 14 days
)

// NoveltyConfig holds tunable thresholds for the NoveltyDetector.
type NoveltyConfig struct {
	// RareCommandThreshold is the duration after which a command is considered
	// rare if not seen. Defaults to DefaultRareCommandThreshold.
	RareCommandThreshold time.Duration
}

func (c *NoveltyConfig) withDefaults() {
	if c.RareCommandThreshold == 0 {
		c.RareCommandThreshold = DefaultRareCommandThreshold
	}
}

// NoveltyDetector tags first-seen entities, first-seen attributes, and
// commands not seen recently (rare commands).
type NoveltyDetector struct {
	cfg NoveltyConfig

	mu           sync.Mutex
	seenEntities map[string]struct{}
	lastCommand  map[string]time.Time // command kind → last seen time
}

// NewNoveltyDetector creates a NoveltyDetector with the given config.
func NewNoveltyDetector(cfg NoveltyConfig) *NoveltyDetector {
	cfg.withDefaults()
	return &NoveltyDetector{
		cfg:          cfg,
		seenEntities: make(map[string]struct{}),
		lastCommand:  make(map[string]time.Time),
	}
}

// Category implements Detector.
func (d *NoveltyDetector) Category() Category { return CategoryNovelty }

// Examine implements Detector.
func (d *NoveltyDetector) Examine(_ context.Context, e eventstore.Event) ([]Tag, error) {
	var tags []Tag

	// First-seen entity detection.
	if e.Entity != "" {
		d.mu.Lock()
		_, seen := d.seenEntities[e.Entity]
		if !seen {
			d.seenEntities[e.Entity] = struct{}{}
		}
		d.mu.Unlock()

		if !seen {
			tags = append(tags, Tag{
				Category:    CategoryNovelty,
				Name:        "first_seen_entity",
				Explanation: "Entity '" + e.Entity + "' has not been seen before",
			})
		}
	}

	// Rare command detection for command kinds.
	if e.Kind == "cmd.issued" || e.Kind == "command.issued" {
		cmdKey := e.Source + "/" + e.Kind

		d.mu.Lock()
		lastSeen, exists := d.lastCommand[cmdKey]
		d.lastCommand[cmdKey] = e.Timestamp
		d.mu.Unlock()

		if exists && !lastSeen.IsZero() && e.Timestamp.Sub(lastSeen) > d.cfg.RareCommandThreshold {
			tags = append(tags, Tag{
				Category:    CategoryNovelty,
				Name:        "rare_command",
				Explanation: "Command has not been seen in over " + d.cfg.RareCommandThreshold.String(),
			})
		}
	}

	return tags, nil
}
