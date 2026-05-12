/**
 * Singleton config-change store.
 *
 * Lifecycle: start() opens the Subscribe stream. On stream errors it
 * reconnects with exponential backoff. stop() aborts.
 *
 * Reactivity: changes don't carry data — they signal "config moved on
 * the daemon; if you care about a slice, refetch." Listeners registered
 * via onChanged() are called with the ConfigChanged event.
 *
 * Connection-menu support: tracks lastReloadAt + lastReloadError so the
 * topbar's connection menu can render them.
 */

import { shallowRef, type Ref } from "vue";
import {
  subscribeConfig,
  reloadConfig,
  type ConfigChanged,
} from "@/data/config-service";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

export type ConfigChangeListener = (ev: ConfigChanged) => void;

export interface ConfigStore {
  connected: Readonly<Ref<boolean>>;
  lastReloadAt: Readonly<Ref<number | null>>;
  lastReloadError: Readonly<Ref<string | null>>;
  start(): Promise<void>;
  stop(): void;
  onChanged(cb: ConfigChangeListener): () => void;
  triggerReload(): Promise<void>;
}

function createStore(): ConfigStore {
  const connected = shallowRef<boolean>(false);
  const lastReloadAt = shallowRef<number | null>(null);
  const lastReloadError = shallowRef<string | null>(null);

  const listeners = new Set<ConfigChangeListener>();
  let abort: AbortController | null = null;
  let started = false;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;
  let watchdog: number | null = null;
  let lastSeenAt = Date.now();

  function clearReconnect(): void {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function startWatchdog(): void {
    if (watchdog !== null) window.clearInterval(watchdog);
    watchdog = window.setInterval(() => {
      if (!connected.value) return;
      if (Date.now() - lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        abort?.abort();
      }
    }, 5_000);
  }

  function scheduleReconnect(): void {
    clearReconnect();
    const base = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    const jitter = base * (0.9 + Math.random() * 0.2);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => { void runStream(); }, jitter);
  }

  async function runStream(): Promise<void> {
    if (!started) return;
    abort = new AbortController();
    try {
      connected.value = true;
      lastSeenAt = Date.now();
      reconnectAttempt = 0;
      startWatchdog();
      const stream = subscribeConfig({ signal: abort.signal });
      for await (const ev of stream) {
        lastSeenAt = Date.now();
        if (ev.kind === "changed") {
          lastReloadAt.value = ev.atUnixMs;
          for (const cb of listeners) {
            try { cb(ev); } catch { /* listener errors don't kill the stream */ }
          }
        }
      }
      connected.value = false;
      if (started) scheduleReconnect();
    } catch (err) {
      connected.value = false;
      if (!started) return;
      if ((err as Error).name === "AbortError") return;
      scheduleReconnect();
    }
  }

  return {
    connected,
    lastReloadAt,
    lastReloadError,

    async start(): Promise<void> {
      if (started) return;
      started = true;
      reconnectAttempt = 0;
      await runStream();
    },

    stop(): void {
      started = false;
      clearReconnect();
      if (watchdog !== null) {
        window.clearInterval(watchdog);
        watchdog = null;
      }
      abort?.abort();
      abort = null;
      connected.value = false;
    },

    onChanged(cb: ConfigChangeListener): () => void {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },

    async triggerReload(): Promise<void> {
      try {
        const r = await reloadConfig();
        lastReloadError.value = r.error || null;
      } catch (err) {
        lastReloadError.value = err instanceof Error ? err.message : String(err);
      }
    },
  };
}

export const configStore: ConfigStore = createStore();
