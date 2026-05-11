/**
 * SceneButton.tsx — accent-filled scene activation button tile.
 * Calls SceneService.Activate on click.
 */

import { registerTile } from "../../registry";
import type { TileProps } from "../../registry";

async function activateScene(sceneId: string): Promise<void> {
  await fetch("/switchyard.v1alpha1.SceneService/Apply", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify({ scene_id: sceneId }),
  });
}

function SceneButton({ def }: TileProps) {
  const sceneId = def.props.sceneId as string;
  const label = (def.props.label as string) ?? "Activate Scene";

  return (
    <div
      style={{
        background: "var(--sy-color-accent)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100px",
        cursor: "pointer",
      }}
    >
      <button
        onClick={() => activateScene(sceneId)}
        style={{
          background: "none",
          border: "none",
          color: "var(--sy-color-bg)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          textAlign: "center",
        }}
      >
        {label}
      </button>
    </div>
  );
}

registerTile("SceneButton", SceneButton);

export { SceneButton };
