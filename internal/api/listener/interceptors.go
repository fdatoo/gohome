package listener

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"runtime/debug"
	"time"

	"connectrpc.com/connect"
	"github.com/oklog/ulid/v2"

	errorv1 "github.com/fdatoo/switchyard/gen/switchyard/error/v1alpha1"
	"github.com/fdatoo/switchyard/internal/auth"
	"github.com/fdatoo/switchyard/internal/observability"
)

// SchemeClassifier classifies a request into an auth scheme and whether it
// arrived on the Unix-domain socket.
type SchemeClassifier interface {
	Classify(req connect.AnyRequest) (scheme string, isUDS bool)
}

type peerCredKey struct{}

// WithPeerCred attaches the Unix peer credentials to ctx. Called by the
// UDS connection handler before the request is dispatched.
func WithPeerCred(ctx context.Context, c *auth.PeerCred) context.Context {
	ctx = context.WithValue(ctx, peerCredKey{}, c)
	return auth.WithPeerCred(ctx, c)
}

func peerCredFromContext(ctx context.Context) *auth.PeerCred {
	if c, _ := ctx.Value(peerCredKey{}).(*auth.PeerCred); c != nil {
		return c
	}
	return auth.PeerCredFromContext(ctx)
}

// RequestIDInterceptor mints or echoes the X-Request-Id header and stores the
// value in the request context via observability.WithRequestID. Covers both
// unary and streaming RPCs — connect.UnaryInterceptorFunc is a no-op for
// streams, so streaming endpoints would otherwise silently lack request IDs.
func RequestIDInterceptor() connect.Interceptor { return requestIDInterceptor{} }

type requestIDInterceptor struct{}

func (requestIDInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		id := requestID(req.Header().Get("X-Request-Id"))
		ctx = observability.WithRequestID(ctx, id)
		resp, err := next(ctx, req)
		if resp != nil {
			resp.Header().Set("X-Request-Id", id)
		}
		return resp, err
	}
}

func (requestIDInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (requestIDInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		id := requestID(conn.RequestHeader().Get("X-Request-Id"))
		ctx = observability.WithRequestID(ctx, id)
		conn.ResponseHeader().Set("X-Request-Id", id)
		return next(ctx, conn)
	}
}

func requestID(provided string) string {
	if provided != "" {
		return provided
	}
	return ulid.Make().String()
}

// SlogInterceptor logs each completed RPC with method, code, duration, and
// request-id. For streams, "duration" is the lifetime of the stream from
// open to close.
func SlogInterceptor() connect.Interceptor { return slogInterceptor{} }

type slogInterceptor struct{}

func (slogInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		resp, err := next(ctx, req)
		logRequest(ctx, req.Spec().Procedure, "unary", err, time.Since(start))
		return resp, err
	}
}

func (slogInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (slogInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		start := time.Now()
		err := next(ctx, conn)
		logRequest(ctx, conn.Spec().Procedure, "stream", err, time.Since(start))
		return err
	}
}

func logRequest(ctx context.Context, procedure, kind string, err error, dur time.Duration) {
	id, _ := observability.RequestIDFromContext(ctx)
	code := connect.CodeOf(err)
	slog.InfoContext(ctx, "api request",
		slog.String("request_id", id),
		slog.String("method", procedure),
		slog.String("kind", kind),
		slog.String("code", code.String()),
		slog.Duration("duration", dur))
}

// MetricsInterceptor records per-procedure request count and latency via the
// switchyard_api_* Prometheus metrics. Streams are counted on close (one
// open = one observation, with duration = stream lifetime).
func MetricsInterceptor(m *observability.Metrics) connect.Interceptor {
	return &metricsInterceptor{m: m}
}

type metricsInterceptor struct{ m *observability.Metrics }

func (i *metricsInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		resp, err := next(ctx, req)
		i.observe(req.Spec().Procedure, err, time.Since(start))
		return resp, err
	}
}

