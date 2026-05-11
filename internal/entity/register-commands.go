// Package entity owns entity-related verbs in the command catalog.
// TODO(plan-02): add real entity management logic when Plan 02 ships.
package entity

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all entity-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "entity get",
		Description: "Fetch a single entity by ID",
		CLIForm:     "switchyard entity get <id>",
		HandlerRef:  "entity.get",
		Args: []commandcatalog.ArgSchema{
			{Name: "id", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--id", Hint: "entity id"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "entity call-capability",
		Description: "Call a capability on an entity",
		CLIForm:     "switchyard entity call <id> <capability>",
		HandlerRef:  "entity.call-capability",
		Args: []commandcatalog.ArgSchema{
			{Name: "id", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--id", Hint: "entity id"},
			{Name: "capability", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--capability", Hint: "capability name"},
			{Name: "args", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--args", Hint: "JSON args"},
		},
	})
}
