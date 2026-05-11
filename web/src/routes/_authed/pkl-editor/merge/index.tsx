// TODO(plan-12): real Monaco merge view
// This is a placeholder route for the 3-way Pkl merge surface.
// Navigation contract: /_authed/pkl-editor/merge/<file_path>?session=<id>
// Receives ancestorPkl, diskPkl, stagedPkl as route state.

import { PlaceholderPage } from "@/shell/PlaceholderPage";

interface Props {
  filePath?: string;
  sessionId?: string;
}

export function PklEditorMergePage({ filePath = "unknown", sessionId }: Props) {
  return (
    <PlaceholderPage
      title={`3-way Merge: ${filePath}${sessionId ? ` (session: ${sessionId})` : ""}`}
      plan="Plan 12"
    />
  );
}
