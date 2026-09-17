import { describe, expect, it } from "vitest";
import {
  describeSunPhase,
  formatClock,
  formatRelative,
} from "@/lib/sun-format";

const now = new Date("2026-09-17T18:00:00Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

describe("formatRelative", () => {
  it("formats minutes, hours and the past", () => {
    expect(formatRelative(at(42), now)).toBe("in 42 min");
    expect(formatRelative(at(185), now)).toBe("in 3 h 05 min");
    expect(formatRelative(at(-12), now)).toBe("12 min ago");
    expect(formatRelative(at(0), now)).toBe("now");
  });
});

describe("formatClock", () => {
  it("renders in the camera's timezone", () => {
    expect(formatClock(now, "America/Edmonton")).toBe("12:00");
    expect(formatClock(now, "Asia/Tokyo")).toBe("03:00");
  });
  it("survives a bad timezone", () => {
    expect(formatClock(now, "Not/AZone")).toBe("--:--");
  });
});

describe("describeSunPhase", () => {
  const tz = "UTC";
  it("is golden hour within ±30 min of the closest event, either side", () => {
    expect(describeSunPhase({ type: "sunset", timeISO: at(20) }, null, now, tz).tone).toBe("golden");
    expect(describeSunPhase({ type: "sunrise", timeISO: at(-25) }, null, now, tz)).toMatchObject({
      tone: "golden",
      title: "Golden hour",
    });
  });
  it("is blue hour after sunset and before sunrise, not the other way round", () => {
    // 50 min after sunset: blue.
    expect(describeSunPhase({ type: "sunset", timeISO: at(-50) }, null, now, tz).tone).toBe("blue");
    // 50 min before sunrise: blue.
    expect(describeSunPhase({ type: "sunrise", timeISO: at(50) }, null, now, tz).tone).toBe("blue");
    // 50 min before sunset: plain daylight.
    expect(describeSunPhase({ type: "sunset", timeISO: at(50) }, null, now, tz).tone).toBe("neutral");
  });
  it("points at the next upcoming event outside any window", () => {
    const phase = describeSunPhase(
      { type: "sunset", timeISO: at(-200) },
      { type: "sunrise", timeISO: at(600) },
      now,
      tz
    );
    expect(phase.title).toBe("Sunrise in 10 h 00 min");
    expect(phase.event?.type).toBe("sunrise");
  });
  it("uses the following event to recognise a golden hour that just passed", () => {
    // next event (tomorrow's sunrise) is far, but sunset was 10 min ago.
    const phase = describeSunPhase(
      { type: "sunrise", timeISO: at(700) },
      { type: "sunset", timeISO: at(-10) },
      now,
      tz
    );
    expect(phase.tone).toBe("golden");
  });
  it("copes with no data", () => {
    expect(describeSunPhase(null, undefined, now, tz).tone).toBe("neutral");
  });
});
