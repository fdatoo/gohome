/**
 * EntityService.CallCapability client. Issues a single command against
 * an entity and surfaces the (success, errorMessage) outcome. The proto
 * carries `parameters` as google.protobuf.Struct, which over the JSON
 * wire is just a plain object — pass through as-is.
 */

import { rpcCall, type RpcOptions } from "./rpc";

const ENTITY_SVC = "switchyard.v1alpha1.EntityService";

export interface CallCapabilityResult {
  correlationId: string;
  success: boolean;
  errorMessage: string;
}

interface RawResult {
  correlationId?: string; correlation_id?: string;
  success?: boolean;
  errorMessage?: string; error_message?: string;
}

export async function callCapability(
  entityId: string,
  capability: string,
  parameters: Record<string, unknown> = {},
  opts: RpcOptions = {},
): Promise<CallCapabilityResult> {
  const res = await rpcCall<unknown, RawResult>(
    `${ENTITY_SVC}/CallCapability`,
    { entityId, capability, parameters },
    opts,
  );
  return {
    correlationId: res.correlationId ?? res.correlation_id ?? "",
    success:       !!res.success,
    errorMessage:  res.errorMessage  ?? res.error_message  ?? "",
  };
}
