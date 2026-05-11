import { useState } from "react";
import { useHomeRooms } from "@/pages/home/hooks/useHomeRooms";
import { BulbIcon, ChevronRightIcon, PowerIcon } from "@/shell/icons";

interface Props {
  slug: string;
}

interface FakeEntity {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
}

export function RoomDetailPage({ slug }: Props) {
  const rooms = useHomeRooms();
  const room = rooms.find((r) => r.id === slug);
  const lightCount = parseInt(
    /^(\d+)/.exec(room?.entityCount ?? "1")?.[1] ?? "1",
    10,
  );
  const initial: FakeEntity[] = room
    ? Array.from({ length: lightCount }, (_, i) => ({
        id: `light.${room.id}_${i + 1}`,
        name: `${room.name} light ${i + 1}`,
        on: room.statePill !== "Off",
        brightness: room.statePill === "Dim" ? 30 : 80,
      }))
    : [];
  const [entities, setEntities] = useState<FakeEntity[]>(initial);
  const [activeScene, setActiveScene] = useState<string | null>(
    room?.scenes[0] ?? null,
  );

  if (!room) {
    return (
      <div style={{ padding: "var(--sy-space-5) var(--sy-space-6)" }}>
        <p style={{ color: "var(--sy-color-fg-4)", fontSize: "0.8125rem" }}>
          <a
            href="/_authed/rooms"
            style={{ color: "var(--sy-color-accent)", textDecoration: "none" }}
          >
            ← Rooms
          </a>
        </p>
        <h1 style={{ marginTop: "var(--sy-space-3)", fontSize: "1.75rem" }}>
          Room not found
        </h1>
        <p style={{ color: "var(--sy-color-fg-3)" }}>
          No room with slug <code>{slug}</code>.
        </p>
      </div>
    );
  }

  const allOn = entities.every((e) => e.on);
  const someOn = entities.some((e) => e.on);

  function toggle(id: string) {
    setEntities((prev) =>
      prev.map((e) => (e.id === id ? { ...e, on: !e.on } : e)),
    );
  }
  function setBrightness(id: string, v: number) {
    setEntities((prev) =>
      prev.map((e) => (e.id === id ? { ...e, brightness: v } : e)),
    );
  }
  function applyScene(scene: string) {
    setActiveScene(scene);
    setEntities((prev) =>
      prev.map((e) => ({
        ...e,
        on: scene !== "Off",
        brightness:
          scene === "Dim"
            ? 30
            : scene === "Off"
            ? 0
            : scene === "Sleep"
            ? 15
            : scene === "Wake" || scene === "Bright"
            ? 90
            : 70,
      })),
    );
  }
  function toggleAll() {
    const next = !someOn;
    setEntities((prev) => prev.map((e) => ({ ...e, on: next })));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-4)",
        padding: "var(--sy-space-5) var(--sy-space-6)",
        maxWidth: "880px",
      }}
    >
      <nav style={{ fontSize: "0.8125rem", color: "var(--sy-color-fg-4)" }}>
        <a
          href="/_authed/rooms"
          style={{ color: "var(--sy-color-fg-3)", textDecoration: "none" }}
        >
          Rooms
        </a>
        <span style={{ margin: "0 var(--sy-space-1)" }}>›</span>
        <span style={{ color: "var(--sy-color-fg-2)" }}>{room.name}</span>
      </nav>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sy-space-3)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            borderRadius: "var(--sy-radius-lg)",
            background: "var(--sy-color-accent-soft)",
            color: "var(--sy-color-accent)",
          }}
        >
          <BulbIcon size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "1.75rem",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            {room.name}
          </h1>
          <p
            style={{
              margin: "var(--sy-space-1) 0 0",
              color: "var(--sy-color-fg-3)",
              fontSize: "0.9375rem",
            }}
          >
            {room.entityCount}
            {activeScene ? ` · scene: ${activeScene}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sy-space-1)",
            padding: "var(--sy-space-2) var(--sy-space-3)",
            borderRadius: "var(--sy-radius-pill)",
            border: "1px solid var(--sy-color-line)",
            background: allOn
              ? "var(--sy-color-accent)"
              : "var(--sy-color-surface-1)",
            color: allOn ? "var(--sy-color-bg)" : "var(--sy-color-fg-2)",
            fontSize: "0.8125rem",
            cursor: "pointer",
            boxShadow: "var(--sy-shadow)",
          }}
        >
          <PowerIcon size={14} />
          {allOn ? "Turn off" : "Turn on"}
        </button>
      </header>

      {room.scenes.length > 0 && (
        <section
          style={{
            background: "var(--sy-color-surface-1)",
            borderRadius: "var(--sy-radius-lg)",
            boxShadow: "var(--sy-shadow)",
            padding: "var(--sy-space-3) var(--sy-space-4)",
          }}
        >
          <h2
            style={{
              margin: "0 0 var(--sy-space-2)",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--sy-color-fg-4)",
              fontWeight: 600,
            }}
          >
            Scenes
          </h2>
          <div
            style={{
              display: "flex",
              gap: "var(--sy-space-2)",
              flexWrap: "wrap",
            }}
          >
            {room.scenes.concat(["Off"]).map((scene) => {
              const isActive = activeScene === scene;
              return (
                <button
                  key={scene}
                  type="button"
                  onClick={() => applyScene(scene)}
                  style={{
                    fontSize: "0.875rem",
                    padding: "var(--sy-space-2) var(--sy-space-3)",
                    borderRadius: "var(--sy-radius-pill)",
                    border: "1px solid var(--sy-color-line)",
                    background: isActive
                      ? "var(--sy-color-accent)"
                      : "var(--sy-color-surface-2)",
                    color: isActive ? "var(--sy-color-bg)" : "var(--sy-color-fg-2)",
                    cursor: "pointer",
                  }}
                >
                  {scene}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section
        style={{
          background: "var(--sy-color-surface-1)",
          borderRadius: "var(--sy-radius-lg)",
          boxShadow: "var(--sy-shadow)",
        }}
      >
        <h2
          style={{
            margin: 0,
            padding: "var(--sy-space-3) var(--sy-space-4) var(--sy-space-2)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sy-color-fg-4)",
            fontWeight: 600,
          }}
        >
          Lights
        </h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {entities.map((e, i) => (
            <li
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 140px auto",
                gap: "var(--sy-space-3)",
                alignItems: "center",
                padding: "var(--sy-space-3) var(--sy-space-4)",
                borderTop:
                  i === 0 ? "none" : "1px solid var(--sy-color-line-soft)",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "var(--sy-radius-sm)",
                  background: e.on
                    ? "var(--sy-color-accent-soft)"
                    : "var(--sy-color-surface-2)",
                  color: e.on
                    ? "var(--sy-color-accent)"
                    : "var(--sy-color-fg-4)",
                }}
              >
                <BulbIcon size={14} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "0.9375rem",
                    color: "var(--sy-color-fg)",
                  }}
                >
                  {e.name}
                </div>
                <div
                  style={{
                    fontFamily: "var(--sy-font-numeric)",
                    fontSize: "0.75rem",
                    color: "var(--sy-color-fg-4)",
                  }}
                >
                  {e.id}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={e.brightness}
                disabled={!e.on}
                onChange={(ev) =>
                  setBrightness(e.id, parseInt(ev.target.value, 10))
                }
                aria-label={`Brightness for ${e.name}`}
                style={{
                  width: "100%",
                  accentColor: "var(--sy-color-accent)",
                }}
              />
              <button
                type="button"
                onClick={() => toggle(e.id)}
                aria-pressed={e.on}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--sy-space-1)",
                  padding: "var(--sy-space-1) var(--sy-space-2)",
                  borderRadius: "var(--sy-radius-pill)",
                  border: "1px solid var(--sy-color-line)",
                  background: e.on
                    ? "var(--sy-color-accent)"
                    : "var(--sy-color-surface-2)",
                  color: e.on
                    ? "var(--sy-color-bg)"
                    : "var(--sy-color-fg-3)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  minWidth: "64px",
                  justifyContent: "center",
                }}
              >
                {e.on ? `${e.brightness}%` : "Off"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--sy-color-fg-4)",
          margin: 0,
        }}
      >
        Showing local UI state. Pkl-backed entity wiring lands once{" "}
        <code>RoomService</code> ships;{" "}
        <a
          href="/_authed/settings/pkl-config"
          style={{ color: "var(--sy-color-accent)", textDecoration: "none" }}
        >
          configure rooms in Pkl
        </a>
        <ChevronRightIcon
          size={10}
          style={{ verticalAlign: "middle", marginLeft: "2px" }}
        />
      </p>
    </div>
  );
}
