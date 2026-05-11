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

func TestNoveltyDetector_Category(t *testing.T) {
	d := interestingness.NewNoveltyDetector(interestingness.NoveltyConfig{})
	assert.Equal(t, interestingness.CategoryNovelty, d.Category())
}

func TestNoveltyDetector_FirstSeenEntity(t *testing.T) {
	d := interestingness.NewNoveltyDetector(interestingness.NoveltyConfig{})
	ctx := context.Background()

	tags, err := d.Examine(ctx, eventstore.Event{
		Entity:    "light/new_lamp",
		Kind:      "state.changed",
		Timestamp: time.Now(),
	})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, "first_seen_entity", tags[0].Name)
}

func TestNoveltyDetector_EntitySeenTwiceNoSecondTag(t *testing.T) {
	d := interestingness.NewNoveltyDetector(interestingness.NoveltyConfig{})
	ctx := context.Background()

	_, _ = d.Examine(ctx, eventstore.Event{Entity: "light/old_lamp", Kind: "state.changed", Timestamp: time.Now()})
	tags, err := d.Examine(ctx, eventstore.Event{Entity: "light/old_lamp", Kind: "state.changed", Timestamp: time.Now()})
	require.NoError(t, err)
	for _, tag := range tags {
		assert.NotEqual(t, "first_seen_entity", tag.Name, "second event for same entity should not re-fire first_seen")
	}
}

func TestNoveltyDetector_RareCommand(t *testing.T) {
	d := interestingness.NewNoveltyDetector(interestingness.NoveltyConfig{
		RareCommandThreshold: 14 * 24 * time.Hour,
	})
	ctx := context.Background()
	now := time.Now()

	// First command — records last-seen, no rare tag.
	_, err := d.Examine(ctx, eventstore.Event{
		Kind:      "cmd.issued",
		Source:    "cli",
		Timestamp: now.Add(-20 * 24 * time.Hour), // 20 days ago
	})
	require.NoError(t, err)

	// Second command 20 days later — exceeds 14-day threshold.
	tags, err := d.Examine(ctx, eventstore.Event{
		Kind:      "cmd.issued",
		Source:    "cli",
		Timestamp: now,
	})
	require.NoError(t, err)
	var rareTag *interestingness.Tag
	for i := range tags {
		if tags[i].Name == "rare_command" {
			rareTag = &tags[i]
			break
		}
	}
	require.NotNil(t, rareTag, "expected rare_command tag")
}
