/**
 * use-page-editor.ts — Zustand slice for page edit state.
 * Manages: sections[], selectedSectionId, dirty.
 */

import { create } from "zustand";
import type { SectionDef } from "../model";

interface PageEditorState {
  sections: SectionDef[];
  selectedSectionId: string | null;
  dirty: boolean;

  // Actions
  setSections: (sections: SectionDef[]) => void;
  selectSection: (id: string | null) => void;
  moveSection: (fromIndex: number, toIndex: number) => void;
  deleteSection: (id: string) => void;
  addSection: (afterId: string | null, section: SectionDef) => void;
  updateSectionProps: (id: string, props: Record<string, unknown>) => void;
  resetDirty: () => void;
}

export const usePageEditor = create<PageEditorState>((set) => ({
  sections: [],
  selectedSectionId: null,
  dirty: false,

  setSections: (sections) => set({ sections, dirty: false }),

  selectSection: (id) => set({ selectedSectionId: id }),

  moveSection: (fromIndex, toIndex) =>
    set((state) => {
      const sections = [...state.sections];
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { sections, dirty: true };
    }),

  deleteSection: (id) =>
    set((state) => ({
      sections: state.sections.filter((s) => s.id !== id),
      selectedSectionId: state.selectedSectionId === id ? null : state.selectedSectionId,
      dirty: true,
    })),

  addSection: (afterId, section) =>
    set((state) => {
      const sections = [...state.sections];
      if (afterId === null) {
        sections.push(section);
      } else {
        const idx = sections.findIndex((s) => s.id === afterId);
        sections.splice(idx >= 0 ? idx + 1 : sections.length, 0, section);
      }
      return { sections, selectedSectionId: section.id, dirty: true };
    }),

  updateSectionProps: (id, props) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === id ? { ...s, props: { ...s.props, ...props } } : s,
      ),
      dirty: true,
    })),

  resetDirty: () => set({ dirty: false }),
}));
