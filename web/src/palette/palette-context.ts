/**
 * palette-context.ts
 * The raw React context for the palette open/close state.
 * Separated so PaletteProvider and usePalette can import it without
 * triggering react-refresh/only-export-components.
 * UI v2 Plan 05.
 */
import { createContext } from "react";

export interface PaletteContextValue {
  openPalette: () => void;
  closePalette: () => void;
  isOpen: boolean;
}

export const PaletteContext = createContext<PaletteContextValue | null>(null);
