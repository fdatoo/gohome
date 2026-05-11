import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTodGradient, computePhase, PHASE_GRADIENTS, type Phase } from "./useTodGradient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSolarTable(sunriseHour: number, noonHour: number, sunsetHour: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sunrise = new Date(today);
  sunrise.setHours(sunriseHour, 0, 0, 0);

  const noon = new Date(today);
  noon.setHours(noonHour, 0, 0, 0);

  const sunset = new Date(today);
  sunset.setHours(sunsetHour, 0, 0, 0);

  return {
    today: {
      sunrise: sunrise.toISOString(),
      solarNoon: noon.toISOString(),
      sunset: sunset.toISOString(),
    },
    tomorrow: {
      sunrise: new Date(sunrise.getTime() + 86400000).toISOString(),
      solarNoon: new Date(noon.getTime() + 86400000).toISOString(),
      sunset: new Date(sunset.getTime() + 86400000).toISOString(),
    },
  };
}

// Times relative to a solar table with sunrise=7, noon=12, sunset=20
const table = makeSolarTable(7, 12, 20);
const sunriseMs = new Date(table.today.sunrise).getTime();
const noonMs    = new Date(table.today.solarNoon).getTime();
const sunsetMs  = new Date(table.today.sunset).getTime();

// ---------------------------------------------------------------------------
// computePhase unit tests
// ---------------------------------------------------------------------------

describe("computePhase", () => {
  const cases: [string, number, Phase][] = [
    ["3 hours before sunrise → pre-sunrise", sunriseMs - 3 * 60 * 60 * 1000, "pre-sunrise"],
    ["at sunrise → sunrise",                 sunriseMs,                        "sunrise"],
    ["30 min after sunrise → sunrise",       sunriseMs + 30 * 60 * 1000,       "sunrise"],
    ["2h after sunrise → sunrise (warm AM)", sunriseMs + 120 * 60 * 1000,      "sunrise"],
    ["at noon → midday",                     noonMs,                            "midday"],
    ["1h after noon → midday",               noonMs + 60 * 60 * 1000,          "midday"],
    ["at sunset → sunset",                   sunsetMs,                          "sunset"],
    ["30 min after sunset → night",          sunsetMs + 120 * 60 * 1000,        "night"],
    ["midnight → night",                     sunriseMs - 7 * 60 * 60 * 1000,   "pre-sunrise"],
  ];

  for (const [label, nowMs, expected] of cases) {
    it(label, () => {
      expect(computePhase(nowMs, table)).toBe(expected);
    });
  }

  it("returns night for invalid timestamps", () => {
    expect(computePhase(Date.now(), {
      today:    { sunrise: "invalid", solarNoon: "invalid", sunset: "invalid" },
      tomorrow: { sunrise: "", solarNoon: "", sunset: "" },
    })).toBe("night");
  });
});

// ---------------------------------------------------------------------------
// useTodGradient hook tests
// ---------------------------------------------------------------------------

describe("useTodGradient hook", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns night gradient while solar table is loading", () => {
    fetchSpy.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useTodGradient());
    expect(result.current).toBe(PHASE_GRADIENTS.night);
  });

  it("returns night gradient when SolarService call fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useTodGradient());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(PHASE_GRADIENTS.night);
  });

  it("returns midday gradient when time is at solar noon", async () => {
    // Mock Date.now() to return solar noon
    const noonDateMs = noonMs;
    vi.setSystemTime(new Date(noonDateMs));

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        today: {
          sunrise: table.today.sunrise,
          solarNoon: table.today.solarNoon,
          sunset: table.today.sunset,
        },
        tomorrow: table.tomorrow,
      }),
    } as Response);

    const { result } = renderHook(() => useTodGradient());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(PHASE_GRADIENTS.midday);
  });

  it("returns sunset gradient when time is at sunset", async () => {
    vi.setSystemTime(new Date(sunsetMs));

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        today: {
          sunrise: table.today.sunrise,
          solarNoon: table.today.solarNoon,
          sunset: table.today.sunset,
        },
        tomorrow: table.tomorrow,
      }),
    } as Response);

    const { result } = renderHook(() => useTodGradient());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(PHASE_GRADIENTS.sunset);
  });

  it("cleans up interval on unmount", async () => {
    fetchSpy.mockResolvedValue({ ok: false } as Response);
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = renderHook(() => useTodGradient());
    await act(async () => { await Promise.resolve(); });
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("refreshes after 5 minutes", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        today: {
          sunrise: table.today.sunrise,
          solarNoon: table.today.solarNoon,
          sunset: table.today.sunset,
        },
        tomorrow: table.tomorrow,
      }),
    } as Response);

    renderHook(() => useTodGradient());
    await act(async () => { await Promise.resolve(); });
    const callCount = fetchSpy.mock.calls.length;

    // Advance 5 minutes
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
    });
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callCount);
  });
});
