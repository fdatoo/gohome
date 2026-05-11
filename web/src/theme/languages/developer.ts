import type { LanguagePreset, TokenSet } from "../types";
import { motion } from "../motion";

const cssVar = (name: string) => `var(${name})`;
const base = {
  radius: { sm: cssVar("--sy-radius-sm"), md: cssVar("--sy-radius-md"), lg: cssVar("--sy-radius-lg"), pill: cssVar("--sy-radius-pill") },
  motion,
  font: { display: cssVar("--sy-font-display"), body: cssVar("--sy-font-body"), numeric: cssVar("--sy-font-numeric") },
};
const colors = {
  bg: cssVar("--sy-color-bg"), surface1: cssVar("--sy-color-surface-1"), surface2: cssVar("--sy-color-surface-2"),
  border: cssVar("--sy-color-border"), fg: cssVar("--sy-color-fg"), fgMuted: cssVar("--sy-color-fg-muted"),
  accent: cssVar("--sy-color-accent"), success: cssVar("--sy-color-success"), warning: cssVar("--sy-color-warning"), danger: cssVar("--sy-color-danger"),
};
const tokens: TokenSet = { color: colors, ...base };
export const developer: LanguagePreset = { id: "developer", modes: { light: tokens, dark: tokens } };
