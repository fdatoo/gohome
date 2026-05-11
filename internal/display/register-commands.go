// Package display owns display/pairing verbs in the command catalog.
// TODO(plan-08): add real display management logic when Plan 08 ships.
package display

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all display-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "display pair",
		Description: "Pair a new display with this Switchyard instance",
		CLIForm:     "switchyard display pair",
		HandlerRef:  "display.pair",
		Args:        nil,
	})

	r.Register(commandcatalog.Verb{
		Name:        "display configure",
		Description: "Configure a paired display",
		CLIForm:     "switchyard display configure <id>",
		HandlerRef:  "display.configure",
		Args: []commandcatalog.ArgSchema{
			{Name: "id", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--id", Hint: "display id"},
		},
	})
}
