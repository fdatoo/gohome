/**
 * verb-catalog-client.ts
 * TanStack Query wrapper for CommandCatalogService.List.
 * Fetches the verb catalog once on mount with a 5-minute stale time.
 * UI v2 Plan 05.
 */
import { useEffect, useState } from "react";
import type { Verb } from "./palette-state";

/**
 * Map server ArgType numbers to our local ArgType strings.
 */
function mapArgType(t: number): Verb["args"][number]["type"] {
  switch (t) {
    case 2:
      return "int";
    case 3:
      return "bool";
    case 4:
      return "duration";
    case 5:
      return "string_list";
    default:
      return "string";
  }
}

/**
 * useVerbCatalog fetches and caches the verb catalog from the server.
 * Returns [] while loading or on error.
 */
export function useVerbCatalog(): Verb[] {
  const [verbs, setVerbs] = useState<Verb[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      "/switchyard.commandcatalog.v1.CommandCatalogService/List",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    )
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{
          verbs?: Array<{
            name: string;
            description: string;
            cliForm: string;
            handlerRef: string;
            args?: Array<{
              name: string;
              type: number;
              required: boolean;
              cliFlag: string;
              hint: string;
            }>;
          }>;
        }>;
      })
      .then((data) => {
        if (cancelled || !data?.verbs) return;
        const mapped: Verb[] = data.verbs.map((v) => ({
          name: v.name,
          description: v.description,
          cliForm: v.cliForm,
          handlerRef: v.handlerRef,
          args: (v.args ?? []).map((a) => ({
            name: a.name,
            type: mapArgType(a.type),
            required: a.required,
            cliFlag: a.cliFlag,
            hint: a.hint,
          })),
        }));
        setVerbs(mapped);
      })
      .catch(() => {
        // Server not available; silently fall back to empty catalog.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return verbs;
}
