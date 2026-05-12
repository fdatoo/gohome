/**
 * EditSessionService client. The daemon owns the on-disk state; sessions
 * are transactional — OpenForEdit locks a file, the UI is canonical until
 * CommitEdit (which checks the hash and writes), AbandonEdit releases.
 *
 * SessionEvents is a server-stream that surfaces ExternalEditDetected
 * when another process modifies the file while a session is open.
 */

import { rpcCall, rpcStream, type RpcOptions } from "./rpc";

const SVC = "switchyard.editsession.v1.EditSessionService";

export interface FileEntry {
  path: string;
  /** "pkl" or "star". */
  kind: "pkl" | "star";
}

interface RawFileEntry {
  path?: string;
  kind?: string;
}

export async function listFiles(opts: RpcOptions = {}): Promise<{ files: FileEntry[] }> {
  const res = await rpcCall<Record<string, never>, { files?: RawFileEntry[] }>(
    `${SVC}/ListFiles`, {}, opts,
  );
  const files: FileEntry[] = [];
  for (const f of res.files ?? []) {
    const path = f.path ?? "";
    if (!path) continue;
    const ext = path.endsWith(".pkl") ? "pkl" : path.endsWith(".star") ? "star" : null;
    if (!ext) continue;
    files.push({ path, kind: (f.kind === "pkl" || f.kind === "star") ? f.kind : ext });
  }
  return { files };
}

export interface OpenForEditResult {
  sessionId: string;
  lockToken: string;
  fileHash: string;
  ancestorPkl: string;
  /** The daemon ships an AST as JSON; raw-text editor flow ignores it. */
  astJson: string;
}

interface RawOpenForEditResponse {
  session_id?: string; sessionId?: string;
  lock_token?: string; lockToken?: string;
  file_hash?: string;  fileHash?: string;
  ancestor_pkl?: string; ancestorPkl?: string;
  ast_json?: string; astJson?: string;
}

export async function openForEdit(filePath: string, opts: RpcOptions = {}): Promise<OpenForEditResult> {
  const res = await rpcCall<{ filePath: string }, RawOpenForEditResponse>(
    `${SVC}/OpenForEdit`, { filePath }, opts,
  );
  return {
    sessionId:   res.sessionId   ?? res.session_id   ?? "",
    lockToken:   res.lockToken   ?? res.lock_token   ?? "",
    fileHash:    res.fileHash    ?? res.file_hash    ?? "",
    ancestorPkl: res.ancestorPkl ?? res.ancestor_pkl ?? "",
    astJson:     res.astJson     ?? res.ast_json     ?? "",
  };
}

export interface CommitEditResult {
  /** New file hash after write, when success. */
  newFileHash: string;
  /** Conflict info if the on-disk hash didn't match. */
  conflict?: { reason: string };
}

interface RawCommitEditResponse {
  result?: {
    success?: { new_file_hash?: string; newFileHash?: string };
    conflict?: { reason?: string };
  };
}

export async function commitEdit(
  args: { filePath: string; lockToken: string; regeneratedPkl: string; expectedFileHash: string; force?: boolean },
  opts: RpcOptions = {},
): Promise<CommitEditResult> {
  const res = await rpcCall<typeof args, RawCommitEditResponse>(
    `${SVC}/CommitEdit`,
    args,
    opts,
  );
  if (res.result?.conflict) {
    return { newFileHash: "", conflict: { reason: res.result.conflict.reason ?? "conflict" } };
  }
  const succ = res.result?.success;
  return { newFileHash: succ?.newFileHash ?? succ?.new_file_hash ?? "" };
}

export async function abandonEdit(args: { filePath: string; lockToken: string }, opts: RpcOptions = {}): Promise<void> {
  await rpcCall<typeof args, Record<string, never>>(
    `${SVC}/AbandonEdit`, args, opts,
  );
}

export async function renameFile(
  args: { oldFilePath: string; newFilePath: string },
  opts: RpcOptions = {},
): Promise<void> {
  await rpcCall<typeof args, Record<string, never>>(
    `${SVC}/RenameFile`, args, opts,
  );
}

export async function deleteFile(filePath: string, opts: RpcOptions = {}): Promise<void> {
  await rpcCall<{ filePath: string }, Record<string, never>>(
    `${SVC}/DeleteFile`, { filePath }, opts,
  );
}

export interface SessionEvent {
  kind: "heartbeat" | "external_edit_detected" | "unknown";
  filePath?: string;
}

interface RawSessionEvent {
  heartbeat?: Record<string, never>;
  external_edit_detected?: { file_path?: string; filePath?: string };
  externalEditDetected?:   { file_path?: string; filePath?: string };
}

export async function* sessionEvents(
  args: { sessionId: string; lockToken: string },
  opts: RpcOptions = {},
): AsyncGenerator<SessionEvent, void, void> {
  const stream = rpcStream<typeof args, RawSessionEvent>(
    `${SVC}/SessionEvents`, args, opts,
  );
  for await (const raw of stream) {
    if (raw.heartbeat) {
      yield { kind: "heartbeat" };
      continue;
    }
    const ext = raw.external_edit_detected ?? raw.externalEditDetected;
    if (ext) {
      yield { kind: "external_edit_detected", filePath: ext.filePath ?? ext.file_path };
      continue;
    }
    yield { kind: "unknown" };
  }
}
