/**
 * ScriptService client. The Starlark editor uses RunTests (server-
 * streaming) to drive its test runner panel.
 */

import { rpcStream, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ScriptService";

export type TestEvent =
  | { kind: "start"; name: string }
  | { kind: "pass";  name: string; durationMs: number }
  | { kind: "fail";  name: string; message: string }
  | { kind: "done";  passed: number; failed: number };

interface RawTestEvent {
  start?: { name?: string };
  pass?:  { name?: string; duration_ms?: number; durationMs?: number };
  fail?:  { name?: string; message?: string };
  done?:  { passed?: number; failed?: number };
}

export async function* runTests(
  scriptId: string,
  opts: RpcOptions = {},
): AsyncGenerator<TestEvent, void, void> {
  const stream = rpcStream<{ scriptId: string }, RawTestEvent>(
    `${SVC}/RunTests`, { scriptId }, opts,
  );
  for await (const raw of stream) {
    if (raw.start) {
      yield { kind: "start", name: raw.start.name ?? "" };
    } else if (raw.pass) {
      yield {
        kind: "pass",
        name: raw.pass.name ?? "",
        durationMs: raw.pass.durationMs ?? raw.pass.duration_ms ?? 0,
      };
    } else if (raw.fail) {
      yield { kind: "fail", name: raw.fail.name ?? "", message: raw.fail.message ?? "" };
    } else if (raw.done) {
      yield { kind: "done", passed: raw.done.passed ?? 0, failed: raw.done.failed ?? 0 };
    }
  }
}
