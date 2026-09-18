import { describe, expect, it } from "vitest";
import { goldenNow, headlineFor, upcoming, type ScheduledCamera } from "@/lib/sun-schedule";
import { describeSunPhase } from "@/lib/sun-format";

const now = new Date("2026-09-19T18:00:00Z");
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
const cam = (id: string, sunrise: number, sunset: number, score = 50): ScheduledCamera => ({
  id, name: id, city: null, country: null,
  meta: { score, timezone: "UTC", sunrise: at(sunrise), sunset: at(sunset), nextEvent: null, followingEvent: null },
});

describe("goldenNow", () => {
  it("lists cameras inside a golden or blue window, best first", () => {
    const cams = [cam("noon", -360, 360, 90), cam("sunset-soon", -700, 12, 40), cam("just-set", -720, -20, 60), cam("blue", -740, -50, 70)];
    expect(goldenNow(cams, now).map((c) => c.id)).toEqual(["blue", "just-set", "sunset-soon"]);
  });
});

describe("upcoming", () => {
  it("orders by soonest event and includes windows still under way", () => {
    const cams = [cam("a", -600, 90), cam("b", -700, 5), cam("c", -720, -20), cam("d", -800, -120)];
    const u = upcoming(cams, now, "sunset");
    expect(u.map((x) => x.camera.id)).toEqual(["c", "b", "a"]);
    expect(u[0].inMs).toBeLessThan(0);
  });
});

describe("headlineFor", () => {
  it("phrases the moment", () => {
    const golden = describeSunPhase({ type: "sunset", timeISO: at(12) }, null, now, "UTC");
    expect(headlineFor(golden, now)).toBe("Sunset in 12 min");
    const blue = describeSunPhase({ type: "sunset", timeISO: at(-50) }, null, now, "UTC");
    expect(headlineFor(blue, now)).toBe("Blue hour");
    const day = describeSunPhase({ type: "sunset", timeISO: at(200) }, null, now, "UTC");
    expect(headlineFor(day, now)).toBe("Sunset in 3 h 20 min");
  });
});
