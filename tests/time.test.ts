import { describe, expect, it } from "vitest";
import { parseDateInTimezone, timezoneOffsetMs } from "@/lib/time";

// These must hold whatever TZ the test runner has; the old implementation
// only passed on a UTC machine.
describe("parseDateInTimezone", () => {
  it("reads offset-less strings as wall-clock time in the given zone", () => {
    expect(parseDateInTimezone("2026-09-17T19:45", "America/Edmonton")?.toISOString()).toBe("2026-09-18T01:45:00.000Z");
    expect(parseDateInTimezone("2026-09-17T06:10", "Asia/Tokyo")?.toISOString()).toBe("2026-09-16T21:10:00.000Z");
    expect(parseDateInTimezone("2026-01-15T08:00", "Europe/London")?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(parseDateInTimezone("2026-07-15T08:00", "Europe/London")?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("handles midnight in a UTC+0 zone (the h24 quirk)", () => {
    expect(parseDateInTimezone("2026-01-15T00:00", "Europe/London")?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(parseDateInTimezone("2026-01-15T00:30", "Atlantic/Reykjavik")?.toISOString()).toBe("2026-01-15T00:30:00.000Z");
  });

  it("keeps explicit offsets and Z as they are", () => {
    expect(parseDateInTimezone("2026-09-17T19:45:00Z", "Asia/Tokyo")?.toISOString()).toBe("2026-09-17T19:45:00.000Z");
    expect(parseDateInTimezone("2026-09-17T19:45:00+02:00", "Asia/Tokyo")?.toISOString()).toBe("2026-09-17T17:45:00.000Z");
  });

  it("treats no zone as UTC and rejects junk", () => {
    expect(parseDateInTimezone("2026-09-17T19:45")?.toISOString()).toBe("2026-09-17T19:45:00.000Z");
    expect(parseDateInTimezone("2026-09-17", "UTC")?.toISOString()).toBe("2026-09-17T00:00:00.000Z");
    expect(parseDateInTimezone("yesterday", "UTC")).toBeNull();
    expect(parseDateInTimezone(null, "UTC")).toBeNull();
  });

  it("lands on the right side of a DST change", () => {
    // Europe/Berlin leaves DST at 03:00 on 2026-10-25 (clocks back to 02:00).
    expect(parseDateInTimezone("2026-10-25T01:30", "Europe/Berlin")?.toISOString()).toBe("2026-10-24T23:30:00.000Z");
    expect(parseDateInTimezone("2026-10-25T04:00", "Europe/Berlin")?.toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });
});

describe("timezoneOffsetMs", () => {
  it("returns signed offsets", () => {
    const t = new Date("2026-09-17T12:00:00Z");
    expect(timezoneOffsetMs(t, "Asia/Tokyo")).toBe(9 * 3600_000);
    expect(timezoneOffsetMs(t, "America/Edmonton")).toBe(-6 * 3600_000);
    expect(timezoneOffsetMs(t, "UTC")).toBe(0);
  });
});
