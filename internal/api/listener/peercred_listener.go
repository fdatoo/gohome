package listener

import (
	"context"
	"log/slog"
	"net"

	"github.com/fdatoo/switchyard/internal/auth"
)

type peerCredListener struct {
	net.Listener
}

type peerCredConn struct {
	net.Conn
	cred *auth.PeerCred
}

func (l peerCredListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	unixConn, ok := conn.(*net.UnixConn)
	if !ok {
		return &peerCredConn{Conn: conn}, nil
	}
	cred, err := auth.ResolvePeerCred(unixConn)
	if err != nil {
		slog.Warn("listener: unix peer credential lookup failed", "err", err)
	}
	return &peerCredConn{Conn: conn, cred: cred}, nil
}

func (c *peerCredConn) peerCred() *auth.PeerCred {
	return c.cred
}

func withConnPeerCred(ctx context.Context, conn net.Conn) context.Context {
	if pc, ok := conn.(interface{ peerCred() *auth.PeerCred }); ok {
		if cred := pc.peerCred(); cred != nil {
			return auth.WithPeerCred(ctx, cred)
		}
	}
	return ctx
}
