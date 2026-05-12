package registry

// SetAreas replaces the registry's known area set. Called by the config
// manager on every successful Apply so areas track the Pkl source of
// truth. Concurrent reads are safe; writes go through SetAreas /
// SetEntityAreas which take the lock.
func (r *Registry) SetAreas(areas []Area) {
	r.areaMu.Lock()
	defer r.areaMu.Unlock()
	m := make(map[string]Area, len(areas))
	for _, a := range areas {
		if a.ID == "" {
			continue
		}
		m[a.ID] = a
	}
	r.areas = m
}

// SetEntityAreas replaces the entity-id → area-id assignment map. Same
// lifecycle: refreshed on every config Apply.
func (r *Registry) SetEntityAreas(m map[string]string) {
	r.areaMu.Lock()
	defer r.areaMu.Unlock()
	if m == nil {
		r.entityAreas = map[string]string{}
		return
	}
	dup := make(map[string]string, len(m))
	for k, v := range m {
		dup[k] = v
	}
	r.entityAreas = dup
}

// ListAreasInMemory returns all known areas, sorted by ID. The slice is
// freshly allocated so callers can hold it without locking.
func (r *Registry) ListAreasInMemory() []Area {
	r.areaMu.RLock()
	defer r.areaMu.RUnlock()
	out := make([]Area, 0, len(r.areas))
	for _, a := range r.areas {
		out = append(out, a)
	}
	// Simple insertion sort by ID — area count is small (rooms in a home,
	// not entities) so sort cost is negligible.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1].ID > out[j].ID; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

// GetAreaInMemory returns one area by id. ok is false if no area with
// that id exists.
func (r *Registry) GetAreaInMemory(id string) (Area, bool) {
	r.areaMu.RLock()
	defer r.areaMu.RUnlock()
	a, ok := r.areas[id]
	return a, ok
}

// AreaForEntity returns the area-id assigned to the given entity, or
// "" if the entity has no assignment.
func (r *Registry) AreaForEntity(entityID string) string {
	r.areaMu.RLock()
	defer r.areaMu.RUnlock()
	return r.entityAreas[entityID]
}
