package interestingness_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/interestingness"
)

func TestSecurityDetector_Category(t *testing.T) {
	d := interestingness.NewSecurityDetector(interestingness.SecurityConfig{})
	assert.Equal(t, interestingness.CategorySecurity, d.Category())
}

func TestSecurityDetector_RepeatedAuthFailed(t *testing.T) {
	// 3 auth failures in window should fire repeated_auth_failed.
	d := interestingness.NewSecurityDetector(interestingness.SecurityConfig{
		RepeatedAuthFailedThreshold: 3,
		AuthFailedWindow:            5 * time.Minute,
		// Disable after-hours to isolate test.
		QuietHoursStart: 0,
		QuietHoursEnd:   0,
	})
	ctx := context.Background()
	now := time.Date(2024, 1, 1, 14, 0, 0, 0, time.UTC) // 2 PM, normal hours

	var lastTags []interestingness.Tag
	for i := 0; i < 3; i++ {
		tags, err := d.Examine(ctx, eventstore.Event{
			Kind:      "auth.failed",
			Source:    "attacker",
			Timestamp: now.Add(time.Duration(i) * time.Minute),
		})
		require.NoError(t, err)
		lastTags = tags
	}
	require.NotEmpty(t, lastTags)
	assert.Equal(t, "repeated_auth_failed", lastTags[0].Name)
}

func TestSecurityDetector_BelowRepeatedAuthThreshold(t *testing.T) {
	d := interestingness.NewSecurityDetector(interestingness.SecurityConfig{
		RepeatedAuthFailedThreshold: 5,
		AuthFailedWindow:            5 * time.Minute,
		QuietHoursStart:             0,
		QuietHoursEnd:               0,
	})
	ctx := context.Background()
	now := time.Date(2024, 1, 1, 14, 0, 0, 0, time.UTC)

	for i := 0; i < 3; i++ {
		tags, err := d.Examine(ctx, eventstore.Event{
			Kind:      "auth.failed",
			Source:    "user",
			Timestamp: now.Add(time.Duration(i) * time.Minute),
		})
		require.NoError(t, err)
		for _, tag := range tags {
			assert.NotEqual(t, "repeated_auth_failed", tag.Name)
		}
	}
}

func TestSecurityDetector_AfterHoursActivity(t *testing.T) {
	d := interestingness.NewSecurityDetector(interestingness.SecurityConfig{
		QuietHoursStart:             22,
		QuietHoursEnd:               6,
		RepeatedAuthFailedThreshold: 100, // effectively disabled
		AuthFailedWindow:            time.Minute,
	})
	ctx := context.Background()

	// 11 PM — after hours.
	afterHours := time.Date(2024, 1, 1, 23, 0, 0, 0, time.UTC)
	tags, err := d.Examine(ctx, eventstore.Event{
		Kind:      "state.changed",
		Timestamp: afterHours,
	})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, "after_hours_activity", tags[0].Name)
}

func TestSecurityDetector_NormalHoursNoTag(t *testing.T) {
	d := interestingness.NewSecurityDetector(interestingness.SecurityConfig{
		QuietHoursStart:             22,
		QuietHoursEnd:               6,
		RepeatedAuthFailedThreshold: 100,
		AuthFailedWindow:            time.Minute,
	})
	ctx := context.Background()

	// 2 PM — normal hours.
	normalHours := time.Date(2024, 1, 1, 14, 0, 0, 0, time.UTC)
	tags, err := d.Examine(ctx, eventstore.Event{
		Kind:      "state.changed",
		Timestamp: normalHours,
	})
	require.NoError(t, err)
	assert.Empty(t, tags)
}
