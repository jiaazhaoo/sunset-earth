import { describe, expect, it } from "vitest";
import { sunsetSkyIndex } from "@/lib/sky";

describe("sunsetSkyIndex", () => {
  it("rates scattered high cloud above a clear sky", () => {
    const clear = sunsetSkyIndex({ cloudLow: 0, cloudMid: 0, cloudHigh: 0 });
    const high = sunsetSkyIndex({ cloudLow: 5, cloudMid: 10, cloudHigh: 45 });
    expect(high.index).toBeGreaterThan(clear.index);
    expect(high.title).toBe("High cloud");
    expect(clear.title).toBe("Clear");
    expect(clear.index).toBeGreaterThan(0.5);
  });

  it("treats low cloud as a lid", () => {
    const lid = sunsetSkyIndex({ cloudLow: 90, cloudMid: 0, cloudHigh: 0 });
    expect(lid.index).toBeLessThan(0.2);
    expect(lid.title).toBe("Low cloud");
  });

  it("dims an overcast upper sky without killing it", () => {
    const overcast = sunsetSkyIndex({ cloudLow: 10, cloudMid: 40, cloudHigh: 95 });
    expect(overcast.title).toBe("Overcast above");
    expect(overcast.index).toBeGreaterThan(0.3);
    expect(overcast.index).toBeLessThan(0.75);
  });

  it("penalises rain, haze and poor visibility", () => {
    const base = { cloudLow: 5, cloudMid: 10, cloudHigh: 45 };
    const rain = sunsetSkyIndex({ ...base, precipitation: 1.2 });
    const haze = sunsetSkyIndex({ ...base, visibility: 3_000 });
    const humid = sunsetSkyIndex({ ...base, humidity: 98 });
    const ideal = sunsetSkyIndex(base);
    expect(rain.title).toBe("Rain");
    expect(rain.index).toBeLessThan(ideal.index * 0.5);
    expect(haze.title).toBe("Hazy");
    expect(haze.index).toBeLessThan(ideal.index);
    expect(humid.index).toBeLessThan(ideal.index);
  });

  it("falls back to total cloud when layers are missing", () => {
    const fromTotal = sunsetSkyIndex({ cloudTotal: 40 });
    expect(fromTotal.index).toBeGreaterThan(0.4);
    expect(fromTotal.index).toBeLessThanOrEqual(1);
    const none = sunsetSkyIndex({});
    expect(none.title).toBe("Clear");
  });
});