func (i *metricsInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *metricsInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		start := time.Now()
		err := next(ctx, conn)
		i.observe(conn.Spec().Procedure, err, time.Since(start))
		return err
	}
}

func (i *metricsInterceptor) observe(procedure string, err error, dur time.Duration) {
	if i.m == nil || i.m.APIRequestsTotal == nil {
		return
	}
	code := connect.CodeOf(err).String()
	i.m.APIRequestsTotal.WithLabelValues(procedure, code).Inc()
	i.m.APIRequestDurationSeconds.WithLabelValues(procedure, code).Observe(dur.Seconds())
}

// RecoverInterceptor catches panics from downstream handlers and converts them
// to connect.CodeInternal errors, logging the stack trace. Critical for
// streaming endpoints: without recovery on streams, a panicking handler
// crashes the request goroutine and net/http closes the connection without
// the client ever seeing a meaningful error.
func RecoverInterceptor() connect.Interceptor { return recoverInterceptor{} }

type recoverInterceptor struct{}

func (recoverInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (resp connect.AnyResponse, err error) {
		defer func() {
			if r := recover(); r != nil {
				err = panicToError(ctx, r)
			}
		}()
		return next(ctx, req)
	}
}

func (recoverInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (recoverInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) (err error) {
		defer func() {
			if r := recover(); r != nil {
				err = panicToError(ctx, r)
			}
		}()
		return next(ctx, conn)
	}
}

func panicToError(ctx context.Context, r any) error {
	stack := debug.Stack()
	id, _ := observability.RequestIDFromContext(ctx)
	slog.ErrorContext(ctx, "api: panic",
		slog.String("request_id", id),
		slog.Any("panic", r),
		slog.String("stack", string(stack)))
	ce := connect.NewError(connect.CodeInternal, errors.New("internal error"))
	detail := &errorv1.ErrorDetail{Reason: "panic", RequestId: id}
	if d, derr := connect.NewErrorDetail(detail); derr == nil {
		ce.AddDetail(d)
	}
	return ce
}

// AuthenticateInterceptor runs the Authenticator against every request and
// attaches the resulting Principal to the context. Returns CodeUnauthenticated
// if authentication fails.
func AuthenticateInterceptor(a auth.Authenticator, cls SchemeClassifier) connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			scheme, _ := cls.Classify(req)
			ar := auth.Request{
				Scheme:     scheme,
				Headers:    req.Header(),
				RemoteAddr: req.Peer().Addr,
				Method:     req.Spec().Procedure,
				PeerCred:   peerCredFromContext(ctx),
			}
			p, err := a.Authenticate(ctx, ar)
			if err != nil {
				id, _ := observability.RequestIDFromContext(ctx)
				ce := connect.NewError(connect.CodeUnauthenticated, errors.New("unauthenticated"))
				detail := &errorv1.ErrorDetail{Reason: "unauthenticated", RequestId: id}
				if d, derr := connect.NewErrorDetail(detail); derr == nil {
					ce.AddDetail(d)
				}
				return nil, ce
			}
			ctx = auth.WithPrincipal(ctx, p)
			return next(ctx, req)
		}
	})
}

// AuthorizeInterceptor checks the principal in ctx against the action map.
// Procedures not in the map are allowed through unconditionally.
func AuthorizeInterceptor(az auth.Authorizer, actions map[string]auth.Action) connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			a, ok := actions[req.Spec().Procedure]
			if !ok {
				return next(ctx, req)
			}
			p, _ := auth.PrincipalFromContext(ctx)
			if err := az.Authorize(ctx, p, a, auth.Target{}); err != nil {
				id, _ := observability.RequestIDFromContext(ctx)
				ce := connect.NewError(connect.CodePermissionDenied, fmt.Errorf("forbidden"))
				detail := &errorv1.ErrorDetail{Reason: "forbidden", RequestId: id}
				if d, derr := connect.NewErrorDetail(detail); derr == nil {
					ce.AddDetail(d)
				}
				return nil, ce
			}
			return next(ctx, req)
		}
	})
}
