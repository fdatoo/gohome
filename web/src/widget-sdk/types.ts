export type EntityState = {
  entityId: string;
  state?: string;
  attributes?: Record<string, unknown>;
};

export type PendingState =
  | { state: "idle" }
  | { state: "pending"; commandId: string; sinceMs: number }
  | { state: "settled"; commandId: string; ok: boolean; error?: string; ageMs: number };

export type WidgetProps = {
  id: string;
  classId: string;
  props: Record<string, unknown>;
  entityState?: EntityState;
  pending?: PendingState;
};
