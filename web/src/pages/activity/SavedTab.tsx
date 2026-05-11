import { useState } from "react";
import type { SavedQuery } from "../../gen/activity/v1/activity_pb";
import styles from "./SavedTab.module.css";

export interface SavedTabProps {
  queries: SavedQuery[];
  currentFilter?: string;
  onSaveQuery: (name: string, filter: string, cron: string) => void;
  onDeleteQuery: (id: string) => void;
  onRunQuery: (query: SavedQuery) => void;
}

/** Validates a 5-field cron expression. Returns null if valid, error message if not. */
function validateCron(expr: string): string | null {
  if (!expr) return null; // optional
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return "Cron expression must have exactly 5 fields (e.g. */5 * * * *)";
  }
  return null;
}

/** Formats a possibly-null ISO timestamp. */
function formatTs(isoTs: string | null | undefined): string {
  if (!isoTs) return "—";
  try {
    return new Date(isoTs).toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * SavedTab — lists saved queries with run/delete affordances, and a
 * "Save current query" button that opens a save dialog.
 */
export function SavedTab({
  queries,
  currentFilter = "",
  onSaveQuery,
  onDeleteQuery,
  onRunQuery,
}: SavedTabProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("");
  const [cronError, setCronError] = useState<string | null>(null);

  const isAlreadySaved = queries.some((q) => q.filter === currentFilter);

  const handleOpenDialog = () => {
    setName("");
    setCron("");
    setCronError(null);
    setShowDialog(true);
  };

  const handleSave = () => {
    const cronErr = validateCron(cron);
    if (cronErr) {
      setCronError(cronErr);
      return;
    }
    if (!name.trim()) return;
    onSaveQuery(name.trim(), currentFilter, cron.trim());
    setShowDialog(false);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setCronError(null);
  };

  return (
    <div className={styles.container} data-testid="saved-tab">
      <div className={styles.header}>
        <h2 className={styles.heading}>Saved Queries</h2>
        <button
          className={styles.saveBtn}
          onClick={handleOpenDialog}
          disabled={!currentFilter || isAlreadySaved}
          data-testid="save-current-query-btn"
          aria-label="Save current query"
        >
          Save current query
        </button>
      </div>

      {queries.length === 0 ? (
        <div className={styles.empty}>
          No saved queries yet. Filter the All Events tab and save a query here.
        </div>
      ) : (
        <ul className={styles.queryList} role="list">
          {queries.map((query) => (
            <li key={query.id} className={styles.queryRow} data-testid="saved-query-row">
              <div className={styles.queryMain}>
                <span className={styles.queryName}>{query.name}</span>
                <code className={styles.queryFilter}>{query.filter}</code>
                <div className={styles.queryMeta}>
                  <span>Last run: {formatTs(query.lastRun)}</span>
                  {query.cron && <span>Next run: {formatTs(query.nextRun)}</span>}
                </div>
              </div>
              <div className={styles.queryActions}>
                <button
                  className={styles.runBtn}
                  onClick={() => onRunQuery(query)}
                  aria-label={`Run "${query.name}"`}
                >
                  Run now
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => onDeleteQuery(query.id)}
                  aria-label={`Delete "${query.name}"`}
                  data-testid={`delete-btn-${query.id}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Save dialog */}
      {showDialog && (
        <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" aria-label="Save query">
          <div className={styles.dialog} data-testid="save-dialog">
            <h3 className={styles.dialogTitle}>Save Query</h3>

            <label className={styles.label}>
              Name <span className={styles.required}>*</span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Failed commands last hour"
                data-testid="query-name-input"
                autoFocus
              />
            </label>

            <label className={styles.label}>
              Cron schedule <span className={styles.optional}>(optional)</span>
              <input
                className={styles.input}
                value={cron}
                onChange={(e) => {
                  setCron(e.target.value);
                  setCronError(null);
                }}
                placeholder="*/5 * * * *"
                data-testid="query-cron-input"
              />
              {cronError && (
                <span className={styles.cronError} role="alert" data-testid="cron-error">
                  {cronError}
                </span>
              )}
            </label>

            <div className={styles.dialogFooter}>
              <button
                className={styles.cancelBtn}
                onClick={handleCancel}
                data-testid="cancel-btn"
              >
                Cancel
              </button>
              <button
                className={styles.confirmBtn}
                onClick={handleSave}
                disabled={!name.trim()}
                data-testid="confirm-save-btn"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
