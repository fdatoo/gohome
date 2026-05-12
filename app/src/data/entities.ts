/**
 * EntityService client. Lists registered entities, subscribes to live
 * state changes, and (in call-capability.ts) issues commands. Also
 * exposes a thin wrapper around DeviceService.List used by the entity
 * store to map device_id → driver_instance_id (the proto's Entity
 * doesn't carry driver_instance_id directly).
 */

import { rpcCall, rpcStream, type RpcOptions } from "./rpc";

/* ---- Attribute payloads (mirror switchyard.entity.v1.Attributes) ----- */

export interface LightAttrs {
  on?: boolean;
  brightness?: number;   // 0..255
  colorTemp?: number;    // mireds; 0 if unsupported
  colorRgb?: number;     // 0xRRGGBB; 0 if unsupported / not active
}
export interface SwitchAttrs {
  on?: boolean;
}
export interface NumericSensorAttrs {
  unit?: string;
  value?: number;
}
export interface BinarySensorAttrs {
  on?: boolean;
}

export interface Attributes {
  light?: LightAttrs;
  switchDevice?: SwitchAttrs;
  numericSensor?: NumericSensorAttrs;
  binarySensor?: BinarySensorAttrs;
  available?: boolean;
}

/* ---- Entity --------------------------------------------------------- */

export interface Entity {
  id: string;
  type: string;
  deviceId: string;
  areaId: string;
  zoneId: string;
  friendlyName: string;
  state?: Attributes;
  capabilities?: Attributes;
}

interface RawEntity {
  id?: string;
  type?: string;
  device_id?: string; deviceId?: string;
  area_id?: string;   areaId?: string;
  zone_id?: string;   zoneId?: string;
  friendly_name?: string; friendlyName?: string;
  state?: Attributes;
  capabilities?: Attributes;
}

function decode(r: RawEntity): Entity {
  return {
    id:           r.id ?? "",
    type:         r.type ?? "",
    deviceId:     r.deviceId     ?? r.device_id     ?? "",
    areaId:       r.areaId       ?? r.area_id       ?? "",
    zoneId:       r.zoneId       ?? r.zone_id       ?? "",
    friendlyName: r.friendlyName ?? r.friendly_name ?? "",
    state:        r.state,
    capabilities: r.capabilities,
  };
}

export interface ListEntitiesResponse {
  entities: Entity[];
}

const ENTITY_SVC = "switchyard.v1alpha1.EntityService";

export async function listEntities(opts: RpcOptions = {}): Promise<ListEntitiesResponse> {
  const res = await rpcCall<Record<string, never>, { entities?: RawEntity[] }>(
    `${ENTITY_SVC}/List`,
    {},
    opts,
  );
  return { entities: (res.entities ?? []).map(decode) };
}

/* ---- Subscribe stream ----------------------------------------------- */

export interface EntitySelector {
  entityIds?: string[];
  deviceIds?: string[];
  areas?: string[];
  zones?: string[];
  classes?: string[];
}

export interface EntityChange {
  entityId: string;
  cursor: number;
  at?: string;
  entity: Entity;
}
export interface EntityHeartbeat {
  /** Server-monotonic position at heartbeat time. May be 0 if no events
   *  have flowed yet on this stream. */
  latestCursor?: number;
  serverTime?: string;
}

/** One element from the Subscribe stream — either a change OR a heartbeat
 *  (oneof on the wire). */
export type SubscribeMessage =
  | { change: EntityChange; heartbeat?: undefined }
  | { change?: undefined; heartbeat: EntityHeartbeat };

interface RawSubscribeMessage {
  change?: { entityId?: string; cursor?: number | string; at?: string; entity?: RawEntity };
  heartbeat?: { latestCursor?: number | string; serverTime?: string };
}

function decodeSubscribe(raw: RawSubscribeMessage): SubscribeMessage | null {
  if (raw.change) {
    const c = raw.change;
    if (!c.entity) return null;
    return {
      change: {
        entityId: c.entityId ?? "",
        cursor:   typeof c.cursor === "string" ? Number(c.cursor) : (c.cursor ?? 0),
        at:       c.at,
        entity:   decode(c.entity),
      },
    };
  }
  if (raw.heartbeat) {
    const h = raw.heartbeat;
    return {
      heartbeat: {
        latestCursor: typeof h.latestCursor === "string" ? Number(h.latestCursor) : h.latestCursor,
        serverTime:   h.serverTime,
      },
    };
  }
  return null;
}

/** Server-streaming subscription. Yields each Subscribe message until the
 *  stream ends or `opts.signal` aborts. fromCursor=0 means "live from now"
 *  per the proto contract. */
export async function* subscribeEntities(
  selector: EntitySelector = {},
  fromCursor = 0,
  opts: RpcOptions = {},
): AsyncGenerator<SubscribeMessage, void, void> {
  const stream = rpcStream<unknown, RawSubscribeMessage>(
    `${ENTITY_SVC}/Subscribe`,
    { selector, fromCursor },
    opts,
  );
  for await (const raw of stream) {
    const msg = decodeSubscribe(raw);
    if (msg) yield msg;
  }
}

/* ---- DeviceService.List wrapper ------------------------------------- */

export interface Device {
  id: string;
  friendlyName: string;
  areaId: string;
  driverInstanceId: string;
  entityIds: string[];
}

interface RawDevice {
  id?: string;
  friendly_name?: string; friendlyName?: string;
  area_id?: string;       areaId?: string;
  driver_instance_id?: string; driverInstanceId?: string;
  entity_ids?: string[];  entityIds?: string[];
}

function decodeDevice(r: RawDevice): Device {
  return {
    id:               r.id ?? "",
    friendlyName:     r.friendlyName     ?? r.friendly_name     ?? "",
    areaId:           r.areaId           ?? r.area_id           ?? "",
    driverInstanceId: r.driverInstanceId ?? r.driver_instance_id ?? "",
    entityIds:        r.entityIds        ?? r.entity_ids        ?? [],
  };
}

export interface ListDevicesResponse {
  devices: Device[];
}

const DEVICE_SVC = "switchyard.v1alpha1.DeviceService";

export async function listDevices(opts: RpcOptions = {}): Promise<ListDevicesResponse> {
  const res = await rpcCall<Record<string, never>, { devices?: RawDevice[] }>(
    `${DEVICE_SVC}/List`,
    {},
    opts,
  );
  return { devices: (res.devices ?? []).map(decodeDevice) };
}
