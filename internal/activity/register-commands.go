// Package activity owns event-related verbs in the command catalog.
// TODO(plan-03): add real event streaming/query logic when Plan 03 ships.
package activity

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all activity-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "events tail",
		Description: "Stream live events from the event store",
		CLIForm:     "switchyard event tail",
		HandlerRef:  "events.tail",
		Args: []commandcatalog.ArgSchema{
			{Name: "source", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--source", Hint: "driver name"},
			{Name: "kind", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--kind", Hint: "event kind"},
			{Name: "entity", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--entity", Hint: "entity id"},
			{Name: "since", Type: commandcatalog.ArgTypeDuration, Required: false, CLIFlag: "--since", Hint: "e.g. 1h"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "events query",
		Description: "Query the event store with filters",
		CLIForm:     "switchyard event query",
		HandlerRef:  "events.query",
		Args: []commandcatalog.ArgSchema{
			{Name: "kind", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--kind", Hint: "event kind"},
			{Name: "source", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--source", Hint: "driver name"},
			{Name: "entity", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--entity", Hint: "entity id"},
			{Name: "issuedBy", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--issued-by", Hint: "user slug"},
			{Name: "since", Type: commandcatalog.ArgTypeDuration, Required: false, CLIFlag: "--since", Hint: "e.g. 1h"},
			{Name: "until", Type: commandcatalog.ArgTypeDuration, Required: false, CLIFlag: "--until", Hint: "e.g. 30m"},
			{Name: "limit", Type: commandcatalog.ArgTypeInt, Required: false, CLIFlag: "--limit", Hint: "max results"},
		},
	})
}
