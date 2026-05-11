package pklfs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/fdatoo/switchyard/internal/config"
	"github.com/fdatoo/switchyard/internal/page"
	"github.com/fdatoo/switchyard/internal/page/regen"
)

var slugRE = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)

// Backend is the Pkl-filesystem backend for the page subsystem.
type Backend struct {
	configDir  string
	driversDir string
}

// New creates a new Backend.
func New(configDir, driversDir string) *Backend {
	return &Backend{configDir: configDir, driversDir: driversDir}
}

func (b *Backend) List(ctx context.Context) ([]page.PageMeta, error) {
	entries, err := os.ReadDir(b.pageDir())
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	metas := make([]page.PageMeta, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".pkl") || strings.HasSuffix(name, ".layout.pkl") {
			continue
		}
		slug := strings.TrimSuffix(name, ".pkl")
		p, err := b.Get(ctx, slug)
		if err != nil {
			return nil, err
		}
		metas = append(metas, page.PageMeta{Slug: p.Slug, Title: p.Title})
	}
	sort.Slice(metas, func(i, j int) bool { return metas[i].Slug < metas[j].Slug })
	return metas, nil
}

func (b *Backend) Get(ctx context.Context, slug string) (*page.PageData, error) {
	if !validSlug(slug) {
		return nil, page.ErrPageNotFound
	}
	sourcePath := b.sourcePath(slug)
	sourcePkl, err := os.ReadFile(sourcePath)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, page.ErrPageNotFound
	}
	if err != nil {
		return nil, err
	}
	jsonBytes, err := config.EvaluatePageFile(ctx, sourcePath, b.driversDir)
	if err != nil {
		return nil, err
	}
	pd, err := dataFromJSON(jsonBytes)
	if err != nil {
		return nil, err
	}
	pd.SourcePkl = string(sourcePkl)
	layoutPkl, err := os.ReadFile(b.layoutPath(slug))
	switch {
	case err == nil:
		pd.LayoutPkl = string(layoutPkl)
		pd.Writable = true
	case errors.Is(err, fs.ErrNotExist):
		pd.Writable = false
	default:
		return nil, err
	}
	return pd, nil
}

func (b *Backend) Create(ctx context.Context, slug, title string) (*page.PageData, error) {
	if !validSlug(slug) {
		return nil, fmt.Errorf("page: invalid slug %q", slug)
	}
	if _, err := os.Stat(b.sourcePath(slug)); err == nil {
		return nil, fmt.Errorf("page: %s already exists", slug)
	} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	if err := page.ScaffoldPage(b.pageDir(), slug, title); err != nil {
		return nil, err
	}
	return b.Get(ctx, slug)
}

func (b *Backend) Delete(_ context.Context, slug string, both bool) error {
	if !validSlug(slug) {
		return page.ErrPageNotFound
	}
	if err := os.Remove(b.sourcePath(slug)); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return page.ErrPageNotFound
		}
		return err
	}
	if both {
		if err := os.Remove(b.layoutPath(slug)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return nil
}

func (b *Backend) SaveLayout(ctx context.Context, pd *page.PageData) (*page.PageData, string, error) {
	if pd == nil || !validSlug(pd.Slug) {
		return nil, "", page.ErrPageNotFound
	}
	layoutPath := b.layoutPath(pd.Slug)
	if _, err := os.Stat(layoutPath); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, "", page.ErrPageNotFound
		}
		return nil, "", err
	}
	content, err := regen.Render(pd)
	if err != nil {
		return nil, "", err
	}
	if err := atomicWrite(layoutPath, content, 0o644); err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(content)
	saved, err := b.Get(ctx, pd.Slug)
	if err != nil {
		return nil, "", err
	}
	return saved, hex.EncodeToString(sum[:]), nil
}

func (b *Backend) WidgetCatalog(_ context.Context) ([]page.WidgetClassInfo, error) {
	cat := page.NewCatalog(nil)
	return cat.WidgetClasses(), nil
}

func (b *Backend) pageDir() string { return filepath.Join(b.configDir, "pages") }
func (b *Backend) sourcePath(slug string) string {
	return filepath.Join(b.pageDir(), slug+".pkl")
}
func (b *Backend) layoutPath(slug string) string {
	return filepath.Join(b.pageDir(), slug+".layout.pkl")
}

func validSlug(slug string) bool {
	return slugRE.MatchString(slug)
}

func atomicWrite(path string, content []byte, perm fs.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

// --- JSON parsing ---

type pageJSON struct {
	Slug     string        `json:"slug"`
	Title    string        `json:"title"`
	Sections []sectionJSON `json:"sections"`
}

type sectionJSON struct {
	ID    string         `json:"id"`
	Type  string         `json:"type"`
	Props map[string]any `json:"props"`
	Tiles []tileJSON     `json:"tiles"`
	Cells []cellJSON     `json:"cells"`
}

type tileJSON struct {
	ID    string         `json:"id"`
	Type  string         `json:"type"`
	Props map[string]any `json:"props"`
}

type cellJSON struct {
	ID    string         `json:"id"`
	Type  string         `json:"type"`
	Props map[string]any `json:"props"`
}

func dataFromJSON(data []byte) (*page.PageData, error) {
	var raw pageJSON
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("page content: %w", err)
	}
	pd := &page.PageData{
		Slug:     raw.Slug,
		Title:    raw.Title,
		Sections: make([]page.SectionData, 0, len(raw.Sections)),
	}
	for _, s := range raw.Sections {
		sd := page.SectionData{
			ID:    s.ID,
			Type:  s.Type,
			Props: s.Props,
		}
		for _, t := range s.Tiles {
			sd.Tiles = append(sd.Tiles, page.TileData{ID: t.ID, Type: t.Type, Props: t.Props})
		}
		for _, c := range s.Cells {
			sd.Cells = append(sd.Cells, page.CellData{ID: c.ID, Type: c.Type, Props: c.Props})
		}
		pd.Sections = append(pd.Sections, sd)
	}
	return pd, nil
}
