// Package widgetpack pulls and installs Switchyard widget packs distributed
// as OCI artifacts. This file (oci.go) is responsible only for fetching
// artifact bytes plus the cosign signature artifact; tarball extraction and
// signature verification live elsewhere.
package widgetpack

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	ocispec "github.com/opencontainers/image-spec/specs-go/v1"
	"oras.land/oras-go/v2"
	"oras.land/oras-go/v2/content/memory"
	"oras.land/oras-go/v2/registry/remote"
	"oras.land/oras-go/v2/registry/remote/auth"
	"oras.land/oras-go/v2/registry/remote/credentials"
)

// MediaType is the layer media type for switchyard widget pack artifacts.
const MediaType = "application/vnd.switchyard.widgetpack.v1+tar+gzip"

// FetchedArtifact is the result of pulling an artifact from a registry.
type FetchedArtifact struct {
	LayerBlob []byte // gzipped tarball; caller un-tars
	Digest    string // "sha256:..."
	// SignatureBundle is the cosign sigstore-bundle blob if present; nil if
	// no signature artifact exists at <ref>.sig.
	SignatureBundle []byte
}

// Fetcher pulls OCI artifacts plus their cosign signature artifacts.
type Fetcher struct {
	credStore credentials.Store
}

// NewFetcher returns a Fetcher that authenticates against registries using
// ~/.docker/config.json (anonymous access if not present).
func NewFetcher() (*Fetcher, error) {
	cs, err := credentials.NewStoreFromDocker(credentials.StoreOptions{})
	if err != nil {
		return nil, fmt.Errorf("widgetpack: docker credentials: %w", err)
	}
	return &Fetcher{credStore: cs}, nil
}

// Fetch pulls the artifact at ref and (if present) its cosign signature
// at <ref>.sig. Rejects multi-layer artifacts and artifacts whose layer
// media type is not MediaType.
func (f *Fetcher) Fetch(ctx context.Context, ref string) (*FetchedArtifact, error) {
	repo, tag, err := parseRef(ref)
	if err != nil {
		return nil, err
	}
	r, err := remote.NewRepository(repo)
	if err != nil {
		return nil, fmt.Errorf("widgetpack: open repo %q: %w", repo, err)
	}
	r.Client = &auth.Client{
		Credential: credentials.Credential(f.credStore),
	}

	// Pull the artifact into an in-memory store.
	store := memory.New()
	desc, err := oras.Copy(ctx, r, tag, store, tag, oras.DefaultCopyOptions)
	if err != nil {
		return nil, fmt.Errorf("widgetpack: pull %s: %w", ref, err)
	}

	// Walk manifest to find the single layer.
	manifestBytes, err := readBlob(ctx, store, desc)
	if err != nil {
		return nil, fmt.Errorf("widgetpack: read manifest for %s: %w", ref, err)
	}
	layerDesc, err := singleLayerDescriptor(manifestBytes)
	if err != nil {
		return nil, fmt.Errorf("widgetpack: %s: %w", ref, err)
	}
	if layerDesc.MediaType != MediaType {
		return nil, fmt.Errorf("widgetpack: %s: unexpected media type %q (want %q)", ref, layerDesc.MediaType, MediaType)
	}
	layerBlob, err := readBlob(ctx, store, layerDesc)
	if err != nil {
		return nil, fmt.Errorf("widgetpack: read layer for %s: %w", ref, err)
	}

	// Best-effort fetch the cosign signature artifact at <ref>.sig.
	// A missing signature is not an error — Task 9 / Task 5 handle the
	// "signature required" policy decision.
	sigTag := cosignSigTagFor(layerDesc.Digest.String())
	sigBundle, _ := f.fetchSignature(ctx, r, sigTag)

	return &FetchedArtifact{
		LayerBlob:       layerBlob,
		Digest:          layerDesc.Digest.String(),
		SignatureBundle: sigBundle,
	}, nil
}

// fetchSignature pulls the cosign signature artifact at sigTag from r. The
// returned error is informational; callers treat any failure as "no signature
// present" (best-effort).
func (f *Fetcher) fetchSignature(ctx context.Context, r *remote.Repository, sigTag string) ([]byte, error) {
	store := memory.New()
	desc, err := oras.Copy(ctx, r, sigTag, store, sigTag, oras.DefaultCopyOptions)
	if err != nil {
		// No signature artifact — not an error from the caller's perspective.
		return nil, err
	}
	manifestBytes, err := readBlob(ctx, store, desc)
	if err != nil {
		return nil, err
	}
	layerDesc, err := singleLayerDescriptor(manifestBytes)
	if err != nil {
		return nil, err
	}
	return readBlob(ctx, store, layerDesc)
}

// readBlob is a thin io.ReadAll wrapper around store.Fetch.
func readBlob(ctx context.Context, store *memory.Store, desc ocispec.Descriptor) ([]byte, error) {
	rc, err := store.Fetch(ctx, desc)
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

// singleLayerDescriptor parses an OCI manifest and returns its single layer.
// Errors if the manifest has zero or more than one layer.
func singleLayerDescriptor(manifest []byte) (ocispec.Descriptor, error) {
	var m ocispec.Manifest
	if err := json.Unmarshal(manifest, &m); err != nil {
		return ocispec.Descriptor{}, fmt.Errorf("parse manifest: %w", err)
	}
	if len(m.Layers) != 1 {
		return ocispec.Descriptor{}, fmt.Errorf("expected exactly one layer, got %d", len(m.Layers))
	}
	return m.Layers[0], nil
}

// cosignSigTagFor turns "sha256:abc" into "sha256-abc.sig" — cosign's tag scheme.
func cosignSigTagFor(digest string) string {
	parts := strings.SplitN(digest, ":", 2)
	if len(parts) != 2 {
		return ""
	}
	return parts[0] + "-" + parts[1] + ".sig"
}

// parseRef splits "repo:tag" into its two parts.
//
// TODO(F-157 follow-up): support digest-based refs of the form
// "repo@sha256:...". For now F-157 only requires repo:tag parsing
// (per design spec §6.3).
func parseRef(ref string) (repo, tag string, err error) {
	idx := strings.LastIndex(ref, ":")
	if idx <= 0 || idx == len(ref)-1 {
		return "", "", fmt.Errorf("widgetpack: bad ref %q (need repo:tag)", ref)
	}
	return ref[:idx], ref[idx+1:], nil
}
