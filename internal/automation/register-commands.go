package automation

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all automation-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "automation run",
		Description: "Manually trigger an automation",
		CLIForm:     "switchyard automation run <id>",
		HandlerRef:  "automation.run",
		Args: []commandcatalog.ArgSchema{
			{Name: "id", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--id", Hint: "automation id"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "automation enable",
		Description: "Enable an automation",
		CLIForm:     "switchyard automation enable <id>",
		HandlerRef:  "automation.enable",
		Args: []commandcatalog.ArgSchema{
			{Name: "id", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--id", Hint: "automation id"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "automation disable",
		Description: "Disable an automation",
		CLIForm:     "switchyard automation disable <id>",
		HandlerRef:  "automation.disable",
		Args: []commandcatalog.ArgSchema{
			{Name: "id", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--id", Hint: "automation id"},
		},
	})
}
