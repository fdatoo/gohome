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

func TestAnomalyDetector_Category(t *testing.T) {
	d := interestingness.NewAnomalyDetector(interestingness.AnomalyConfig{})
	assert.Equal(t, interestingness.CategoryAnomaly, d.Category())
}

func TestAnomalyDetector_NoDormancyOnFirstSeen(t *testing.T) {
	// First event for an entity should never produce a dormancy tag.
	d := interestingness.NewAnomalyDetector(interestingness.AnomalyConfig{
		DormancyThreshold: time.Hour,
	})
	ctx := context.Background()

	tags, err := d.Examine(ctx, eventstore.Event{
		Entity:    "light/kitchen",
		Kind:      "state.changed",
		Timestamp: time.Now(),
	})
	require.NoError(t, err)
	assert.Empty(t, tags, "first-seen entity should not trigger dormancy")
}

func TestAnomalyDetector_DormantEntityReappears(t *testing.T) {
	// Two events with a gap exceeding the threshold should fire dormant_entity_reappeared.
	d := interestingness.NewAnomalyDetector(interestingness.AnomalyConfig{
		DormancyThreshold: 2 * time.Hour,
	})
	ctx := context.Background()
	entity := "light/living_room"
	now := time.Now()

	// First event — records last-seen.
	_, err := d.Examine(ctx, eventstore.Event{
		Entity:    entity,
		Kind:      "state.changed",
		Timestamp: now,
	})
	require.NoError(t, err)

	// Second event 3 hours later — exceeds dormancy threshold.
	tags, err := d.Examine(ctx, eventstore.Event{
		Entity:    entity,
		Kind:      "state.changed",
		Timestamp: now.Add(3 * time.Hour),
	})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, interestingness.CategoryAnomaly, tags[0].Category)
	assert.Equal(t, "dormant_entity_reappeared", tags[0].Name)
}

func TestAnomalyDetector_NoTagBelowDormancyThreshold(t *testing.T) {
	// Gap smaller than threshold should produce no tag.
	d := interestingness.NewAnomalyDetector(interestingness.AnomalyConfig{
		DormancyThreshold: 24 * time.Hour,
	})
	ctx := context.Background()
	entity := "switch/garage"
	now := time.Now()

	_, _ = d.Examine(ctx, eventstore.Event{Entity: entity, Timestamp: now})

	tags, err := d.Examine(ctx, eventstore.Event{
		Entity:    entity,
		Kind:      "state.changed",
		Timestamp: now.Add(30 * time.Minute),
	})
	require.NoError(t, err)
	assert.Empty(t, tags)
}
