package interestingness

import (
	"context"

	"github.com/fdatoo/switchyard/internal/eventstore"
)

// configKinds maps event kinds to tag names for the ConfigurationDetector.
var configKinds = map[string]string{
	"config.applied":       "config_applied",
	"driver.restarted":     "driver_restarted",
	"automation.deployed":  "automation_deployed",
	"widgetpack.installed": "widgetpack_installed",
}

// ConfigurationDetector tags configuration-change events.
// It does not require any state — each event is evaluated independently.
type ConfigurationDetector struct{}

// NewConfigurationDetector creates a ConfigurationDetector.
func NewConfigurationDetector() *ConfigurationDetector { return &ConfigurationDetector{} }

// Category implements Detector.
func (d *ConfigurationDetector) Category() Category { return CategoryConfiguration }

// Examine implements Detector.
func (d *ConfigurationDetector) Examine(_ context.Context, e eventstore.Event) ([]Tag, error) {
	name, ok := configKinds[e.Kind]
	if !ok {
		return nil, nil
	}
	return []Tag{{
		Category:    CategoryConfiguration,
		Name:        name,
		Explanation: "Configuration change event: " + e.Kind,
	}}, nil
}
