/**
 * useTodGradient — computes the --sy-gradient-tod CSS value from the local solar
 * position. Calls SolarService.GetTable() to get today's sunrise/sunset/solar-noon
 * times, then maps the current time to one of five named phases:
 *
 *   pre-sunrise → sunrise → midday → sunset → night
 *
 * The gradient string refreshes every 5 minutes via setInterval.
 * Falls back to the night gradient on RPC failure.
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Solar client
// ---------------------------------------------------------------------------

interface SolarDay {
  sunrise: string; // ISO-8601 timestamp
  solarNoon: string;
  sunset: string;
}

interface SolarTable {
  today: SolarDay;
  tomorrow: SolarDay;
}

async function getSolarTable(bearerToken?: string): Promise<SolarTable | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    };
    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    }
    const res = await fetch("/switchyard.solar.v1.SolarService/GetTable", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    // Connect JSON response uses camelCase field names
    const data = await res.json() as {
      today?: { sunrise?: string; solarNoon?: string; sunset?: string };
      tomorrow?: { sunrise?: string; solarNoon?: string; sunset?: string };
    };
    if (!data.today) return null;
    return {
      today: {
        sunrise: data.today.sunrise ?? "",
        solarNoon: data.today.solarNoon ?? "",
        sunset: data.today.sunset ?? "",
      },
      tomorrow: {
        sunrise: data.tomorrow?.sunrise ?? "",
        solarNoon: data.tomorrow?.solarNoon ?? "",
        sunset: data.tomorrow?.sunset ?? "",
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase → gradient mapping
// ---------------------------------------------------------------------------

// CSS gradient for each phase (matching the CSS custom properties in ambient.css)
export const PHASE_GRADIENTS = {
  "pre-sunrise": "radial-gradient(ellipse at 60% 40%, #0d1b2a 0%, #0a0e1a 100%)",
  sunrise:       "radial-gradient(ellipse at 60% 40%, #7c3a2a 0%, #2c1a3a 100%)",
  midday:        "radial-gradient(ellipse at 60% 40%, #1a2a4a 0%, #2a1a3a 100%)",
  sunset:        "radial-gradient(ellipse at 60% 40%, #c25a2a 0%, #3a1a4a 100%)",
  night:         "radial-gradient(ellipse at 60% 40%, #0f0a1a 0%, #0a0a14 100%)",
} as const;

export type Phase = keyof typeof PHASE_GRADIENTS;

// Transition window: ±90 minutes around a solar event.
const TRANSITION_WINDOW_MS = 90 * 60 * 1000;

/**
 * Given a timestamp in ms and the solar table, return the current phase name.
 */
export function computePhase(nowMs: number, table: SolarTable): Phase {
  const sunrise = new Date(table.today.sunrise).getTime();
  const noon = new Date(table.today.solarNoon).getTime();
  const sunset = new Date(table.today.sunset).getTime();

  if (isNaN(sunrise) || isNaN(noon) || isNaN(sunset)) {
    return "night";
  }

  const sunriseStart = sunrise - TRANSITION_WINDOW_MS;
  const sunriseEnd   = sunrise + TRANSITION_WINDOW_MS;
  const middayStart  = noon    - TRANSITION_WINDOW_MS;
  const middayEnd    = noon    + TRANSITION_WINDOW_MS;
  const sunsetStart  = sunset  - TRANSITION_WINDOW_MS;
  const sunsetEnd    = sunset  + TRANSITION_WINDOW_MS;

  if (nowMs < sunriseStart)           return "pre-sunrise";
  if (nowMs < sunriseEnd)             return "sunrise";
  if (nowMs < middayStart)            return "sunrise";   // late-morning → still warm
  if (nowMs < middayEnd)              return "midday";
  if (nowMs < sunsetStart)            return "midday";    // early-afternoon → still midday
  if (nowMs < sunsetEnd)              return "sunset";
  return "night";
}

/**
 * useTodGradient — returns a CSS gradient string for the current time of day.
 *
 * @param bearerToken  Optional per-display token for the SolarService call.
 */
export function useTodGradient(bearerToken?: string): string {
  const [gradient, setGradient] = useState<string>(PHASE_GRADIENTS.night);

  useEffect(() => {
    let active = true;

    async function update() {
      const table = await getSolarTable(bearerToken);
      if (!active) return;
      if (!table) {
        setGradient(PHASE_GRADIENTS.night);
        return;
      }
      const phase = computePhase(Date.now(), table);
      setGradient(PHASE_GRADIENTS[phase]);
    }

    void update();
    const id = setInterval(() => void update(), 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [bearerToken]);

  return gradient;
}
