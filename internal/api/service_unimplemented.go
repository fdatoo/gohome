package api

import (
	"context"
)

func unimplemented(ctx context.Context, reason string) error {
	return ToConnect(ctx, ErrNotImplemented, reason)
}
