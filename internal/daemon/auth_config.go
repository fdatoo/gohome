package daemon

import (
	"context"
	"fmt"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/auth/credentials"
	"github.com/fdatoo/switchyard/internal/auth/identity"
)

func applyAuthSnapshot(ctx context.Context, identities *identity.Store, passwords *credentials.Password, snap *configpb.ConfigSnapshot) error {
	users := make([]identity.User, 0, len(snap.GetUsers()))
	for _, u := range snap.GetUsers() {
		roles := make([]string, 0, len(u.GetRoles()))
		for _, role := range u.GetRoles() {
			roles = append(roles, role.GetSlug())
		}
		users = append(users, identity.User{
			Slug:            u.GetSlug(),
			DisplayName:     u.GetDisplayName(),
			Active:          u.GetActive(),
			PasswordAllowed: u.GetPasswordAllowed(),
			PasskeyAllowed:  u.GetPasskeyAllowed(),
			Roles:           roles,
		})
	}
	if err := identities.ApplySnapshot(ctx, identity.Snapshot{Users: users}); err != nil {
		return err
	}
	for _, u := range snap.GetUsers() {
		if hash := u.GetBootstrapPasswordHash(); hash != "" {
			if err := passwords.BootstrapHash(ctx, u.GetSlug(), hash, "system:bootstrap"); err != nil {
				return fmt.Errorf("bootstrap password for %s: %w", u.GetSlug(), err)
			}
		}
	}
	return nil
}
