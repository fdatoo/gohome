package interestingness_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/interestingness"
)

func TestCausationDetector_Category(t *testing.T) {
	d := interestingness.NewCausationDetector(interestingness.CausationConfig{})
	assert.Equal(t, interestingness.CategoryCausation, d.Category())
}

func TestCausationDetector_AutomationTrigger(t *testing.T) {
	d := interestingness.NewCausationDetector(interestingness.CausationConfig{})
	ctx := context.Background()

	tags, err := d.Examine(ctx, eventstore.Event{
		Kind:          "automation.triggered",
		CorrelationID: uuid.New(),
	})
	require.NoError(t, err)
	assert.Len(t, tags, 1)
	assert.Equal(t, "automation_triggered", tags[0].Name)
}

func TestCausationDetector_HighFanOut(t *testing.T) {
	// Default threshold is 10; sending 10 events in the same correlation group
	// should fire the tag exactly once.
	d := interestingness.NewCausationDetector(interestingness.CausationConfig{FanOutThreshold: 5})
	ctx := context.Background()
	corrID := uuid.New()

	var tagCount int
	for i := 0; i < 8; i++ {
		tags, err := d.Examine(ctx, eventstore.Event{
			Kind:          "state.changed",
			CorrelationID: corrID,
		})
		require.NoError(t, err)
		tagCount += len(tags)
	}
	// Should fire exactly once when count reaches threshold.
	assert.Equal(t, 1, tagCount, "high_fan_out should fire exactly once")
}

func TestCausationDetector_NoTagBelowThreshold(t *testing.T) {
	d := interestingness.NewCausationDetector(interestingness.CausationConfig{FanOutThreshold: 10})
	ctx := context.Background()
	corrID := uuid.New()

	var tags []interestingness.Tag
	for i := 0; i < 5; i++ {
		got, err := d.Examine(ctx, eventstore.Event{
			Kind:          "state.changed",
			CorrelationID: corrID,
		})
		require.NoError(t, err)
		tags = append(tags, got...)
	}
	assert.Empty(t, tags, "should not tag below fan-out threshold")
}
