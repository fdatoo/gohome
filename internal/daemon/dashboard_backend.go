package daemon

import (
	"context"

	"github.com/fdatoo/switchyard/internal/page"
	pagepklfs "github.com/fdatoo/switchyard/internal/page/pklfs"
	"github.com/fdatoo/switchyard/internal/widgetpack"
)

type pageBackend struct {
	*pagepklfs.Backend
	packStore *widgetpack.Store
}

func newPageBackend(configDir, driversDir string, packStore *widgetpack.Store) *pageBackend {
	return &pageBackend{
		Backend:   pagepklfs.New(configDir, driversDir),
		packStore: packStore,
	}
}

func (b *pageBackend) WidgetCatalog(_ context.Context) ([]page.WidgetClassInfo, error) {
	var packs []page.InstalledPack
	if b.packStore != nil {
		view := b.packStore.ClassesView()
		for _, pv := range view {
			classes := make([]page.PackClass, 0, len(pv.Classes))
			for _, c := range pv.Classes {
				classes = append(classes, page.PackClass{
					Name:       c.Name,
					BundleURL:  c.BundleURL,
					BundleHash: c.BundleHash,
				})
			}
			packs = append(packs, page.InstalledPack{
				Name:    pv.Name,
				Version: pv.Version,
				Classes: classes,
			})
		}
	}
	return page.NewCatalog(packs).WidgetClasses(), nil
}
