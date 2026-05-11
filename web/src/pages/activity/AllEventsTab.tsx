import { useState, useMemo } from "react";
import type { EventRecord } from "../../gen/activity/v1/activity_pb";
import { FacetRail } from "./FacetRail";
import type { FacetGroup } from "./FacetRail";
import { Sparkline } from "./Sparkline";
import type { SparklineBucket } from "./Sparkline";
import { EventTable } from "./EventTable";
import { EventDetailPanel } from "./EventDetailPanel";
import styles from "./AllEventsTab.module.css";

export interface AllEventsTabProps {
  events: EventRecord[];
  loading?: boolean;
}

/** Builds 5-minute sparkline buckets from a list of events. */
function buildBuckets(events: EventRecord[]): SparklineBucket[] {
  if (events.length === 0) return [];

  const BUCKET_MS = 5 * 60 * 1000;
  const bucketMap = new Map<number, SparklineBucket>();

  for (const ev of events) {
    const ts = ev.occurredAt ? new Date(ev.occurredAt).getTime() : Date.now();
    const bucketTs = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
    if (!bucketMap.has(bucketTs)) {
      bucketMap.set(bucketTs, { ts: bucketTs, cmd: 0, state: 0, cfg: 0, err: 0 });
    }
    const bucket = bucketMap.get(bucketTs)!;
    if (ev.kind?.startsWith("cmd") || ev.kind?.startsWith("command")) bucket.cmd += 1;
    else if (ev.kind?.startsWith("state") || ev.kind === "state_changed") bucket.state += 1;
    else if (ev.kind?.startsWith("config") || ev.kind?.startsWith("driver")) bucket.cfg += 1;
    else if (ev.kind?.includes("fail") || ev.kind?.includes("error") || ev.kind?.includes("deny")) bucket.err += 1;
    else bucket.state += 1;
  }

  return Array.from(bucketMap.values()).sort((a, b) => a.ts - b.ts);
}

/** Builds facet groups from a list of events. */
function buildFacets(events: EventRecord[], activeFilters: Record<string, string[]>): FacetGroup[] {
  const count = (key: keyof EventRecord) => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      const val = (ev[key] as string) || "";
      if (val) counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    return counts;
  };

  const toValues = (counts: Map<string, number>, key: FacetGroup["key"]) =>
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, c]) => ({
        value,
        count: c,
        active: (activeFilters[key] ?? []).includes(value),
      }));

  return [
    { key: "kind", label: "Kind", values: toValues(count("kind"), "kind") },
    { key: "source", label: "Source", values: toValues(count("source"), "source") },
    { key: "entity", label: "Entity", values: toValues(count("entity"), "entity") },
    { key: "issuedBy", label: "Issued by", values: toValues(count("source"), "issuedBy") },
  ];
}

/**
 * AllEventsTab — Faceted event explorer.
 *
 * Layout:
 *   - Full-width Sparkline at top
 *   - Body: 220px FacetRail | flex EventTable | optional 420px EventDetailPanel
 */
export function AllEventsTab({ events, loading = false }: AllEventsTabProps) {
  const [query, setQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

  // Apply active facet filters and query filter.
  const filteredEvents = useMemo(() => {
    let result = events;

    // Apply facet filters.
    for (const [key, values] of Object.entries(activeFilters)) {
      if (values.length === 0) continue;
      result = result.filter((ev) => {
        if (key === "kind") return values.includes(ev.kind ?? "");
        if (key === "source" || key === "issuedBy") return values.includes(ev.source ?? "");
        if (key === "entity") return values.includes(ev.entity ?? "");
        return true;
      });
    }

    // Apply free-text query.
    if (query) {
      const lower = query.toLowerCase();
      result = result.filter(
        (ev) =>
          ev.kind?.toLowerCase().includes(lower) ||
          ev.entity?.toLowerCase().includes(lower) ||
          ev.source?.toLowerCase().includes(lower) ||
          ev.eventId?.toLowerCase().includes(lower),
      );
    }

    return result;
  }, [events, activeFilters, query]);

  const buckets = useMemo(() => buildBuckets(filteredEvents), [filteredEvents]);
  const facets = useMemo(() => buildFacets(events, activeFilters), [events, activeFilters]);

  const handleToggleFacet = (key: FacetGroup["key"], value: string) => {
    setActiveFilters((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
    // Re-fire useEvents would happen here via query update in a real impl.
  };

  return (
    <div className={styles.layout} data-testid="all-events-tab">
      {/* Sparkline */}
      <div className={styles.sparklineRow}>
        <Sparkline buckets={buckets} />
      </div>

      {/* Body */}
      <div className={styles.body}>
        <FacetRail groups={facets} onToggleFacet={handleToggleFacet} />

        <EventTable
          events={filteredEvents}
          query={query}
          onQueryChange={setQuery}
          selectedEventId={selectedEvent?.eventId}
          onSelectEvent={setSelectedEvent}
        />

        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>

      {loading && (
        <div className={styles.loadingOverlay} role="status" aria-live="polite">
          Loading events…
        </div>
      )}
    </div>
  );
}
