package interestingness

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/fdatoo/switchyard/internal/eventstore"
)

const (
	// DefaultRepeatedAuthFailedThreshold is the number of auth failures from
	// the same source within the rolling window that triggers a tag.
	DefaultRepeatedAuthFailedThreshold = 3

	// DefaultAuthFailedWindow is the rolling window for counting auth failures.
	DefaultAuthFailedWindow = 5 * time.Minute

	// DefaultQuietHoursStart is the hour (0-23) after which events are "after hours".
	DefaultQuietHoursStart = 22 // 10 PM

	// DefaultQuietHoursEnd is the hour (0-23) after which normal hours resume.
	DefaultQuietHoursEnd = 6 // 6 AM
)

// authFailRecord holds a timestamp for a single auth failure.
type authFailRecord struct {
	at time.Time
}

// SecurityConfig holds tunable thresholds for the SecurityDetector.
type SecurityConfig struct {
	// RepeatedAuthFailedThreshold is the failure count that triggers the tag.
	RepeatedAuthFailedThreshold int

	// AuthFailedWindow is the rolling window for counting auth failures.
	AuthFailedWindow time.Duration

	// QuietHoursStart is the hour (0-23) when quiet hours begin.
	QuietHoursStart int

	// QuietHoursEnd is the hour (0-23) when quiet hours end.
	QuietHoursEnd int

	// KnownSources is the allow-list of known source prefixes. An event whose
	// source doesn't match any prefix is tagged unknown_source.
	// If empty, the unknown_source tag is never emitted.
	KnownSources []string
}

func (c *SecurityConfig) withDefaults() {
	if c.RepeatedAuthFailedThreshold == 0 {
		c.RepeatedAuthFailedThreshold = DefaultRepeatedAuthFailedThreshold
	}
	if c.AuthFailedWindow == 0 {
		c.AuthFailedWindow = DefaultAuthFailedWindow
	}
	if c.QuietHoursStart == 0 && c.QuietHoursEnd == 0 {
		c.QuietHoursStart = DefaultQuietHoursStart
		c.QuietHoursEnd = DefaultQuietHoursEnd
	}
}

// SecurityDetector tags unknown sources, after-hours activity, and repeated auth failures.
type SecurityDetector struct {
	cfg SecurityConfig

	mu       sync.Mutex
	authFail map[string][]authFailRecord // source → recent failures
}

// NewSecurityDetector creates a SecurityDetector with the given config.
func NewSecurityDetector(cfg SecurityConfig) *SecurityDetector {
	cfg.withDefaults()
	return &SecurityDetector{
		cfg:      cfg,
		authFail: make(map[string][]authFailRecord),
	}
}

// Category implements Detector.
func (d *SecurityDetector) Category() Category { return CategorySecurity }

// Examine implements Detector.
func (d *SecurityDetector) Examine(_ context.Context, e eventstore.Event) ([]Tag, error) {
	var tags []Tag

	// Repeated auth failures rolling window.
	if e.Kind == "auth.failed" {
		source := e.Source
		if source == "" {
			source = "unknown"
		}

		d.mu.Lock()
		records := d.authFail[source]
		// Prune records outside window.
		cutoff := e.Timestamp.Add(-d.cfg.AuthFailedWindow)
		fresh := records[:0]
		for _, r := range records {
			if r.at.After(cutoff) {
				fresh = append(fresh, r)
			}
		}
		fresh = append(fresh, authFailRecord{at: e.Timestamp})
		d.authFail[source] = fresh
		count := len(fresh)
		d.mu.Unlock()

		if count >= d.cfg.RepeatedAuthFailedThreshold {
			tags = append(tags, Tag{
				Category:    CategorySecurity,
				Name:        "repeated_auth_failed",
				Explanation: fmt.Sprintf("Source '%s' failed authentication %d times within %s", source, count, d.cfg.AuthFailedWindow),
			})
		}
	}

	// After-hours detection.
	if !e.Timestamp.IsZero() {
		hour := e.Timestamp.Hour()
		afterHours := false
		if d.cfg.QuietHoursStart < d.cfg.QuietHoursEnd {
			afterHours = hour >= d.cfg.QuietHoursStart && hour < d.cfg.QuietHoursEnd
		} else {
			// Wraps midnight.
			afterHours = hour >= d.cfg.QuietHoursStart || hour < d.cfg.QuietHoursEnd
		}
		if afterHours {
			tags = append(tags, Tag{
				Category:    CategorySecurity,
				Name:        "after_hours_activity",
				Explanation: fmt.Sprintf("Event occurred at %02d:%02d, outside normal operating hours", hour, e.Timestamp.Minute()),
			})
		}
	}

	return tags, nil
}
