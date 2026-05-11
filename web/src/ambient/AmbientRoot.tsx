/**
 * AmbientRoot — wraps ambient display pages.
 *
 * - Sets data-language="ambient" on its own root <div> (not documentElement,
 *   so operator tabs keep their language).
 * - Calls useTodGradient() and binds the gradient to --sy-gradient-tod.
 * - Wraps children in <LanguagePrimitives language="ambient">.
 * - No Shell chrome rendered.
 */

import type { ReactNode } from "react";
import { useTodGradient } from "./useTodGradient";
import { LanguagePrimitives } from "@/theme/primitives-provider";
import { LanguageProvider } from "@/theme/language-provider";
import { AmbientButton } from "@/theme/primitives/ambient/button";
import { AmbientChip } from "@/theme/primitives/ambient/chip";
import { AmbientPill } from "@/theme/primitives/ambient/pill";
import { AmbientSurface } from "@/theme/primitives/ambient/surface";
import type { PrimitiveRegistry } from "@/theme/primitives-provider";

// Force ambient primitives regardless of the user's language preference.
// AmbientRoot always runs in ambient mode even if the user's global preference is different.
const AMBIENT_REGISTRY: PrimitiveRegistry = {
  friendly: {
    Button: AmbientButton,
    Chip: AmbientChip,
    Pill: AmbientPill,
    Surface: AmbientSurface,
  },
  ambient: {
    Button: AmbientButton,
    Chip: AmbientChip,
    Pill: AmbientPill,
    Surface: AmbientSurface,
  },
  developer: {
    Button: AmbientButton,
    Chip: AmbientChip,
    Pill: AmbientPill,
    Surface: AmbientSurface,
  },
};

interface AmbientRootProps {
  children: ReactNode;
  /** Optional per-display bearer token for SolarService calls. */
  displayToken?: string;
}

/**
 * Inner component that reads the gradient hook (must be inside LanguageProvider).
 */
function AmbientRootInner({ children, displayToken }: AmbientRootProps) {
  const gradient = useTodGradient(displayToken);

  return (
    <div
      data-language="ambient"
      data-theme="ambient"
      style={{
        minHeight: "100dvh",
        background: gradient,
        // CSS custom property for tiles / child components to read
        "--sy-gradient-tod": gradient,
        transition: "background 90s linear",
      } as React.CSSProperties}
    >
      <LanguagePrimitives registry={AMBIENT_REGISTRY}>{children}</LanguagePrimitives>
    </div>
  );
}

/**
 * AmbientRoot wraps an ambient display page with the ambient language context.
 * It intentionally does NOT render the Shell sidebar/topbar.
 */
export function AmbientRoot({ children, displayToken }: AmbientRootProps) {
  return (
    <LanguageProvider>
      <AmbientRootInner displayToken={displayToken}>{children}</AmbientRootInner>
    </LanguageProvider>
  );
}
