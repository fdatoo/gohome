package interestingness_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/interestingness"
)

func TestConfigurationDetector_Category(t *testing.T) {
	d := interestingness.NewConfigurationDetector()
	assert.Equal(t, interestingness.CategoryConfiguration, d.Category())
}

func TestConfigurationDetector_ConfigApplied(t *testing.T) {
	d := interestingness.NewConfigurationDetector()
	tags, err := d.Examine(context.Background(), eventstore.Event{Kind: "config.applied"})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, interestingness.CategoryConfiguration, tags[0].Category)
	assert.Equal(t, "config_applied", tags[0].Name)
}

func TestConfigurationDetector_DriverRestarted(t *testing.T) {
	d := interestingness.NewConfigurationDetector()
	tags, err := d.Examine(context.Background(), eventstore.Event{Kind: "driver.restarted"})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, "driver_restarted", tags[0].Name)
}

func TestConfigurationDetector_NoTagForOtherEvents(t *testing.T) {
	d := interestingness.NewConfigurationDetector()
	tags, err := d.Examine(context.Background(), eventstore.Event{Kind: "state.changed"})
	require.NoError(t, err)
	assert.Empty(t, tags)
}
