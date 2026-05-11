package page

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/structpb"

	pagev1 "github.com/fdatoo/switchyard/gen/switchyard/page/v1"
	"github.com/fdatoo/switchyard/gen/switchyard/page/v1/pagev1connect"
)

// Backend is the persistence + business logic interface for pages.
type Backend interface {
	List(ctx context.Context) ([]PageMeta, error)
	Get(ctx context.Context, slug string) (*PageData, error)
	Create(ctx context.Context, slug, title string) (*PageData, error)
	Delete(ctx context.Context, slug string, deleteSource bool) error
	SaveLayout(ctx context.Context, p *PageData) (*PageData, string, error)
	WidgetCatalog(ctx context.Context) ([]WidgetClassInfo, error)
}

// Service implements the PageService Connect handler.
type Service struct {
	be      Backend
	catalog *Catalog
}

// NewService creates a new page service.
func NewService(be Backend, catalog *Catalog) *Service {
	return &Service{be: be, catalog: catalog}
}

var _ pagev1connect.PageServiceHandler = (*Service)(nil)

func (s *Service) List(ctx context.Context, _ *connect.Request[pagev1.ListPagesRequest]) (*connect.Response[pagev1.ListPagesResponse], error) {
	metas, err := s.be.List(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	out := make([]*pagev1.Page, 0, len(metas))
	for _, m := range metas {
		out = append(out, &pagev1.Page{Slug: m.Slug, Title: m.Title})
	}
	return connect.NewResponse(&pagev1.ListPagesResponse{Pages: out}), nil
}

func (s *Service) Get(ctx context.Context, req *connect.Request[pagev1.GetPageRequest]) (*connect.Response[pagev1.GetPageResponse], error) {
	p, err := s.be.Get(ctx, req.Msg.GetSlug())
	if err != nil {
		return nil, connectErr(err)
	}
	return connect.NewResponse(&pagev1.GetPageResponse{Page: toProto(p)}), nil
}

func (s *Service) GetWidgetCatalog(ctx context.Context, _ *connect.Request[pagev1.GetWidgetCatalogRequest]) (*connect.Response[pagev1.GetWidgetCatalogResponse], error) {
	classes, err := s.be.WidgetCatalog(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	out := make([]*pagev1.WidgetClass, 0, len(classes))
	for _, wc := range classes {
		out = append(out, widgetClassToProto(wc))
	}
	return connect.NewResponse(&pagev1.GetWidgetCatalogResponse{
		Catalog: &pagev1.WidgetCatalog{Classes: out},
	}), nil
}

func (s *Service) Create(ctx context.Context, req *connect.Request[pagev1.CreatePageRequest]) (*connect.Response[pagev1.CreatePageResponse], error) {
	p, err := s.be.Create(ctx, req.Msg.GetSlug(), req.Msg.GetTitle())
	if err != nil {
		return nil, connectErr(err)
	}
	return connect.NewResponse(&pagev1.CreatePageResponse{Page: toProto(p)}), nil
}

func (s *Service) Delete(ctx context.Context, req *connect.Request[pagev1.DeletePageRequest]) (*connect.Response[pagev1.DeletePageResponse], error) {
	if err := s.be.Delete(ctx, req.Msg.GetSlug(), req.Msg.GetDeleteSourceToo()); err != nil {
		return nil, connectErr(err)
	}
	return connect.NewResponse(&pagev1.DeletePageResponse{}), nil
}

func (s *Service) SaveLayout(ctx context.Context, req *connect.Request[pagev1.SavePageLayoutRequest]) (*connect.Response[pagev1.SavePageLayoutResponse], error) {
	if req.Msg.GetPage() == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("page required"))
	}
	pd := fromProto(req.Msg.GetPage())
	saved, correlationID, err := s.be.SaveLayout(ctx, pd)
	if err != nil {
		return nil, connectErr(err)
	}
	return connect.NewResponse(&pagev1.SavePageLayoutResponse{
		Page:          toProto(saved),
		CorrelationId: correlationID,
	}), nil
}

