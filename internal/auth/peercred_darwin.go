//go:build darwin

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
		cred   *unix.Xucred
		ctlErr error
	)
	if err := raw.Control(func(fd uintptr) {
		cred, ctlErr = unix.GetsockoptXucred(int(fd), unix.SOL_LOCAL, unix.LOCAL_PEERCRED)
	}); err != nil {
		return nil, fmt.Errorf("peercred control: %w", err)
	}
	if ctlErr != nil {
		return nil, fmt.Errorf("peercred getsockopt: %w", ctlErr)
	}
	var gid uint32
	if cred.Ngroups > 0 {
		gid = cred.Groups[0]
	}
	return &PeerCred{Uid: cred.Uid, Gid: gid}, nil
}
