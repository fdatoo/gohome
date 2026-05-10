package observability

import (
	"context"
	"sync"
)

// Span is the minimal tracing surface. C1 ships a no-op implementation;
// C13 replaces this with an OpenTelemetry bridge — call sites do not change.
type Span interface {
	End()
	SetAttr(key string, value any)
	RecordError(err error)
}

type noopSpan struct{}

func (noopSpan) End()                {}
func (noopSpan) SetAttr(string, any) {}
func (noopSpan) RecordError(error)   {}

type SpanStarter func(ctx context.Context, name string) (context.Context, Span)

var (
	spanStarterMu sync.RWMutex
	spanStarter   SpanStarter = startNoopSpan
)

func startNoopSpan(ctx context.Context, _ string) (context.Context, Span) {
	return ctx, noopSpan{}
}

func StartSpan(ctx context.Context, name string) (context.Context, Span) {
	spanStarterMu.RLock()
	start := spanStarter
	spanStarterMu.RUnlock()
	ctx, span := start(ctx, name)
	if span == nil {
		return ctx, noopSpan{}
	}
	return ctx, span
}

func SetSpanStarterForTest(start SpanStarter) func() {
	if start == nil {
		start = startNoopSpan
	}

	spanStarterMu.Lock()
	prev := spanStarter
	spanStarter = start
	spanStarterMu.Unlock()

	return func() {
		spanStarterMu.Lock()
		spanStarter = prev
		spanStarterMu.Unlock()
	}
}
