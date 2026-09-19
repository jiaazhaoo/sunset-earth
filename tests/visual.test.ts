import { describe, expect, it } from "vitest";
import { frameStats, scoreFrame } from "@/lib/visual";

// Synthetic frames: each pixel is chosen by a function of (x, y) so the
// statistics are predictable without shipping image fixtures.
function frame(width: number, height: number, px: (x: number, y: number) => [number, number, number]): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      const i = (y * width + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}

const W = 240;
const H = 135;

/** Deterministic noise so "busy" regions have a real luma spread. */
function noise(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const sunset = frame(W, H, (x, y) => {
  if (y < H * 0.55) {
    // orange → violet gradient sky
    const t = y / (H * 0.55);
    return [Math.round(250 - 90 * t), Math.round(140 - 100 * t), Math.round(60 + 120 * t)];
  }
  const n = noise(x, y);
  return [Math.round(30 + 40 * n), Math.round(25 + 30 * n), Math.round(40 + 40 * n)]; // dark textured ground
});

const greyDay = frame(W, H, (x, y) => {
  if (y < H * 0.55) return [180, 182, 185]; // flat overcast sky
  const n = noise(x, y);
  const v = Math.round(90 + 60 * n);
  return [v, v, v];
});

const night = frame(W, H, (x, y) => {
  const n = noise(x, y);
  return n > 0.995 ? [200, 190, 120] : [4, 5, 10]; // a few street lights
});

const blown = frame(W, H, () => [252, 252, 250]);

describe("frameStats", () => {
  it("finds sky, warm light and colour in a sunset frame", () => {
    const s = frameStats(sunset, W, H);
    expect(s.sky).toBeGreaterThan(0.6);
    expect(s.warm).toBeGreaterThan(0.3);
    expect(s.colorfulness).toBeGreaterThan(0.4);
    expect(s.brightness).toBeGreaterThan(0.2);
    expect(s.brightness).toBeLessThan(0.75);
  });

  it("sees a grey day as sky without colour", () => {
    const s = frameStats(greyDay, W, H);
    expect(s.sky).toBeGreaterThan(0.6);
    expect(s.warm).toBe(0);
    expect(s.colorfulness).toBeLessThan(0.08);
  });

  it("reports a night frame as dark", () => {
    const s = frameStats(night, W, H);
    expect(s.brightness).toBeLessThan(0.05);
    expect(s.dark).toBeGreaterThan(0.95);
    expect(s.sky).toBe(0);
  });
});

describe("scoreFrame", () => {
  const score = (rgba: Uint8Array) => scoreFrame(frameStats(rgba, W, H));

  it("orders sunset > grey day > night", () => {
    const a = score(sunset);
    const b = score(greyDay);
    const c = score(night);
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.score).toBeGreaterThan(c.score);
    expect(a.score).toBeGreaterThan(0.7);
    expect(c.score).toBeLessThan(0.05);
  });

  it("annotates what it saw", () => {
    expect(score(sunset).notes).toContain("warm light");
    expect(score(greyDay).notes).toContain("grey");
    expect(score(night).notes).toContain("very dark");
    expect(score(blown).notes).toContain("blown out");
  });

  it("gives a blown-out frame nothing", () => {
    expect(score(blown).score).toBe(0);
  });

  it("stays within 0..1", () => {
    for (const f of [sunset, greyDay, night, blown]) {
      const s = score(f).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
