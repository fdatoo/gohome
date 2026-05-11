/**
 * palette-provider.tsx
 * PaletteProvider holds the open/closed state for the command palette and
 * exposes openPalette via context. Mount above the router so the palette
 * renders above all page content.
 * UI v2 Plan 05.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Palette } from "./palette";
import { useVerbCatalog } from "./verb-catalog-client";
import { useGlobalPaletteShortcut, useMcpAskShortcut } from "./keyboard";
import { useMcpConfigured } from "./use-mcp-configured";
import { PaletteContext } from "./palette-context";

interface PaletteProviderProps {
  children: ReactNode;
  navigate?: (path: string) => void;
}

export function PaletteProvider({ children, navigate }: PaletteProviderProps) {
  const [open, setOpen] = useState(false);
  const catalog = useVerbCatalog();
  const mcpConfigured = useMcpConfigured();

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  const openAsk = useCallback(() => {
    navigate?.("/ask");
    setOpen(false);
  }, [navigate]);

  useGlobalPaletteShortcut(openPalette);
  useMcpAskShortcut(openAsk, mcpConfigured);

  return (
    <PaletteContext.Provider value={{ openPalette, closePalette, isOpen: open }}>
      {children}
      <Palette
        open={open}
        onClose={closePalette}
        catalog={catalog}
        navigate={navigate}
      />
    </PaletteContext.Provider>
  );
}
