/**
 * Singleton entity store.
 *
 * Lifecycle: start() runs ListEntities + ListDevices for the initial
 * snapshot, then opens Subscribe() for live updates. On stream errors
 * it reconnects with exponential backoff, replaying from the last
 * cursor it saw. stop() aborts everything.
 *
 * Reactivity: `entities` is a shallowRef holding a Map; the Map is
 * REPLACED on every mutation (rather than mutated in place) so Vue's
 * reactivity tracks changes correctly. Consumers read via byDriver(id)
 * / byArea(id) computeds, or directly via entities.value.size.
 *
 * Optimistic mutations: applyOptimistic(id, patch) returns a revert
 * thunk. The store records a per-entity optimistic generation; if a
 * real EntityChange arrives between apply and revert, revert no-ops
 * (the truth has already arrived).
 *
 * Driver mapping: the proto's Entity doesn't carry driver_instance_id,
 * so byDriver() reads the deviceId → driverInstanceId map populated
 * from ListDevices().
 */

import { computed, shallowRef, type ComputedRef, type Ref } from "vue";
import {
  listDevices, listEntities, subscribeEntities,
  type Device, type Entity,
} from "@/data/entities";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000; // 2× the daemon's default 30s heartbeat

export interface EntityStore {
  entities: Readonly<Ref<ReadonlyMap<string, Entity>>>;
  connected: Readonly<Ref<boolean>>;
  hydrated: Readonly<Ref<boolean>>;
  start(): Promise<void>;
  stop(): void;
  byDriver(driverInstanceId: string): ComputedRef<Entity[]>;
  byArea(areaId: string): ComputedRef<Entity[]>;
  applyOptimistic(id: string, patch: Partial<Entity>): () => void;
}

function createStore(): EntityStore {
  const entitiesRef = shallowRef<Map<string, Entity>>(new Map());
  const connected = shallowRef<boolean>(false);
  const hydrated = shallowRef<boolean>(false);
  const deviceToDriver = shallowRef<Map<string, string>>(new Map());

  let abort: AbortController | null = null;
  let started = false;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;
  let watchdog: number | null = null;
  let lastCursor = 0;
  let lastSeenAt = Date.now();
  let optimisticGen = 0;
  /** Map<entityId, latestOptimisticGen> — guards revert against a
   *  real EntityChange that landed in between. */
  const optimisticByEntity = new Map<string, number>();

  function upsert(id: string, e: Entity): void {
    const m = new Map(entitiesRef.value);
    m.set(id, e);
    entitiesRef.value = m;
    // Real change wins over any pending optimistic generation.
    optimisticByEntity.delete(id);
  }

  function rebuildDeviceMap(devices: Device[]): void {
    const m = new Map<string, string>();
    for (const d of devices) {
      if (d.id && d.driverInstanceId) m.set(d.id, d.driverInstanceId);
      // Some installations include entity_ids on the device row; index
      // those too so byDriver() still resolves entities whose deviceId
      // is empty (rare but possible for synthetic / driver-level entities).
      for (const eid of d.entityIds) {
        m.set(`entity:${eid}`, d.driverInstanceId);
      }
    }
    deviceToDriver.value = m;
  }

  function driverOf(entity: Entity): string | undefined {
    if (entity.deviceId) {
      const v = deviceToDriver.value.get(entity.deviceId);
      if (v) return v;
    }
    return deviceToDriver.value.get(`entity:${entity.id}`);
  }

  async function hydrate(signal: AbortSignal): Promise<void> {
    const [eRes, dRes] = await Promise.all([
      listEntities({ signal }),
      listDevices({ signal }),
    ]);
    rebuildDeviceMap(dRes.devices);
    const m = new Map<string, Entity>();
    for (const e of eRes.entities) m.set(e.id, e);
    entitiesRef.value = m;
    hydrated.value = true;
  }

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
        // Force-close; runStream's catch schedules a reconnect.
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
      // Hydrate on first run only; reconnects keep the existing snapshot
      // and just resume the stream from lastCursor.
      if (!hydrated.value) await hydrate(abort.signal);
      connected.value = true;
      lastSeenAt = Date.now();
      reconnectAttempt = 0;
      startWatchdog();
      const stream = subscribeEntities({}, lastCursor, { signal: abort.signal });
      for await (const msg of stream) {
        lastSeenAt = Date.now();
        if (msg.change) {
          if (msg.change.cursor > lastCursor) lastCursor = msg.change.cursor;
          upsert(msg.change.entityId, msg.change.entity);
        }
        // Heartbeat: nothing to do — lastSeenAt already bumped.
      }
      // Stream closed cleanly (server-initiated EOS). Treat as a
      // disconnect and try again.
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
    entities: entitiesRef,
    connected,
    hydrated,

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

    byDriver(driverInstanceId: string): ComputedRef<Entity[]> {
      return computed<Entity[]>(() => {
        const out: Entity[] = [];
        for (const e of entitiesRef.value.values()) {
          if (driverOf(e) === driverInstanceId) out.push(e);
        }
        return out;
      });
    },

    byArea(areaId: string): ComputedRef<Entity[]> {
      return computed<Entity[]>(() => {
        const out: Entity[] = [];
        for (const e of entitiesRef.value.values()) {
          if (e.areaId === areaId) out.push(e);
        }
        return out;
      });
    },

    applyOptimistic(id: string, patch: Partial<Entity>): () => void {
      const cur = entitiesRef.value.get(id);
      if (!cur) return () => { /* no entry to revert */ };
      const gen = ++optimisticGen;
      optimisticByEntity.set(id, gen);
      // Patch state.light specifically so we can do partial updates
      // (e.g., only flip `on` without erasing `brightness`). Other
      // attributes get a top-level merge.
      const merged: Entity = {
        ...cur,
        ...patch,
        state: {
          ...cur.state,
          ...patch.state,
          ...(patch.state?.light ? {
            light: { ...cur.state?.light, ...patch.state.light },
          } : {}),
        },
      };
      const m = new Map(entitiesRef.value);
      m.set(id, merged);
      entitiesRef.value = m;
      return () => {
        if (optimisticByEntity.get(id) !== gen) return; // already overwritten by stream
        optimisticByEntity.delete(id);
        const m2 = new Map(entitiesRef.value);
        m2.set(id, cur);
        entitiesRef.value = m2;
      };
    },
  };
}

export const entityStore: EntityStore = createStore();
