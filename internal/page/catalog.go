package page

import pagev1 "github.com/fdatoo/switchyard/gen/switchyard/page/v1"

// BuiltinSectionIDs are the nine built-in section class identifiers.
var BuiltinSectionIDs = []string{
	"Hero",
	"Chart",
	"EntityList",
	"ActivityFeed",
	"RoomGrid",
	"Markdown",
	"CameraGrid",
	"StatGrid",
	"WebhookButton",
}

// BuiltinTileIDs are the four built-in tile class identifiers.
var BuiltinTileIDs = []string{
	"RoomTile",
	"StatTile",
	"EntityToggle",
	"SceneButton",
}

// BuiltinCellIDs are the two built-in cell class identifiers.
var BuiltinCellIDs = []string{
	"EntityRow",
	"EventRow",
}

// BuiltinClassPrefix is prepended to all built-in class IDs.
const BuiltinClassPrefix = "@switchyard/builtin/"

// BuiltinClassIDs returns all built-in class short-form IDs (without the prefix).
// Used by the widgetpack installer for conflict detection.
func BuiltinClassIDs() []string {
	all := make([]string, 0, len(BuiltinSectionIDs)+len(BuiltinTileIDs)+len(BuiltinCellIDs))
	all = append(all, BuiltinSectionIDs...)
	all = append(all, BuiltinTileIDs...)
	all = append(all, BuiltinCellIDs...)
	return all
}

// InstalledPack represents a single installed widget pack.
type InstalledPack struct {
	Name    string
	Version string
	Classes []PackClass
}

// PackClass is a single widget class exported by a pack.
type PackClass struct {
	Name       string
	BundleURL  string
	BundleHash string
	Tiers      []string // "section", "tile", "cell"
}

// WidgetClassInfo describes one widget class available on the server.
type WidgetClassInfo struct {
	ClassID     string
	Tiers       []pagev1.Tier
	IsBuiltin   bool
	PackName    string
	PackVersion string
	BundleURL   string
	BundleHash  string
}

// Catalog is the server-side widget class registry.
type Catalog struct {
	packs []InstalledPack
}

// NewCatalog creates a Catalog with built-ins plus any installed packs.
func NewCatalog(packs []InstalledPack) *Catalog {
	return &Catalog{packs: packs}
}

// WidgetClasses returns all available widget classes (built-ins + installed packs).
func (c *Catalog) WidgetClasses() []WidgetClassInfo {
	out := make([]WidgetClassInfo, 0, len(BuiltinSectionIDs)+len(BuiltinTileIDs)+len(BuiltinCellIDs)+8)

	for _, id := range BuiltinSectionIDs {
		out = append(out, WidgetClassInfo{
			ClassID:   BuiltinClassPrefix + id,
			Tiers:     []pagev1.Tier{pagev1.Tier_TIER_SECTION},
			IsBuiltin: true,
		})
	}
	for _, id := range BuiltinTileIDs {
		out = append(out, WidgetClassInfo{
			ClassID:   BuiltinClassPrefix + id,
			Tiers:     []pagev1.Tier{pagev1.Tier_TIER_TILE},
			IsBuiltin: true,
		})
	}
	for _, id := range BuiltinCellIDs {
		out = append(out, WidgetClassInfo{
			ClassID:   BuiltinClassPrefix + id,
			Tiers:     []pagev1.Tier{pagev1.Tier_TIER_CELL},
			IsBuiltin: true,
		})
	}

	for _, p := range c.packs {
		for _, cls := range p.Classes {
			out = append(out, WidgetClassInfo{
				ClassID:     p.Name + "/" + cls.Name,
				Tiers:       parseTiers(cls.Tiers),
				IsBuiltin:   false,
				PackName:    p.Name,
				PackVersion: p.Version,
				BundleURL:   cls.BundleURL,
				BundleHash:  cls.BundleHash,
			})
		}
	}
	return out
}

// LookupClass finds a class by its full classID.
func (c *Catalog) LookupClass(classID string) *WidgetClassInfo {
	for _, wc := range c.WidgetClasses() {
		wc := wc
		if wc.ClassID == classID {
			return &wc
		}
	}
	return nil
}

func parseTiers(ss []string) []pagev1.Tier {
	if len(ss) == 0 {
		return []pagev1.Tier{pagev1.Tier_TIER_SECTION}
	}
	out := make([]pagev1.Tier, 0, len(ss))
	for _, s := range ss {
		switch s {
		case "section":
			out = append(out, pagev1.Tier_TIER_SECTION)
		case "tile":
			out = append(out, pagev1.Tier_TIER_TILE)
		case "cell":
			out = append(out, pagev1.Tier_TIER_CELL)
		}
	}
	return out
}
