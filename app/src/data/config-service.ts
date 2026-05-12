/**
 * ConfigService client. v1 surface is just Reload — used after
 * CommitEdit so the daemon picks up the new file immediately
 * (the file watcher would catch it too, but the explicit call is
 * deterministic and lets the UI block on completion).
 */

import { rpcCall, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ConfigService";

export interface ReloadResult {
  correlationId: string;
}

export async function reloadConfig(opts: RpcOptions = {}): Promise<ReloadResult> {
  const res = await rpcCall<Record<string, never>, { correlationId?: string; correlation_id?: string }>(
    `${SVC}/Reload`, {}, opts,
  );
  return { correlationId: res.correlationId ?? res.correlation_id ?? "" };
}
