/**
 * Displays section in Settings — embeds the operator's Displays list.
 * The same component renders at /_authed/displays standalone.
 */
import { DisplaysIndex } from "@/routes/_authed/displays/index";

export function Displays() {
  return <DisplaysIndex />;
}
