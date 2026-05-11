package page_test

import (
	"testing"

	pagev1 "github.com/fdatoo/switchyard/gen/switchyard/page/v1"
	"github.com/fdatoo/switchyard/internal/page"
)

func TestCatalog_BuiltinCount(t *testing.T) {
	cat := page.NewCatalog(nil)
	classes := cat.WidgetClasses()
	// 9 sections + 4 tiles + 2 cells = 15 built-in classes.
	if len(classes) != 15 {
		t.Errorf("expected 15 built-in classes, got %d", len(classes))
		for _, c := range classes {
			t.Logf("  %s", c.ClassID)
		}
	}
}

func TestCatalog_SectionTiers(t *testing.T) {
	cat := page.NewCatalog(nil)
	for _, c := range cat.WidgetClasses() {
		if c.PackName != "" {
			continue
		}
		switch {
		case contains(page.BuiltinSectionIDs, shortID(c.ClassID)):
			if !hasTier(c.Tiers, pagev1.Tier_TIER_SECTION) {
				t.Errorf("%s should be TIER_SECTION", c.ClassID)
			}
		case contains(page.BuiltinTileIDs, shortID(c.ClassID)):
			if !hasTier(c.Tiers, pagev1.Tier_TIER_TILE) {
				t.Errorf("%s should be TIER_TILE", c.ClassID)
			}
		case contains(page.BuiltinCellIDs, shortID(c.ClassID)):
			if !hasTier(c.Tiers, pagev1.Tier_TIER_CELL) {
				t.Errorf("%s should be TIER_CELL", c.ClassID)
			}
		}
	}
}

func TestCatalog_WithInstalledPacks(t *testing.T) {
	packs := []page.InstalledPack{
		{
			Name:    "my-pack",
			Version: "1.0.0",
			Classes: []page.PackClass{
				{Name: "MySection", Tiers: []string{"section"}},
				{Name: "MyTile", Tiers: []string{"tile"}},
			},
		},
	}
	cat := page.NewCatalog(packs)
	classes := cat.WidgetClasses()
	if len(classes) != 17 { // 15 builtins + 2 pack classes
		t.Errorf("expected 17 classes, got %d", len(classes))
	}
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

func shortID(classID string) string {
	const prefix = page.BuiltinClassPrefix
	if len(classID) > len(prefix) {
		return classID[len(prefix):]
	}
	return classID
}

func hasTier(tiers []pagev1.Tier, want pagev1.Tier) bool {
	for _, t := range tiers {
		if t == want {
			return true
		}
	}
	return false
}
