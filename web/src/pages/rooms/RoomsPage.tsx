import { useHomeRooms } from "@/pages/home/hooks/useHomeRooms";
import { BulbIcon, ChevronRightIcon, PlusIcon } from "@/shell/icons";

/**
 * Rooms page — full grid of every room with quick scene access.
 *
 * For now, room data is sourced from the same hook the Home page uses; once a
 * RoomService lands the hook switches over without UI changes.
 */
export function RoomsPage() {
  const rooms = useHomeRooms();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-4)",
        padding: "var(--sy-space-5) var(--sy-space-6)",
        maxWidth: "1280px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--sy-space-3)",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.75rem",
              fontWeight: 600,
              color: "var(--sy-color-fg)",
              letterSpacing: "-0.02em",
            }}
          >
            Rooms
          </h1>
          <p
            style={{
              margin: "var(--sy-space-1) 0 0",
              color: "var(--sy-color-fg-3)",
              fontSize: "0.9375rem",
            }}
          >
            {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
          </p>
        </div>
        <button
          type="button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sy-space-1)",
            padding: "var(--sy-space-2) var(--sy-space-3)",
            borderRadius: "var(--sy-radius-pill)",
            border: "1px solid var(--sy-color-line)",
            background: "var(--sy-color-surface-1)",
            color: "var(--sy-color-fg-2)",
            fontSize: "0.8125rem",
            cursor: "pointer",
            boxShadow: "var(--sy-shadow)",
          }}
          aria-label="Add room (configure in Pkl)"
          title="Rooms are configured in Pkl via switchyard:entities — open Settings › Pkl config"
        >
          <PlusIcon size={14} /> Add a room
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--sy-space-3)",
        }}
      >
        {rooms.map((room) => (
          <a
            key={room.id}
            href={`/_authed/rooms/${room.id}`}
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(`/_authed/rooms/${room.id}`);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sy-space-3)",
              padding: "var(--sy-space-3) var(--sy-space-3)",
              background: "var(--sy-color-surface-1)",
              borderRadius: "var(--sy-radius-lg)",
              boxShadow: "var(--sy-shadow)",
              textDecoration: "none",
              color: "var(--sy-color-fg)",
              border: "1px solid transparent",
              cursor: "pointer",
              transition:
                "border-color var(--sy-motion-fast), transform var(--sy-motion-fast)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "var(--sy-color-line)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "transparent")
            }
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sy-space-2)",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--sy-radius)",
                  background: "var(--sy-color-accent-soft)",
                  color: "var(--sy-color-accent)",
                }}
              >
                <BulbIcon size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {room.name}
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--sy-color-fg-3)",
                    marginTop: "2px",
                  }}
                >
                  {room.entityCount}
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--sy-color-fg-3)",
                  background: "var(--sy-color-surface-2)",
                  border: "1px solid var(--sy-color-line)",
                  padding: "2px 8px",
                  borderRadius: "var(--sy-radius-pill)",
                  textTransform: "lowercase",
                }}
              >
                {room.statePill}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: "var(--sy-space-1)",
                flexWrap: "wrap",
              }}
            >
              {room.scenes.map((scene) => (
                <span
                  key={scene}
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--sy-color-fg-2)",
                    background: "var(--sy-color-surface-2)",
                    border: "1px solid var(--sy-color-line)",
                    padding: "3px 8px",
                    borderRadius: "var(--sy-radius-pill)",
                  }}
                >
                  {scene}
                </span>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "var(--sy-color-fg-4)",
                fontSize: "0.75rem",
                marginTop: "var(--sy-space-1)",
              }}
            >
              <span>Open room</span>
              <ChevronRightIcon size={14} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
