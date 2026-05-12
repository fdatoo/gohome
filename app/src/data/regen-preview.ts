/**
 * ConfigService.RegenPreview client. Takes a typed AST (any of the
 * supported file_types) and returns the daemon's canonical Pkl bytes.
 * The form components use this to transform a structured edit into
 * the Pkl that EditSessionService.CommitEdit accepts.
 */

import { rpcCall, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ConfigService";

export async function regenPreview(
  args: { fileType: "automation" | "page" | "scene" | "area" | "entity_areas"; astJson: string },
  opts: RpcOptions = {},
): Promise<{ pklText: string }> {
  const res = await rpcCall<typeof args, { pklBytes?: string; pkl_bytes?: string }>(
    `${SVC}/RegenPreview`, args, opts,
  );
  // pklBytes is base64-encoded on the wire (proto `bytes`); JSON
  // decoder gives us the string straight if Connect emits it as
  // base64. Either way, the client's job is to convert to plain text.
  const b64 = res.pklBytes ?? res.pkl_bytes ?? "";
  if (!b64) return { pklText: "" };
  // Connect-JSON serializes bytes as base64.
  return { pklText: atob(b64) };
}
