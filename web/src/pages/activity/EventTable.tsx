import type { EventRecord } from "../../gen/activity/v1/activity_pb";
import styles from "./EventTable.module.css";

export interface EventTableProps {
  events: EventRecord[];
  query: string;
  onQueryChange: (q: string) => void;
  selectedEventId?: string;
  onSelectEvent: (event: EventRecord) => void;
}

/**
 * EventTable — paginated event list with a chip query bar.
 *
 * Columns: timestamp, kind pill, entity, source, seq.
 * Row click → detail panel opens.
 */
export function EventTable({
  events,
  query,
  onQueryChange,
  selectedEventId,
  onSelectEvent,
}: EventTableProps) {
  return (
    <div className={styles.container} data-testid="event-table">
      {/* Query bar */}
      <div className={styles.queryBar}>
        <input
          className={styles.queryInput}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="kind:cmd since:1h fts:kitchen…"
          aria-label="Filter events"
          data-testid="query-input"
        />
        {query && (
          <button
            className={styles.clearBtn}
            onClick={() => onQueryChange("")}
            aria-label="Clear filter"
          >
            ×
          </button>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table} role="table" aria-label="Events">
          <thead>
            <tr>
              <th className={styles.th}>Time</th>
              <th className={styles.th}>Kind</th>
              <th className={styles.th}>Entity</th>
              <th className={styles.th}>Source</th>
              <th className={styles.th}>Seq</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  No events found.
                </td>
              </tr>
            )}
            {events.map((ev) => (
              <tr
                key={ev.eventId}
                className={styles.row}
                data-selected={selectedEventId === ev.eventId ? "true" : undefined}
                onClick={() => onSelectEvent(ev)}
                role="row"
                aria-selected={selectedEventId === ev.eventId}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectEvent(ev);
                }}
                data-testid="event-row"
              >
                <td className={styles.td}>
                  <time className={styles.time} dateTime={ev.occurredAt ?? undefined}>
                    {ev.occurredAt ? new Date(ev.occurredAt).toLocaleTimeString() : "—"}
                  </time>
                </td>
                <td className={styles.td}>
                  <span className={styles.kindPill} data-kind={ev.kind}>
                    {ev.kind}
                  </span>
                </td>
                <td className={styles.td}>{ev.entity || "—"}</td>
                <td className={styles.td}>{ev.source || "—"}</td>
                <td className={styles.td}>
                  <code className={styles.seq}>{ev.sequence?.toString() ?? "—"}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
