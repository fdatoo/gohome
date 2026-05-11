package interestingness_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/interestingness"
)

func TestFailureDetector_Category(t *testing.T) {
	d := interestingness.NewFailureDetector()
	assert.Equal(t, interestingness.CategoryFailure, d.Category())
}

func TestFailureDetector_CmdFailed(t *testing.T) {
	d := interestingness.NewFailureDetector()
	ctx := context.Background()

	tags, err := d.Examine(ctx, eventstore.Event{Kind: "cmd.failed"})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, interestingness.CategoryFailure, tags[0].Category)
	assert.Equal(t, "command_failed", tags[0].Name)
}

func TestFailureDetector_DriverDisconnected(t *testing.T) {
	d := interestingness.NewFailureDetector()
	ctx := context.Background()

	tags, err := d.Examine(ctx, eventstore.Event{Kind: "driver.disconnected"})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, "driver_disconnected", tags[0].Name)
}

func TestFailureDetector_AuthFailed(t *testing.T) {
	d := interestingness.NewFailureDetector()
	tags, err := d.Examine(context.Background(), eventstore.Event{Kind: "auth.failed"})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	assert.Equal(t, "auth_failed", tags[0].Name)
}

func TestFailureDetector_NoTagForNonFailure(t *testing.T) {
	d := interestingness.NewFailureDetector()
	tags, err := d.Examine(context.Background(), eventstore.Event{Kind: "state.changed"})
	require.NoError(t, err)
	assert.Empty(t, tags)
}
