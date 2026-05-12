package api

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"sync"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"

	authpb "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/internal/auth"
	"github.com/fdatoo/switchyard/internal/auth/authn"
	"github.com/fdatoo/switchyard/internal/auth/credentials"
	"github.com/fdatoo/switchyard/internal/policy"
)

// NewAuthenticate returns the C9 authenticate interceptor. Wraps the supplied
// authenticator chain, attaches Principal + (if applicable) compiled token
// scope to the request context. Covers both unary and streaming endpoints —
// without the streaming wrapper, server-streaming RPCs would bypass auth
// entirely (security hole) since connect.UnaryInterceptorFunc is a no-op
// for streams.
func NewAuthenticate(chain auth.Authenticator, bearer *authn.Bearer, tokens *credentials.Tokens) connect.Interceptor {
	return &authenticateInterceptor{chain: chain, bearer: bearer, tokens: tokens}
}

type authenticateInterceptor struct {
	chain  auth.Authenticator
	bearer *authn.Bearer
	tokens *credentials.Tokens
}

// authenticate runs the chain and returns either a context augmented with
// the principal (and optional token scope) or a Connect error to surface
// to the caller. Procedure must be the full Connect procedure path.
func (i *authenticateInterceptor) authenticate(
	ctx context.Context,
	headers http.Header,
	remoteAddr, procedure string,
	peerCred *auth.PeerCred,
) (context.Context, error) {
	scheme := "bearer"
	if peerCred != nil {
		scheme = "uds:peercred"
	}
	authReq := auth.Request{
		Scheme:     scheme,
		Headers:    headers,
		RemoteAddr: remoteAddr,
		Method:     procedure,
		HTTP:       httpRequestFromCtx(ctx),
		PeerCred:   peerCred,
	}
	if isPublicAuthProcedure(procedure) {
		ctx = withRemoteAddr(ctx, authReq.RemoteAddr)
		ctx = withUserAgent(ctx, headers.Get("User-Agent"))
		return ctx, nil
	}
	p, err := i.chain.Authenticate(ctx, authReq)
	if errors.Is(err, auth.ErrUnauthenticated) {
		return ctx, connect.NewError(connect.CodeUnauthenticated, err)
	}
	if err != nil {
		return ctx, connect.NewError(connect.CodeInternal, err)
	}
	ctx = auth.WithPrincipal(ctx, p)
	ctx = withRemoteAddr(ctx, authReq.RemoteAddr)
	ctx = withUserAgent(ctx, headers.Get("User-Agent"))

	if i.bearer != nil && i.tokens != nil {
		if enc, ok := p.Metadata["token_scope"]; ok {
			blob, decErr := base64.StdEncoding.DecodeString(enc)
			if decErr != nil {
				return ctx, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token scope"))
			}
			scope, decErr := decodeTokenScope(ctx, p.Metadata["token_id"], blob)
			if decErr != nil {
				return ctx, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token scope"))
			}
			ctx = policy.WithTokenScope(ctx, scope)
		}
	}
	return ctx, nil
}

func (i *authenticateInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		newCtx, err := i.authenticate(
			ctx, req.Header(), req.Peer().Addr, req.Spec().Procedure,
			auth.PeerCredFromContext(ctx),
		)
		if err != nil {
			return nil, err
		}
		return next(newCtx, req)
	}
}

func (i *authenticateInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *authenticateInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		newCtx, err := i.authenticate(
			ctx, conn.RequestHeader(), conn.Peer().Addr, conn.Spec().Procedure,
			auth.PeerCredFromContext(ctx),
		)
		if err != nil {
			return err
		}
		return next(newCtx, conn)
	}
}

func isPublicAuthProcedure(procedure string) bool {
	switch procedure {
	case "/switchyard.v1alpha1.AuthService/Login",
		"/switchyard.v1alpha1.AuthService/Refresh",
		"/switchyard.v1alpha1.AuthService/StartWebAuthnChallenge":
		return true
	default:
		return false
	}
}

var tokenScopeCache sync.Map

func decodeTokenScope(_ context.Context, tokenID string, blob []byte) (policy.CompiledTokenScope, error) {
	if len(blob) == 0 {
		return policy.CompiledTokenScope{}, nil
	}
	cacheKey := tokenID
	if cacheKey == "" {
		sum := sha256.Sum256(blob)
		cacheKey = hex.EncodeToString(sum[:])
	}
	if cached, ok := tokenScopeCache.Load(cacheKey); ok {
		return cached.(policy.CompiledTokenScope), nil
	}
	var scopePB authpb.TokenScope
	if err := proto.Unmarshal(blob, &scopePB); err != nil {
		return policy.CompiledTokenScope{}, err
	}
	scope, err := compileTokenScopePB(&scopePB)
	if err != nil {
		return policy.CompiledTokenScope{}, err
	}
	tokenScopeCache.Store(cacheKey, scope)
	return scope, nil
}
