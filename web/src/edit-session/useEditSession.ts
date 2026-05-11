/**
 * useEditSession — React hook for Pkl file edit sessions.
 *
 * Lifecycle:
 *   - Mount: openForEdit + analyzeRegenerability in parallel.
 *   - SessionEvents stream: pushed ExternalEditDetected sets `conflict`.
 *   - save(): CommitEdit; on conflict sets `conflict` state.
 *   - discard(): AbandonEdit then re-OpenForEdit; resets dirtyCount.
 *   - resolveConflict("force"): re-CommitEdit with force=true.
 *   - resolveConflict("merge"): returns merge context, no RPC.
 *   - beforeunload: calls AbandonEdit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommitConflict,
  EditSessionClient,
  FileOnlyRegion,
} from "./client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SessionStatus = "idle" | "opening" | "open" | "error";

export type ConflictState = {
  diskHash: string;
  diskPkl: string;
  ancestorPkl: string;
  stagedPkl: string;
};

export type MergeContext = {
  kind: "merge";
  sessionId: string;
  ancestorPkl: string;
  diskPkl: string;
  stagedPkl: string;
};

export type ResolveConflictResult =
  | { kind: "resolved" }
  | MergeContext;

export type EditSessionState = {
  status: SessionStatus;
  sessionId: string | null;
  fileHash: string | null;
  astJson: string | null;
  fileOnlyRegions: FileOnlyRegion[];
  dirtyCount: number;
  conflict: ConflictState | null;
  error: string | null;
};

export type EditSessionActions = {
  mutate(): void;
  save(stagedPkl: string): Promise<void>;
  discard(): Promise<void>;
  resolveConflict(
    opts: { kind: "force"; stagedPkl: string } | { kind: "merge" },
    stagedPkl: string,
  ): Promise<ResolveConflictResult>;
};

export type UseEditSessionReturn = EditSessionState & EditSessionActions;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEditSession(
  filePath: string,
  client: EditSessionClient,
): UseEditSessionReturn {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lockToken, setLockToken] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [ancestorPkl, setAncestorPkl] = useState<string>("");
  const [astJson, setAstJson] = useState<string | null>(null);
  const [fileOnlyRegions, setFileOnlyRegions] = useState<FileOnlyRegion[]>([]);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep refs for use in callbacks/event handlers
  const lockTokenRef = useRef<string | null>(null);
  const fileHashRef = useRef<string | null>(null);
  const ancestorPklRef = useRef<string>("");
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  lockTokenRef.current = lockToken;
  fileHashRef.current = fileHash;
  ancestorPklRef.current = ancestorPkl;
  sessionIdRef.current = sessionId;

  const openSession = useCallback(async () => {
    setStatus("opening");
    setError(null);
    setConflict(null);
    setDirtyCount(0);
    try {
      const [openResult, regions] = await Promise.all([
        client.openForEdit(filePath),
        client.analyzeRegenerability(filePath),
      ]);
      setSessionId(openResult.sessionId);
      setLockToken(openResult.lockToken);
      setFileHash(openResult.fileHash);
      setAncestorPkl(openResult.ancestorPkl);
      setAstJson(openResult.astJson);
      setFileOnlyRegions(regions);
      setStatus("open");
      return openResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
      throw err;
    }
  }, [filePath, client]);

  // Start session on mount, subscribe to events.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    abortControllerRef.current = ac;

    void (async () => {
      let openResult: Awaited<ReturnType<typeof client.openForEdit>> | null = null;
      try {
        openResult = await (async () => {
          setStatus("opening");
          setError(null);
          setConflict(null);
          setDirtyCount(0);
          const [res, regions] = await Promise.all([
            client.openForEdit(filePath),
            client.analyzeRegenerability(filePath),
          ]);
          if (cancelled) return res;
          setSessionId(res.sessionId);
          setLockToken(res.lockToken);
          setFileHash(res.fileHash);
          setAncestorPkl(res.ancestorPkl);
          setAstJson(res.astJson);
          setFileOnlyRegions(regions);
          setStatus("open");
          return res;
        })();
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          setStatus("error");
        }
        return;
      }

      // Start SessionEvents stream
      try {
        await client.sessionEvents(
          openResult.sessionId,
          (evt) => {
            if (cancelled) return;
            if (evt.type === "externalEdit") {
              // Trigger conflict banner; keep staged content intact.
              setConflict((prev) => {
                if (prev) return prev; // already in conflict
                return {
                  diskHash: evt.newHash,
                  diskPkl: "", // populated on CommitEdit conflict response
                  ancestorPkl: ancestorPklRef.current,
                  stagedPkl: "", // caller must fill from staged editor content
                };
              });
            }
          },
          ac.signal,
        );
      } catch {
        // Stream ended (likely aborted on unmount) — ignore.
      }
    })();

    // beforeunload: fire-and-forget AbandonEdit
    const handleBeforeUnload = () => {
      const tok = lockTokenRef.current;
      if (tok) {
        void client.abandonEdit(filePath, tok);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      ac.abort();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      const tok = lockTokenRef.current;
      if (tok) {
        void client.abandonEdit(filePath, tok);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const mutate = useCallback(() => {
    setDirtyCount((c) => c + 1);
  }, []);

  const save = useCallback(
    async (stagedPkl: string) => {
      const tok = lockTokenRef.current;
      const hash = fileHashRef.current;
      if (!tok || !hash) throw new Error("no active session");

      const result = await client.commitEdit({
        filePath,
        lockToken: tok,
        regeneratedPkl: stagedPkl,
        expectedFileHash: hash,
        force: false,
      });

      if (result.kind === "success") {
        setFileHash(result.newFileHash);
        setDirtyCount(0);
        setConflict(null);
      } else {
        // CommitConflict
        const c: CommitConflict = result;
        setConflict({
          diskHash: c.diskHash,
          diskPkl: c.diskPkl,
          ancestorPkl: c.ancestorPkl,
          stagedPkl,
        });
      }
    },
    [filePath, client],
  );

  const discard = useCallback(async () => {
    const tok = lockTokenRef.current;
    if (tok) {
      await client.abandonEdit(filePath, tok);
    }
    setConflict(null);
    setDirtyCount(0);
    // Re-open the file fresh
    await openSession();
  }, [filePath, client, openSession]);

  const resolveConflict = useCallback(
    async (
      opts: { kind: "force"; stagedPkl: string } | { kind: "merge" },
      stagedPkl: string,
    ): Promise<ResolveConflictResult> => {
      if (opts.kind === "merge") {
        const sid = sessionIdRef.current;
        const curConflict = conflict;
        return {
          kind: "merge",
          sessionId: sid ?? "",
          ancestorPkl: curConflict?.ancestorPkl ?? "",
          diskPkl: curConflict?.diskPkl ?? "",
          stagedPkl: curConflict?.stagedPkl ?? stagedPkl,
        };
      }

      // force overwrite
      const tok = lockTokenRef.current;
      const hash = fileHashRef.current;
      if (!tok || !hash) throw new Error("no active session");

      const result = await client.commitEdit({
        filePath,
        lockToken: tok,
        regeneratedPkl: opts.stagedPkl,
        expectedFileHash: hash,
        force: true,
      });

      if (result.kind === "success") {
        setFileHash(result.newFileHash);
        setDirtyCount(0);
        setConflict(null);
        return { kind: "resolved" };
      }
      // Shouldn't happen with force=true, but handle gracefully
      throw new Error("force overwrite returned conflict — unexpected");
    },
    [filePath, client, conflict],
  );

  return {
    status,
    sessionId,
    fileHash,
    astJson,
    fileOnlyRegions,
    dirtyCount,
    conflict,
    error,
    mutate,
    save,
    discard,
    resolveConflict,
  };
}
