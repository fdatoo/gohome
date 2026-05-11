import { useState } from "react";

export interface RoomRow {
  id: string;
  name: string;
  state: "on" | "off";
  scene: string;
  brightness: number; // 0–100
  sinceMs: number; // milliseconds since last state change
}

type SortKey = keyof Pick<RoomRow, "name" | "state" | "scene" | "brightness" | "sinceMs">;
type SortDir = "asc" | "desc";

function formatSince(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

interface Props {
  rooms: RoomRow[];
}

export function RoomsTable({ rooms }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...rooms].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "state", label: "State" },
    { key: "scene", label: "Scene" },
    { key: "brightness", label: "Brightness" },
    { key: "sinceMs", label: "Since" },
  ];

  return (
    <table
      data-variant="rooms-table"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: "var(--sy-font-numeric)",
        fontSize: "0.8125rem",
        color: "var(--sy-color-fg)",
      }}
    >
      <thead>
        <tr>
          {columns.map(({ key, label }) => (
            <th
              key={key}
              role="columnheader"
              aria-sort={
                sortKey === key && sortKey !== null
                  ? sortDir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
              }
              onClick={() => handleSort(key)}
              style={{
                cursor: "pointer",
                padding: "var(--sy-space-2) var(--sy-space-3)",
                borderBottom: "1px solid var(--sy-color-line)",
                textAlign: "left",
                fontWeight: 600,
                fontSize: "0.6875rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: sortKey === key && sortKey !== null ? "var(--sy-color-accent)" : "var(--sy-color-fg-3)",
                userSelect: "none",
              }}
            >
              {label}
              {sortKey === key && sortKey !== null && (
                <span aria-hidden="true" style={{ marginLeft: "4px" }}>
                  {sortDir === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((room) => (
          <tr
            key={room.id}
            style={{
              borderBottom: "1px solid var(--sy-color-line-soft)",
            }}
          >
            <td
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3)",
                color: "var(--sy-color-fg)",
                fontWeight: 500,
              }}
            >
              {room.name}
            </td>
            <td
              data-variant={`state-${room.state}`}
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3)",
                color:
                  room.state === "on"
                    ? "var(--sy-color-good)"
                    : "var(--sy-color-fg-4)",
              }}
            >
              {room.state}
            </td>
            <td
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3)",
                color: "var(--sy-color-fg-2)",
              }}
            >
              {room.scene}
            </td>
            <td
              data-variant="numeric"
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3)",
                color: "var(--sy-color-fg-2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {room.brightness}
            </td>
            <td
              data-variant="numeric"
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3)",
                color: "var(--sy-color-fg-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatSince(room.sinceMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
