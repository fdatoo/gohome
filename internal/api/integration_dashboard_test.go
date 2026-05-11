//go:build integration

package api_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	pagev1 "github.com/fdatoo/switchyard/gen/switchyard/page/v1"
	"github.com/fdatoo/switchyard/internal/page"
)

func TestIntegration_PageCRUD(t *testing.T) {
	catalog := page.NewCatalog(nil)
	be := &integrationPageBE{catalog: catalog}
	svc := page.NewService(be, catalog)

	// Create
	createResp, err := svc.Create(context.Background(), connect.NewRequest(&pagev1.CreatePageRequest{
		Slug:  "integration-test",
		Title: "Integration Test",
	}))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if createResp.Msg.Page.Slug != "integration-test" {
		t.Errorf("slug = %q", createResp.Msg.Page.Slug)
	}

	// Get
	getResp, err := svc.Get(context.Background(), connect.NewRequest(&pagev1.GetPageRequest{
		Slug: "integration-test",
	}))
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if getResp.Msg.Page.Title != "Integration Test" {
		t.Errorf("title = %q", getResp.Msg.Page.Title)
	}

	// Delete
	_, err = svc.Delete(context.Background(), connect.NewRequest(&pagev1.DeletePageRequest{
		Slug: "integration-test",
	}))
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

type integrationPageBE struct {
	catalog *page.Catalog
	items   []*page.PageData
}

func (b *integrationPageBE) List(_ context.Context) ([]page.PageMeta, error) {
	out := make([]page.PageMeta, len(b.items))
	for i, p := range b.items {
		out[i] = page.PageMeta{Slug: p.Slug, Title: p.Title}
	}
	return out, nil
}

func (b *integrationPageBE) Get(_ context.Context, slug string) (*page.PageData, error) {
	for _, p := range b.items {
		if p.Slug == slug {
			return p, nil
		}
	}
	return nil, page.ErrPageNotFound
}

func (b *integrationPageBE) Create(_ context.Context, slug, title string) (*page.PageData, error) {
	p := &page.PageData{
		Slug:     slug,
		Title:    title,
		Writable: true,
	}
	b.items = append(b.items, p)
	return p, nil
}

func (b *integrationPageBE) Delete(_ context.Context, slug string, _ bool) error {
	for i, p := range b.items {
		if p.Slug == slug {
			b.items = append(b.items[:i], b.items[i+1:]...)
			return nil
		}
	}
	return page.ErrPageNotFound
}

func (b *integrationPageBE) SaveLayout(_ context.Context, pd *page.PageData) (*page.PageData, string, error) {
	for i, existing := range b.items {
		if existing.Slug == pd.Slug {
			b.items[i] = pd
			return pd, "corr-test", nil
		}
	}
	return nil, "", page.ErrPageNotFound
}

func (b *integrationPageBE) WidgetCatalog(_ context.Context) ([]page.WidgetClassInfo, error) {
	return b.catalog.WidgetClasses(), nil
}
