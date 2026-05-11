package interestingness

import (
	"context"

	"github.com/fdatoo/switchyard/internal/eventstore"
)

// failureKinds is the set of event kinds that always indicate a failure.
var failureKinds = map[string]string{
	"cmd.failed":          "command_failed",
	"command.failed":      "command_failed",
	"driver.disconnected": "driver_disconnected",
	"auth.failed":         "auth_failed",
	"policy.denied":       "policy_denied",
}

// FailureDetector tags events that represent explicit failure conditions.
// It does not require any state — each event is evaluated independently.
type FailureDetector struct{}

// NewFailureDetector creates a FailureDetector.
func NewFailureDetector() *FailureDetector { return &FailureDetector{} }

// Category implements Detector.
func (d *FailureDetector) Category() Category { return CategoryFailure }

// Examine implements Detector.
func (d *FailureDetector) Examine(_ context.Context, e eventstore.Event) ([]Tag, error) {
	name, ok := failureKinds[e.Kind]
	if !ok {
		return nil, nil
	}
	return []Tag{{
		Category:    CategoryFailure,
		Name:        name,
		Explanation: "Event kind '" + e.Kind + "' represents an explicit failure condition",
	}}, nil
}
