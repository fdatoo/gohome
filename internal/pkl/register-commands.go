// Package pkl owns Pkl file management verbs in the command catalog.
// TODO(plan-07): add real Pkl file management logic when Plan 07 ships.
package pkl

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all pkl-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "pkl open",
		Description: "Open a Pkl file in the config editor",
		CLIForm:     "switchyard pkl open <path>",
		HandlerRef:  "pkl.open",
		Args: []commandcatalog.ArgSchema{
			{Name: "path", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--path", Hint: "file path"},
		},
	})
}
