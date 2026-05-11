/**
 * model.ts — TypeScript types for the three-tier widget contract.
 * Section / Tile / Cell → PageModel.
 */

export interface TileDef {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface CellDef {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface SectionDef {
  id: string;
  type: string;
  props: Record<string, unknown>;
  tiles?: TileDef[];
  cells?: CellDef[];
}

export interface PageModel {
  slug: string;
  title: string;
  sections: SectionDef[];
  sourcePkl?: string;
  layoutPkl?: string;
  writable?: boolean;
}
