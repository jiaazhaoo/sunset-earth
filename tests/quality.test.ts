import { describe, expect, it } from "vitest";
import {
  appealFactor,
  applyQuality,
  curationFactor,
  phaseOf,
  qualityMultiplier,
  resolutionFactor,
  visualFactor,
} from "@/lib/quality";

describe("phaseOf", () => {
  it("buckets ranking labels", () => {
    expect(phaseOf("sunset-primary")).toBe("golden");
    expect(phaseOf("sunrise-extended")).toBe("golden");
    expect(phaseOf("blue-hour")).toBe("golden");
    expect(phaseOf("daytime")).toBe("day");
    expect(phaseOf("night")).toBe("night");
    expect(phaseOf("clear-night-view")).toBe("night");
    expect(phaseOf(null)).toBe("day");
  });
});

describe("factors", () => {
  it("leave the score alone when nothing is known", () => {
    expect(visualFactor(undefined)).toBe(1);
    expect(resolutionFactor(null)).toBe(1);
    expect(appealFactor(undefined)).toBe(1);
    expect(curationFactor(null)).toBe(1);
    expect(qualityMultiplier({})).toBe(1);
  });

  it("make a dull frame cost and a vivid one pay", () => {
    expect(visualFactor(0.48)).toBeCloseTo(0.84, 2);
    expect(visualFactor(0.8)).toBeCloseTo(1, 5);
    expect(visualFactor(0.9)).toBeGreaterThan(1);
    expect(visualFactor(0)).toBe(0.6);
  });

  it("penalise low resolution in steps", () => {
    expect(resolutionFactor(1080)).toBe(1);
    expect(resolutionFactor(720)).toBeLessThan(1);
    expect(resolutionFactor(480)).toBeLessThan(resolutionFactor(720));
    expect(resolutionFactor(360)).toBeLessThan(resolutionFactor(480));
  });

  it("wait for enough viewer events, then lean with them", () => {
    expect(appealFactor({ skips: 2, dwells: 1, favs: 0 })).toBe(1);
    const loved = appealFactor({ skips: 0, dwells: 10, favs: 3 });
    const hated = appealFactor({ skips: 12, dwells: 0, favs: 0 });
    expect(loved).toBeGreaterThan(1.1);
    expect(hated).toBeLessThan(0.9);
    expect(loved).toBeLessThanOrEqual(1.15);
    expect(hated).toBeGreaterThanOrEqual(0.85);
  });

  it("treat three stars as neutral", () => {
    expect(curationFactor(3)).toBe(1);
    expect(curationFactor(1)).toBeLessThan(curationFactor(2));
    expect(curationFactor(5)).toBeGreaterThan(curationFactor(4));
  });
});

describe("applyQuality", () => {
  it("rounds and clamps", () => {
    expect(applyQuality(100, { visual: 1, rating: 5 })).toBe(100);
    expect(applyQuality(90, { visual: 0.48 })).toBe(76);
    expect(applyQuality(0, { rating: 5 })).toBe(0);
  });
});
