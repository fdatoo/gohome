//go:build !linux && !darwin

package auth

import (
	"errors"
	"net"
)

// ResolvePeerCred returns the process credentials for a connected Unix socket peer.
func ResolvePeerCred(_ *net.UnixConn) (*PeerCred, error) {
	return nil, errors.New("peercred unsupported on this platform")
}
