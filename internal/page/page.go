// Package page implements the CustomPage subsystem — server-side types,
// service, catalog, scaffold, and regen pipeline.
package page

import "errors"

// ErrPageNotFound is returned when a page slug is not found.
var ErrPageNotFound = errors.New("page: not found")

// PageMeta is the list-level page info.
type PageMeta struct {
	Slug  string
	Title string
}

// PageData is the full custom-page representation.
type PageData struct {
	Slug      string
	Title     string
	Sections  []SectionData
	SourcePkl string
	LayoutPkl string
	Writable  bool
}

// SectionData holds a single section instance.
type SectionData struct {
	ID    string
	Type  string
	Props map[string]any
	Tiles []TileData
	Cells []CellData
}

// TileData holds a single tile instance inside a section.
type TileData struct {
	ID    string
	Type  string
	Props map[string]any
}

// CellData holds a single cell instance inside a section.
type CellData struct {
	ID    string
	Type  string
	Props map[string]any
}
