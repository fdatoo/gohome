/**
 * EntityToggle.tsx — entity name + toggle switch tile.
 * Calls EntityService.SetState on change.
 */

import { useState } from "react";
import { registerTile } from "../../registry";
import type { TileProps } from "../../registry";

// Lightweight Connect-style SetState caller
async function setState(entityId: string, on: boolean): Promise<void> {
  await fetch("/switchyard.v1alpha1.EntityService/SetState", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify({ entity_id: entityId, state: on ? "on" : "off" }),
  });
}

function EntityToggle({ def }: TileProps) {
  const entityId = def.props.entityId as string;
  const label = (def.props.label as string) ?? entityId;
  const [on, setOn] = useState(false);

  async function handleToggle() {
    const next = !on;
    setOn(next);
    try {
      await setState(entityId, next);
    } catch {
      setOn(!next); // revert on error
    }
  }

  const toggleId = `toggle-${def.id}`;

  return (
    <div
      style={{
        background: "var(--sy-color-surface-2)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-2)",
        minHeight: "100px",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontSize: "0.875rem",
          color: "var(--sy-color-fg)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <label
        htmlFor={toggleId}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sy-space-2)",
          cursor: "pointer",
        }}
      >
        <input
          id={toggleId}
          type="checkbox"
          role="switch"
          aria-label={`Toggle ${label}`}
          checked={on}
          onChange={handleToggle}
          data-entity-id={entityId}
          style={{ cursor: "pointer", accentColor: "var(--sy-color-accent)" }}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--sy-color-fg-3)" }}>
          {on ? "On" : "Off"}
        </span>
      </label>
    </div>
  );
}

registerTile("EntityToggle", EntityToggle);

export { EntityToggle };
