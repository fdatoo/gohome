/**
 * use-palette.ts
 * Exports usePalette hook separately from the PaletteProvider component
 * to satisfy react-refresh/only-export-components rule.
 * UI v2 Plan 05.
 */
import { useContext } from "react";
import { PaletteContext } from "./palette-context";

export interface PaletteContextValue {
  openPalette: () => void;
  closePalette: () => void;
  isOpen: boolean;
}

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used within PaletteProvider");
  return ctx;
}
