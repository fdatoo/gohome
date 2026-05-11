import type { SettingsBadges } from "./SettingsNav";

/**
 * useSettingsBadges — returns per-section alert badge counts for the SettingsNav rail.
 *
 * STUB: returns empty badges until Plan 03 ships ActivityService.
 *
 * TODO(plan-3): wire to ActivityService.Stories interestingness counts.
 * When Plan 03 is available, replace this stub with the real stream:
 *
 *   import { activityClient } from "@/data/activity-client";
 *   const [badges, setBadges] = useState<SettingsBadges>({});
 *   useEffect(() => {
 *     const counts: Record<string, number> = {};
 *     const stream = activityClient.stories({ filter: { interestingOnly: true } });
 *     (async () => {
 *       for await (const story of stream) {
 *         // category → section mapping:
 *         //   "failure" | "performance" | "anomaly"  → "drivers"
 *         //   "security" | "configuration"            → "account"
 *         //   "novelty"                               → "widget-packs"
 *         const section = categoryToSection(story.category);
 *         if (section) counts[section] = (counts[section] ?? 0) + 1;
 *       }
 *       setBadges(counts as SettingsBadges);
 *     })();
 *   }, []);
 *   return badges;
 */
export function useSettingsBadges(): SettingsBadges {
  return {};
}
