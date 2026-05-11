//go:build linux

package auth

import (
	"fmt"
	"net"

	"golang.org/x/sys/unix"
)

// ResolvePeerCred returns the process credentials for a connected Unix socket peer.
func ResolvePeerCred(conn *net.UnixConn) (*PeerCred, error) {
	raw, err := conn.SyscallConn()
	if err != nil {
		return nil, fmt.Errorf("peercred syscall conn: %w", err)
	}
	var (
		cred   *unix.Ucred
		ctlErr error
	)
	if err := raw.Control(func(fd uintptr) {
		cred, ctlErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
	}); err != nil {
		return nil, fmt.Errorf("peercred control: %w", err)
	}
	if ctlErr != nil {
		return nil, fmt.Errorf("peercred getsockopt: %w", ctlErr)
	}
	return &PeerCred{Pid: cred.Pid, Uid: cred.Uid, Gid: cred.Gid}, nil
}
