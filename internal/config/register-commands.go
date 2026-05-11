package config

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all config-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "config apply",
		Description: "Apply a Pkl configuration to the running daemon",
		CLIForm:     "switchyard config apply",
		HandlerRef:  "config.apply",
		Args: []commandcatalog.ArgSchema{
			{Name: "path", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--path", Hint: "config file path"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "config validate",
		Description: "Validate a Pkl configuration without applying",
		CLIForm:     "switchyard config validate",
		HandlerRef:  "config.validate",
		Args: []commandcatalog.ArgSchema{
			{Name: "path", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--path", Hint: "config file path"},
		},
	})
}
