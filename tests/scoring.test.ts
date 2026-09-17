import { describe, expect, it } from "vitest";
import { scoreCameraWeather, type OpenMeteoResponse } from "@/lib/client-ranking-v2";

// A clear-sky day in Calgary (UTC-6). Sunset 19:45 local = 01:45Z next day.
function weather(overrides: Partial<NonNullable<OpenMeteoResponse["hourly"]>> = {}): OpenMeteoResponse {
  const hours = Array.from({ length: 48 }, (_, i) => {
    const d = new Date("2026-09-17T00:00:00-06:00");
    d.setHours(d.getHours() + i);
    return d.toISOString().slice(0, 16);
  });
  const fill = (v: number) => hours.map(() => v);
  return {
    latitude: 51.05,
    longitude: -114.07,
    timezone: "America/Edmonton",
    utc_offset_seconds: -21600,
    hourly: {
      time: hours,
      weathercode: fill(0),
      cloudcover: fill(5),
      relativehumidity_2m: fill(40),
      visibility: fill(40000),
      precipitation: fill(0),
      snowfall: fill(0),
      ...overrides,
    },
    daily: {
      time: ["2026-09-17", "2026-09-18"],
      sunrise: ["2026-09-17T07:10", "2026-09-18T07:12"],
      sunset: ["2026-09-17T19:45", "2026-09-18T19:43"],
    },
  };
}

const opts = { timezone: "America/Edmonton" };
const localTime = (hhmm: string) => new Date(`2026-09-17T${hhmm}:00-06:00`);

describe("scoreCameraWeather (v2)", () => {
  it("scores golden hour far above midday and midnight", () => {
    const golden = scoreCameraWeather(weather(), localTime("19:35"), opts);
    const noon = scoreCameraWeather(weather(), localTime("12:00"), opts);
    const night = scoreCameraWeather(weather(), localTime("01:00"), opts);
    expect(golden.score).toBeGreaterThan(noon.score);
    expect(noon.score).toBeGreaterThan(night.score);
    expect(golden.isClear).toBe(true);
  });

  it("does not mistake the run-up to sunset for night (closest-sunrise bug)", () => {
    // From ~19:15 the nearest sunrise is tomorrow's; the daytime check used
    // to pair it with today's sunset and call 19:30 "night", knocking a
    // day-only camera from 94 to 9 right before the sunset it exists for.
    for (const t of ["19:30", "19:45", "20:00"]) {
      const r = scoreCameraWeather(weather(), localTime(t), opts);
      expect(r.label).toBe("sunset-primary");
      expect(r.isDaytime).toBe(true);
      expect(r.score).toBeGreaterThan(80);
    }
    expect(scoreCameraWeather(weather(), localTime("21:00"), opts).label).toBe("night");
  });

  it("reports the next solar event in the camera's zone, not UTC", () => {
    const { nextEvent } = scoreCameraWeather(weather(), localTime("19:35"), opts);
    expect(nextEvent?.type).toBe("sunset");
    // 19:45 MDT == 01:45Z the next day.
    expect(nextEvent?.time.toISOString()).toBe("2026-09-18T01:45:00.000Z");
  });

  it("penalises heavy cloud and rain during golden hour", () => {
    const clear = scoreCameraWeather(weather(), localTime("19:35"), opts);
    const rainy = scoreCameraWeather(
      weather({ weathercode: Array(48).fill(63), cloudcover: Array(48).fill(100), precipitation: Array(48).fill(3) }),
      localTime("19:35"),
      opts
    );
    expect(rainy.score).toBeLessThan(clear.score);
    expect(rainy.isClear).toBe(false);
  });

  it("returns a bounded, integer-like score", () => {
    for (const t of ["05:00", "07:05", "13:00", "19:45", "21:00"]) {
      const { score } = scoreCameraWeather(weather(), localTime(t), opts);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
