package api

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"

	errorv1 "github.com/fdatoo/switchyard/gen/switchyard/error/v1alpha1"
	"github.com/fdatoo/switchyard/internal/auth"
	"github.com/fdatoo/switchyard/internal/auth/audit"
	"github.com/fdatoo/switchyard/internal/observability"
	"github.com/fdatoo/switchyard/internal/policy"
)

// ProcedureCatalog resolves a Connect procedure name and request body to the
// corresponding auth.Action and auth.Target.
type ProcedureCatalog interface {
	Resolve(procedure string, requestAny any) (auth.Action, auth.Target, bool)
}

// NewAuthorize returns the C9 authorize interceptor. When rt is nil the
// interceptor passes all requests through (daemon bring-up before the
// policy runtime is loaded). metrics is optional; pass nil to disable metric
// emission. Streaming endpoints get a stream-open authorization check using
// the procedure name; per-message authorization stays the handler's
// responsibility (EntityService.Subscribe, for example, runs its own
// per-entity preflight via policyRuntime).
func NewAuthorize(rt *policy.Runtime, catalog ProcedureCatalog, recorder *audit.Recorder, metrics *observability.Metrics) connect.Interceptor {
	return &authorizeInterceptor{rt: rt, catalog: catalog, recorder: recorder, metrics: metrics}
}

type authorizeInterceptor struct {
	rt       *policy.Runtime
	catalog  ProcedureCatalog
	recorder *audit.Recorder
	metrics  *observability.Metrics
}

// authorize is the shared core. requestAny is nil for streams (no body
// available at stream-open). When catalog can't resolve action/target,
// authorize returns nil, leaving authorization to the handler.
func (i *authorizeInterceptor) authorize(ctx context.Context, procedure string, requestAny any) error {
	principal, _ := auth.PrincipalFromContext(ctx)
	if principal.Kind == "system" {
		if i.metrics != nil {
			i.metrics.PolicyAuthorizeDurationSeconds.Observe(0)
			i.metrics.PolicyAuthorizeTotal.WithLabelValues("allowed", "").Inc()
		}
		if i.recorder != nil {
			action := auth.Action{}
			if i.catalog != nil && requestAny != nil {
				if resolved, _, ok := i.catalog.Resolve(procedure, requestAny); ok {
					action = resolved
				}
			}
			_ = i.recorder.PolicyBypassed(ctx, identityFromCtx(ctx), audit.PolicyBypassed{
				ActionService: action.Service, ActionMethod: action.Method,
				ActionVerb: action.Verb, Reason: "system_local",
			})
		}
		return nil
	}
	if i.rt == nil || i.catalog == nil || requestAny == nil {
		return nil
	}
	action, target, ok := i.catalog.Resolve(procedure, requestAny)
	if !ok {
		return nil
	}
	start := time.Now()
	err := i.rt.Authorize(ctx, principal, action, target)
	elapsed := time.Since(start).Seconds()
	if err == nil {
		if i.metrics != nil {
			i.metrics.PolicyAuthorizeDurationSeconds.Observe(elapsed)
			i.metrics.PolicyAuthorizeTotal.WithLabelValues("allowed", "").Inc()
		}
		return nil
	}
	id := requestIDFromCtx(ctx)
	var fb *policy.ErrForbidden
	if errors.As(err, &fb) {
		if i.metrics != nil {
			i.metrics.PolicyAuthorizeDurationSeconds.Observe(elapsed)
			i.metrics.PolicyAuthorizeTotal.WithLabelValues("denied", fb.Reason).Inc()
		}
		if i.recorder != nil {
			_ = i.recorder.PolicyDenied(ctx, identityFromCtx(ctx), audit.PolicyDenied{
				ActionService: action.Service, ActionMethod: action.Method, ActionVerb: action.Verb,
				TargetKind: target.Kind, TargetID: target.ID,
				SubReason: fb.Reason, RuleName: fb.RuleName,
			})
		}
		ce := connect.NewError(connect.CodePermissionDenied, fb)
		detail := &errorv1.ErrorDetail{Reason: "forbidden", RequestId: id}
		if d, derr := connect.NewErrorDetail(detail); derr == nil {
			ce.AddDetail(d)
		}
		return ce
	}
	if i.metrics != nil {
		i.metrics.PolicyAuthorizeDurationSeconds.Observe(elapsed)
		i.metrics.PolicyAuthorizeTotal.WithLabelValues("error", "internal").Inc()
	}
	ce := connect.NewError(connect.CodeInternal, errors.New("internal error"))
	detail := &errorv1.ErrorDetail{Reason: "internal", RequestId: id}
	if d, derr := connect.NewErrorDetail(detail); derr == nil {
		ce.AddDetail(d)
	}
	return ce
}

func (i *authorizeInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if err := i.authorize(ctx, req.Spec().Procedure, req.Any()); err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

func (i *authorizeInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *authorizeInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := i.authorize(ctx, conn.Spec().Procedure, nil); err != nil {
			return err
		}
		return next(ctx, conn)
	}
}

func identityFromCtx(ctx context.Context) audit.Identity {
	p, _ := auth.PrincipalFromContext(ctx)
	return audit.Identity{
		PrincipalID: p.ID,
		RequestID:   requestIDFromCtx(ctx),
		SourceIP:    remoteAddrFromCtx(ctx),
		UserAgent:   userAgentFromCtx(ctx),
	}
}
