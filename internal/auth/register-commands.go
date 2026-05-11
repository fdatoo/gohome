package auth

import "github.com/fdatoo/switchyard/internal/commandcatalog"

// RegisterCommands registers all auth-domain verbs into the catalog registry.
func RegisterCommands(r *commandcatalog.Registry) {
	r.Register(commandcatalog.Verb{
		Name:        "token issue",
		Description: "Issue a new API token",
		CLIForm:     "switchyard token issue <name>",
		HandlerRef:  "token.issue",
		Args: []commandcatalog.ArgSchema{
			{Name: "name", Type: commandcatalog.ArgTypeString, Required: true, CLIFlag: "--name", Hint: "token name"},
			{Name: "scopes", Type: commandcatalog.ArgTypeStringList, Required: true, CLIFlag: "--scopes", Hint: "comma-separated scopes"},
		},
	})

	r.Register(commandcatalog.Verb{
		Name:        "passkey enroll",
		Description: "Enroll a new passkey for the current user",
		CLIForm:     "switchyard passkey enroll",
		HandlerRef:  "passkey.enroll",
		Args:        nil,
	})
}
