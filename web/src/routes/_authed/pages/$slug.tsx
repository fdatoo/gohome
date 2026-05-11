/**
 * PageSlug — renders a custom page from PageService.Get.
 * Supports render mode and edit mode (EditChrome wrapping).
 */

import { useState, useEffect } from "react";
import { Page } from "@/pages-system/render/Page";
import { EditChrome } from "@/pages-system/edit/EditChrome";
import { usePageEditor } from "@/pages-system/edit/use-page-editor";
import { pageClient, ConnectHTTPError } from "@/data/page-client";
import type { PageModel } from "@/pages-system/model";
import { EmptyState } from "@/components/EmptyState";

// Import all section/tile/cell widgets so they register themselves
import "@/pages-system/widgets/sections/Hero";
import "@/pages-system/widgets/sections/Chart";
import "@/pages-system/widgets/sections/EntityList";
import "@/pages-system/widgets/sections/ActivityFeed";
import "@/pages-system/widgets/sections/RoomGrid";
import "@/pages-system/widgets/sections/Markdown";
import "@/pages-system/widgets/sections/CameraGrid";
import "@/pages-system/widgets/sections/StatGrid";
import "@/pages-system/widgets/sections/WebhookButton";
import "@/pages-system/widgets/tiles/RoomTile";
import "@/pages-system/widgets/tiles/StatTile";
import "@/pages-system/widgets/tiles/EntityToggle";
import "@/pages-system/widgets/tiles/SceneButton";
import "@/pages-system/widgets/cells/EntityRow";
import "@/pages-system/widgets/cells/EventRow";

type PageLoadStatus = "loading" | "ready" | "error-auth" | "error-not-found" | "error-server";

interface Props {
  slug?: string;
}

export function PageSlug({ slug = "unknown" }: Props) {
  const [pageModel, setPageModel] = useState<PageModel | null>(null);
  const [loadStatus, setLoadStatus] = useState<PageLoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const { setSections, sections, resetDirty } = usePageEditor((s) => ({
    setSections: s.setSections,
    sections: s.sections,
    resetDirty: s.resetDirty,
  }));

  useEffect(() => {
    setLoadStatus("loading");
    setErrorMessage(null);
    pageClient
      .get(slug)
      .then((p) => {
        setPageModel(p);
        setSections(p.sections);
        setLoadStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof ConnectHTTPError) {
          if (err.status === 401) {
            setLoadStatus("error-auth");
          } else if (err.status === 404) {
            setLoadStatus("error-not-found");
          } else {
            setErrorMessage(err.message);
            setLoadStatus("error-server");
          }
        } else {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setLoadStatus("error-server");
        }
      });
  }, [slug, setSections]);

  async function handleSave() {
    if (!pageModel) return;
    try {
      await pageClient.saveLayout(slug, sections);
      resetDirty();
      setEditMode(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDiscard() {
    if (pageModel) setSections(pageModel.sections);
    resetDirty();
    setEditMode(false);
  }

  if (loadStatus === "loading") {
    return (
      <div style={{ padding: "var(--sy-space-8)" }}>
        <EmptyState variant="loading" label="page" />
      </div>
    );
  }

  if (loadStatus === "error-auth") {
    return (
      <div style={{ padding: "var(--sy-space-8)" }}>
        <EmptyState
          variant="error-auth"
          label="Authentication required"
          message="You must be signed in to view this page."
        />
      </div>
    );
  }

  if (loadStatus === "error-not-found") {
    return (
      <div style={{ padding: "var(--sy-space-8)" }}>
        <EmptyState
          variant="empty"
          label="Page not found"
          message={
            <>
              No page with slug <code style={{ fontFamily: "var(--sy-font-numeric)" }}>{slug}</code>{" "}
              exists. Check the slug or{" "}
              <a
                href="/pages"
                style={{ color: "var(--sy-color-accent)", textDecoration: "none" }}
              >
                browse pages
              </a>
              .
            </>
          }
        />
      </div>
    );
  }

  if (loadStatus === "error-server") {
    return (
      <div style={{ padding: "var(--sy-space-8)" }}>
        <EmptyState
          variant="error-server"
          label="Failed to load page"
          message={errorMessage ?? undefined}
          onRetry={() => {
            setLoadStatus("loading");
            setErrorMessage(null);
            pageClient
              .get(slug)
              .then((p) => {
                setPageModel(p);
                setSections(p.sections);
                setLoadStatus("ready");
              })
              .catch((err: unknown) => {
                if (err instanceof ConnectHTTPError) {
                  if (err.status === 401) {
                    setLoadStatus("error-auth");
                  } else if (err.status === 404) {
                    setLoadStatus("error-not-found");
                  } else {
                    setErrorMessage(err.message);
                    setLoadStatus("error-server");
                  }
                } else {
                  setErrorMessage(err instanceof Error ? err.message : String(err));
                  setLoadStatus("error-server");
                }
              });
          }}
        />
      </div>
    );
  }

  if (!pageModel) return null;

  const pageContent = (
    <div style={{ padding: "var(--sy-space-4)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--sy-space-4)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--sy-color-fg)",
          }}
        >
          {pageModel.title}
        </h1>
        {pageModel.writable && !editMode && (
          <button
            onClick={() => setEditMode(true)}
            style={{
              background: "none",
              border: "1px solid var(--sy-color-line)",
              borderRadius: "var(--sy-radius)",
              color: "var(--sy-color-fg-2)",
              padding: "var(--sy-space-1) var(--sy-space-3)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Edit page
          </button>
        )}
      </div>
      <Page page={{ ...pageModel, sections }} editMode={editMode} />
    </div>
  );

  if (editMode) {
    return (
      <EditChrome onSave={() => void handleSave()} onDiscard={handleDiscard}>
        {pageContent}
      </EditChrome>
    );
  }

  return pageContent;
}
