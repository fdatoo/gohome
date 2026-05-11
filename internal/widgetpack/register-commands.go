package widgetpack

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all widget-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "widget install",
		Description: "Install a widget from an OCI registry",
		CLIForm:     "switchyard widget install <oci_ref>",
		HandlerRef:  "widget.install",
		Args: []commandcatalog.ArgSchema{
			{Name: "oci_ref", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--oci-ref", Hint: "OCI image reference"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "widget list",
		Description: "List installed widgets",
		CLIForm:     "switchyard widget list",
		HandlerRef:  "widget.list",
		Args:        nil,
	})
}
