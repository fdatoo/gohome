package activity_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	activityv1 "github.com/fdatoo/switchyard/gen/switchyard/activity/v1"
	"github.com/fdatoo/switchyard/internal/activity"
)

// newMockService returns an ActivityService in mock mode.
func newMockService(t *testing.T) *activity.ActivityService {
	t.Helper()
	return activity.NewActivityService(nil, activity.ActivityServiceConfig{
		Mock:            true,
		SavedQueriesDir: t.TempDir(),
	})
}

// collectStories calls Stories and collects all returned stories.
func collectStories(t *testing.T, svc *activity.ActivityService, filter *activityv1.StoriesFilter) []*activityv1.Story {
	t.Helper()
	return svc.ListStories(context.Background(), &activityv1.StoriesRequest{Filter: filter})
}

// collectEvents calls Events and collects all returned events.
func collectEvents(t *testing.T, svc *activity.ActivityService, filter *activityv1.EventsFilter) []*activityv1.EventRecord {
	t.Helper()
	return svc.ListEvents(context.Background(), &activityv1.EventsRequest{Filter: filter})
}

// TestStoriesReturnsStoriesInReverseChronological verifies Stories returns
// synthetic stories (mock=true) in reverse-chronological order.
func TestStoriesReturnsStoriesInReverseChronological(t *testing.T) {
	svc := newMockService(t)
	collected := collectStories(t, svc, nil)

	assert.Greater(t, len(collected), 0, "expected at least one story")

	// Verify reverse-chronological: each story's occurred_at >= next's.
	for i := 1; i < len(collected); i++ {
		prev := collected[i-1].GetOccurredAt().AsTime()
		curr := collected[i].GetOccurredAt().AsTime()
		assert.True(t, !prev.Before(curr),
			"story %d (t=%v) should be >= story %d (t=%v)", i-1, prev, i, curr)
	}
}

// TestStoriesFilteredByFailureCategory verifies interesting_category filter.
func TestStoriesFilteredByFailureCategory(t *testing.T) {
	svc := newMockService(t)
	collected := collectStories(t, svc, &activityv1.StoriesFilter{
		InterestingCategory: "failure",
	})

	require.NotEmpty(t, collected, "expected at least one story with failure tag")
	for _, story := range collected {
		hasFailure := false
		for _, tag := range story.Tags {
			if tag.Category == "failure" {
				hasFailure = true
				break
			}
		}
		assert.True(t, hasFailure, "story %s should have a failure tag", story.Id)
	}
}

// TestStoriesFilteredByEntityIds verifies the entity_ids set filter.
// Stories touch entities; the set filter passes a story if any of its
// entities is in the set. Union with entity_id (singular).
func TestStoriesFilteredByEntityIds(t *testing.T) {
	svc := newMockService(t)

	// Set filter alone: only stories touching light/kitchen pass.
	collected := collectStories(t, svc, &activityv1.StoriesFilter{
		EntityIds: []string{"light/kitchen"},
	})
	require.NotEmpty(t, collected, "expected stories matching light/kitchen")
	for _, s := range collected {
		hit := false
		for _, eid := range s.EntityIds {
			if eid == "light/kitchen" {
				hit = true
				break
			}
		}
		assert.True(t, hit, "story %s entityIds=%v missing light/kitchen", s.Id, s.EntityIds)
	}

	// Union: entity_id + entity_ids both contribute. A story touching
	// EITHER value passes.
	union := collectStories(t, svc, &activityv1.StoriesFilter{
		EntityId:  "light/bedroom",
		EntityIds: []string{"sensor/outdoor_temp"},
	})
	require.NotEmpty(t, union, "expected stories matching the union")
	for _, s := range union {
		hit := false
		for _, eid := range s.EntityIds {
			if eid == "light/bedroom" || eid == "sensor/outdoor_temp" {
				hit = true
				break
			}
		}
		assert.True(t, hit, "story %s entityIds=%v missing union members", s.Id, s.EntityIds)
	}

	// Empty filter: no entity filter applied.
	all := collectStories(t, svc, nil)
	bothEmpty := collectStories(t, svc, &activityv1.StoriesFilter{})
	assert.Equal(t, len(all), len(bothEmpty), "empty filter should pass everything")
}

// TestEventsFilteredByKindCmd verifies kind filter on Events.
func TestEventsFilteredByKindCmd(t *testing.T) {
	svc := newMockService(t)
	collected := collectEvents(t, svc, &activityv1.EventsFilter{Kind: "cmd.issued"})

	for _, ev := range collected {
		assert.Equal(t, "cmd.issued", ev.Kind)
	}
}

// TestEventDetailForKnownEvent verifies EventDetail returns the event.
func TestEventDetailForKnownEvent(t *testing.T) {
	svc := newMockService(t)
	ctx := context.Background()

	// Get a valid event ID from the mock.
	events := collectEvents(t, svc, nil)
	require.NotEmpty(t, events, "expected at least one event from mock")
	eventID := events[0].EventId

	resp, err := svc.EventDetail(ctx, connect.NewRequest(&activityv1.EventDetailRequest{EventId: eventID}))
	require.NoError(t, err)
	assert.Equal(t, eventID, resp.Msg.Event.EventId)
}

// TestSavedQueryRoundTrip verifies SaveQuery → ListSavedQueries → DeleteSavedQuery.
func TestSavedQueryRoundTrip(t *testing.T) {
	svc := newMockService(t)
	ctx := context.Background()

	// Save a query.
	saveResp, err := svc.SaveQuery(ctx, connect.NewRequest(&activityv1.SaveQueryRequest{
		Name:   "My Query",
		Filter: "kind:cmd since:1h",
		Cron:   "*/5 * * * *",
	}))
	require.NoError(t, err)
	require.NotEmpty(t, saveResp.Msg.Query.Id)
	assert.Equal(t, "My Query", saveResp.Msg.Query.Name)

	// List — should contain the saved query.
	listResp, err := svc.ListSavedQueries(ctx, connect.NewRequest(&activityv1.ListSavedQueriesRequest{}))
	require.NoError(t, err)
	require.Len(t, listResp.Msg.Queries, 1)
	assert.Equal(t, "My Query", listResp.Msg.Queries[0].Name)

	// Delete.
	_, err = svc.DeleteSavedQuery(ctx, connect.NewRequest(&activityv1.DeleteSavedQueryRequest{
		Id: saveResp.Msg.Query.Id,
	}))
	require.NoError(t, err)

	// List — should be empty.
	listResp2, err := svc.ListSavedQueries(ctx, connect.NewRequest(&activityv1.ListSavedQueriesRequest{}))
	require.NoError(t, err)
	assert.Empty(t, listResp2.Msg.Queries)
}

// TestMockModeCoverAllCategories verifies that mock mode returns stories for
// all seven interestingness categories.
func TestMockModeCoverAllCategories(t *testing.T) {
	svc := newMockService(t)
	collected := collectStories(t, svc, nil)

	categories := map[string]bool{}
	for _, story := range collected {
		for _, tag := range story.Tags {
			categories[tag.Category] = true
		}
	}

	expected := []string{"failure", "performance", "causation", "anomaly", "security", "configuration", "novelty"}
	for _, cat := range expected {
		assert.True(t, categories[cat], "expected story with category %q", cat)
	}
}
