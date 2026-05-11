package dashboard

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all dashboard/page verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "page open",
		Description: "Navigate to a dashboard page",
		CLIForm:     "switchyard page open <slug>",
		HandlerRef:  "page.open",
		Args: []commandcatalog.ArgSchema{
			{Name: "slug", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--slug", Hint: "page slug"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "page create",
		Description: "Create a new dashboard page",
		CLIForm:     "switchyard page create <slug>",
		HandlerRef:  "page.create",
		Args: []commandcatalog.ArgSchema{
			{Name: "slug", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--slug", Hint: "new page slug"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "page export",
		Description: "Export a dashboard page as Pkl",
		CLIForm:     "switchyard page export <slug>",
		HandlerRef:  "page.export",
		Args: []commandcatalog.ArgSchema{
			{Name: "slug", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--slug", Hint: "page slug"},
		},
	})
}