func connectErr(err error) error {
	if errors.Is(err, ErrPageNotFound) {
		return connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewError(connect.CodeInternal, err)
}

// --- proto conversions ---

func toProto(p *PageData) *pagev1.Page {
	if p == nil {
		return nil
	}
	return &pagev1.Page{
		Slug:      p.Slug,
		Title:     p.Title,
		Sections:  sectionsToProto(p.Sections),
		SourcePkl: p.SourcePkl,
		LayoutPkl: p.LayoutPkl,
		Writable:  p.Writable,
	}
}

func fromProto(p *pagev1.Page) *PageData {
	return &PageData{
		Slug:     p.GetSlug(),
		Title:    p.GetTitle(),
		Sections: sectionsFromProto(p.GetSections()),
	}
}

func sectionsToProto(ss []SectionData) []*pagev1.Section {
	out := make([]*pagev1.Section, 0, len(ss))
	for _, s := range ss {
		out = append(out, sectionToProto(s))
	}
	return out
}

func sectionToProto(s SectionData) *pagev1.Section {
	var props *structpb.Struct
	if len(s.Props) > 0 {
		props, _ = structpb.NewStruct(s.Props)
	}
	return &pagev1.Section{
		Id:    s.ID,
		Type:  s.Type,
		Props: props,
		Tiles: tilesToProto(s.Tiles),
		Cells: cellsToProto(s.Cells),
	}
}

func sectionsFromProto(ss []*pagev1.Section) []SectionData {
	out := make([]SectionData, 0, len(ss))
	for _, s := range ss {
		out = append(out, sectionFromProto(s))
	}
	return out
}

func sectionFromProto(s *pagev1.Section) SectionData {
	var props map[string]any
	if s.GetProps() != nil {
		props = s.GetProps().AsMap()
	}
	return SectionData{
		ID:    s.GetId(),
		Type:  s.GetType(),
		Props: props,
		Tiles: tilesFromProto(s.GetTiles()),
		Cells: cellsFromProto(s.GetCells()),
	}
}

func tilesToProto(ts []TileData) []*pagev1.Tile {
	out := make([]*pagev1.Tile, 0, len(ts))
	for _, t := range ts {
		var props *structpb.Struct
		if len(t.Props) > 0 {
			props, _ = structpb.NewStruct(t.Props)
		}
		out = append(out, &pagev1.Tile{Id: t.ID, Type: t.Type, Props: props})
	}
	return out
}

func tilesFromProto(ts []*pagev1.Tile) []TileData {
	out := make([]TileData, 0, len(ts))
	for _, t := range ts {
		var props map[string]any
		if t.GetProps() != nil {
			props = t.GetProps().AsMap()
		}
		out = append(out, TileData{ID: t.GetId(), Type: t.GetType(), Props: props})
	}
	return out
}

func cellsToProto(cs []CellData) []*pagev1.Cell {
	out := make([]*pagev1.Cell, 0, len(cs))
	for _, c := range cs {
		var props *structpb.Struct
		if len(c.Props) > 0 {
			props, _ = structpb.NewStruct(c.Props)
		}
		out = append(out, &pagev1.Cell{Id: c.ID, Type: c.Type, Props: props})
	}
	return out
}

func cellsFromProto(cs []*pagev1.Cell) []CellData {
	out := make([]CellData, 0, len(cs))
	for _, c := range cs {
		var props map[string]any
		if c.GetProps() != nil {
			props = c.GetProps().AsMap()
		}
		out = append(out, CellData{ID: c.GetId(), Type: c.GetType(), Props: props})
	}
	return out
}

func widgetClassToProto(wc WidgetClassInfo) *pagev1.WidgetClass {
	return &pagev1.WidgetClass{
		ClassId:     wc.ClassID,
		Tiers:       wc.Tiers,
		IsBuiltin:   wc.IsBuiltin,
		PackName:    wc.PackName,
		PackVersion: wc.PackVersion,
		BundleUrl:   wc.BundleURL,
		BundleHash:  wc.BundleHash,
	}
}
