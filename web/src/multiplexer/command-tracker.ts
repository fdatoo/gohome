export type PendingState =
  | { state: "idle" }
  | { state: "pending"; commandId: string; sinceMs: number }
  | { state: "settled"; commandId: string; ok: boolean; error?: string; ageMs: number };
type Listener = (p: PendingState) => void;
export class CommandTracker {
  private pending = new Map<string, { entityId: string; t0: number }>();
  private settled = new Map<string, { commandId: string; ok: boolean; error?: string; t0: number }>();
  private subs = new Map<string, Set<Listener>>();
  issued(id: string, entityId: string) { this.pending.set(id, { entityId, t0: Date.now() }); this.notify(entityId); }
  acked(id: string) { this.settled_(id, true); }
  failed_(id: string, error: string) {
    this.settled_(id, false, error);
  }
  current(entityId: string): PendingState {
    const ps = [...this.pending.entries()].filter(([, e]) => e.entityId === entityId);
    if (ps.length > 0) { const [cid, e] = ps[ps.length - 1]; return { state: "pending", commandId: cid, sinceMs: Date.now() - e.t0 }; }
    const done = this.settled.get(entityId);
    if (done) {
      return {
        state: "settled",
        commandId: done.commandId,
        ok: done.ok,
        error: done.error,
        ageMs: Date.now() - done.t0,
      };
    }
    return { state: "idle" };
  }
  subscribe(entityId: string, fn: Listener) {
    if (!this.subs.has(entityId)) this.subs.set(entityId, new Set());
    this.subs.get(entityId)!.add(fn);
    return () => this.subs.get(entityId)!.delete(fn);
  }
  private settled_(id: string, ok: boolean, error?: string) {
    const e = this.pending.get(id);
    this.pending.delete(id);
    if (!e) return;
    this.settled.set(e.entityId, { commandId: id, ok, error, t0: Date.now() });
    this.notify(e.entityId);
    setTimeout(() => {
      const latest = this.settled.get(e.entityId);
      if (latest?.commandId === id) {
        this.settled.delete(e.entityId);
        this.notify(e.entityId);
      }
    }, 3000);
  }
  private notify(id: string) { this.subs.get(id)?.forEach(fn => fn(this.current(id))); }
}
