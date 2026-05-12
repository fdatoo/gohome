package daemon

import (
	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/registry"
)

// syncAreasToRegistry pushes the snapshot's area set and entity→area
// assignments into the registry's in-memory area store. Called both on
// initial config load and via OnApplied on every subsequent reload.
func syncAreasToRegistry(reg *registry.Registry, snap *configpb.ConfigSnapshot) {
	if reg == nil || snap == nil {
		return
	}
	areas := make([]registry.Area, 0, len(snap.GetAreas()))
	for _, a := range snap.GetAreas() {
		areas = append(areas, registry.Area{
			ID:          a.GetId(),
			DisplayName: a.GetDisplayName(),
			ParentID:    a.GetParentId(),
		})
	}
	reg.SetAreas(areas)
	reg.SetEntityAreas(snap.GetEntityAreas())
}
