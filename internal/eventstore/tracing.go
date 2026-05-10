package eventstore

import (
	"context"

	"github.com/fdatoo/switchyard/internal/observability"
	"github.com/fdatoo/switchyard/internal/storage"
)

func applyProjector(ctx context.Context, tx storage.Tx, reg projectorReg, e Event) error {
	ctx, span := observability.StartSpan(ctx, "projector.Apply")
	span.SetAttr("projector", reg.p.Name())
	defer span.End()

	if err := reg.p.Apply(ctx, tx, e); err != nil {
		span.RecordError(err)
		return err
	}
	return nil
}
