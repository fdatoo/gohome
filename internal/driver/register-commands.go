// Package driver owns driver management verbs in the command catalog.
// TODO(plan-04): add real driver management logic when Plan 04 ships.
package driver

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all driver-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "driver restart",
		Description: "Restart a driver instance",
		CLIForm:     "switchyard driver restart <name>",
		HandlerRef:  "driver.restart",
		Args: []commandcatalog.ArgSchema{
			{Name: "name", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--name", Hint: "driver name"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "driver logs",
		Description: "Show recent logs for a driver",
		CLIForm:     "switchyard driver logs <name>",
		HandlerRef:  "driver.logs",
		Args: []commandcatalog.ArgSchema{
			{Name: "name", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--name", Hint: "driver name"},
			{Name: "lines", Type: commandcatalog.ArgTypeInt, Required: false, CLIFlag: "--lines", Hint: "number of lines"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "driver list",
		Description: "List all configured drivers",
		CLIForm:     "switchyard driver list",
		HandlerRef:  "driver.list",
		Args:        nil,
	})
}
