/**
 * registry.ts — registers all built-in Section / Tile / Cell implementations.
 * Exports resolveSection / resolveTile / resolveCell, each falling back to an
 * Unknown* stub if the type is not registered.
 */

import type { ComponentType } from "react";
import type { SectionDef, TileDef, CellDef } from "./model";

// Component prop shapes
export interface SectionProps {
  def: SectionDef;
  editMode?: boolean;
}

export interface TileProps {
  def: TileDef;
  editMode?: boolean;
}

export interface CellProps {
  def: CellDef;
  editMode?: boolean;
}

type SectionComponent = ComponentType<SectionProps>;
type TileComponent = ComponentType<TileProps>;
type CellComponent = ComponentType<CellProps>;

const sections = new Map<string, SectionComponent>();
const tiles = new Map<string, TileComponent>();
const cells = new Map<string, CellComponent>();

export function registerSection(type: string, component: SectionComponent): void {
  sections.set(type, component);
}

export function registerTile(type: string, component: TileComponent): void {
  tiles.set(type, component);
}

export function registerCell(type: string, component: CellComponent): void {
  cells.set(type, component);
}

export function resolveSection(type: string): SectionComponent {
  return sections.get(type) ?? UnknownSection;
}

export function resolveTile(type: string): TileComponent {
  return tiles.get(type) ?? UnknownTile;
}

export function resolveCell(type: string): CellComponent {
  return cells.get(type) ?? UnknownCell;
}

// Stub components for unknown types — private fallbacks, not exported individually
/* eslint-disable react-refresh/only-export-components */
function UnknownSection({ def }: SectionProps) {
  return (
    <div
      style={{
        padding: "var(--sy-space-4)",
        background: "var(--sy-color-surface-1)",
        borderRadius: "var(--sy-radius)",
        border: "1px dashed var(--sy-color-line)",
        color: "var(--sy-color-fg-3)",
        fontSize: "0.875rem",
      }}
    >
      Unknown section type: <code>{def.type}</code>
    </div>
  );
}

function UnknownTile({ def }: TileProps) {
  return (
    <div
      style={{
        padding: "var(--sy-space-3)",
        background: "var(--sy-color-surface-1)",
        borderRadius: "var(--sy-radius)",
        border: "1px dashed var(--sy-color-line)",
        color: "var(--sy-color-fg-3)",
        fontSize: "0.75rem",
      }}
    >
      Unknown tile: <code>{def.type}</code>
    </div>
  );
}

function UnknownCell({ def }: CellProps) {
  return (
    <div
      style={{
        padding: "var(--sy-space-2)",
        color: "var(--sy-color-fg-3)",
        fontSize: "0.75rem",
        borderBottom: "1px solid var(--sy-color-line-soft)",
      }}
    >
      Unknown cell: <code>{def.type}</code>
    </div>
  );
}
/* eslint-enable react-refresh/only-export-components */
