/**
 * ScriptService client. The Starlark editor uses RunTests (server-
 * streaming) to drive its test runner panel.
 *
 * Wire shape (proto):
 *   RunTestsRequest  { string path = 1; }
 *   RunTestsResponse {
 *     oneof kind {
 *       StarlarkTestEvent event     = 1;
 *       Heartbeat         heartbeat = 2;
 *     }
 *   }
 *   StarlarkTestEvent { string name, string outcome ("ok"|"fail"),
 *                       string detail, Timestamp at }
 *
 * "Start" / "Done" sentinels don't exist server-side — the daemon
 * just streams one event per test until end-of-stream. The consumer
 * (SyTestPanel) treats stream-close as the run finishing.
 */

import { rpcStream, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ScriptService";

export type TestEvent =
  | { kind: "pass"; name: string; detail: string }
  | { kind: "fail"; name: string; detail: string };

interface RawStarlarkTestEvent {
  name?: string;
  outcome?: string;
  detail?: string;
}

interface RawRunTestsResponse {
  event?: RawStarlarkTestEvent;
  heartbeat?: Record<string, unknown>;
}

export async function* runTests(
  path: string,
  opts: RpcOptions = {},
): AsyncGenerator<TestEvent, void, void> {
  const stream = rpcStream<{ path: string }, RawRunTestsResponse>(
    `${SVC}/RunTests`, { path }, opts,
  );
  for await (const raw of stream) {
    if (raw.event) {
      const name = raw.event.name ?? "";
      const detail = raw.event.detail ?? "";
      yield raw.event.outcome === "fail"
        ? { kind: "fail", name, detail }
        : { kind: "pass", name, detail };
    }
    // heartbeat: ignored — purely a keep-alive
  }
}
