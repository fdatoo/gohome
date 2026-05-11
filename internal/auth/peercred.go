package auth

import "context"

// PeerCred holds Unix peer credentials obtained via SO_PEERCRED.
// Using a package-defined type avoids a direct dependency on syscall.Ucred,
// which is Linux-specific.
type PeerCred struct {
	Pid int32
	Uid uint32
	Gid uint32
}

type peerCredCtxKey struct{}

// WithPeerCred attaches Unix peer credentials to ctx for request authentication.
func WithPeerCred(ctx context.Context, c *PeerCred) context.Context {
	return context.WithValue(ctx, peerCredCtxKey{}, c)
}

// PeerCredFromContext returns Unix peer credentials resolved at connection accept time.
func PeerCredFromContext(ctx context.Context) *PeerCred {
	c, _ := ctx.Value(peerCredCtxKey{}).(*PeerCred)
	return c
}
