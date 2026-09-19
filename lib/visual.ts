/**
 * How good does a frame *look*? Plain image statistics over an RGBA buffer,
 * no model: brightness, contrast, colourfulness, warm light in the sky
 * region, and how much of the top of the frame is open sky. Calibrated on
 * real stream frames — see tests/visual.test.ts and scripts/visual-calibrate.ts.
 *
 * The source is YouTube's live thumbnail (`hqdefault_live.jpg`). Many channels
 * upload a branded card instead, so callers must only trust these numbers for
 * thumbnails that are seen to change over time (lib/discovery of that lives
 * in /api/tick); a static card scores as "unknown", never as "good".
 */

export type FrameStats = {
  /** Mean luma, 0..1. */
  brightness: number;
  /** Std-dev of luma, 0..1 (≈0.25 is a normal outdoor scene). */
  contrast: number;
  /** Hasler–Süsstrunk colourfulness, roughly 0..1 after normalising by 90. */
  colorfulness: number;
  /** Share of upper-frame pixels that are saturated warm light (sunset hues). */
  warm: number;
  /** Share of the top 45 % that is smooth and light enough to be sky. */
  sky: number;
  /** Share of pixels that are near-black. */
  dark: number;
};

export type FrameScore = FrameStats & {
  /** 0..1 — how watchable the frame is. */
  score: number;
  /** Why, in a few words, for the admin page. */
  notes: string[];
};

/** Sample every `step`th pixel so a 480×360 frame costs ~10k pixels. */
export function frameStats(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, step = 4): FrameStats {
  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let dark = 0;
  // colourfulness accumulators
  let sumRg = 0, sumRg2 = 0, sumYb = 0, sumYb2 = 0;
  // warm light in the upper 60 %
  let upperN = 0;
  let warm = 0;

  const upperLimit = Math.floor(height * 0.6);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      n++;
      sumL += l;
      sumL2 += l * l;
      if (l < 0.08) dark++;
      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      sumRg += rg; sumRg2 += rg * rg; sumYb += yb; sumYb2 += yb * yb;

      if (y < upperLimit) {
        upperN++;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const v = max / 255;
        const s = max === 0 ? 0 : (max - min) / max;
        if (s > 0.28 && v > 0.3) {
          let h = 0;
          const d = max - min;
          if (d > 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
          }
          // magenta → red → orange → gold: the colours a sky only has at the edges of the day
          if (h >= 300 || h <= 55) warm++;
        }
      }
    }
  }

  const meanL = sumL / n;
  const varL = Math.max(0, sumL2 / n - meanL * meanL);
  const meanRg = sumRg / n, meanYb = sumYb / n;
  const stdRg = Math.sqrt(Math.max(0, sumRg2 / n - meanRg * meanRg));
  const stdYb = Math.sqrt(Math.max(0, sumYb2 / n - meanYb * meanYb));
  const colorfulness = (Math.sqrt(stdRg * stdRg + stdYb * stdYb) + 0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb)) / 90;

  return {
    brightness: meanL,
    contrast: Math.sqrt(varL),
    colorfulness: Math.min(1, colorfulness),
    warm: upperN ? warm / upperN : 0,
    sky: skyShare(rgba, width, height),
    dark: dark / n,
  };
}

/**
 * Sky = blocks in the top 45 % of the frame that are smooth (low luma
 * spread) and not dark. Buildings, trees and overlays are busy; sky is not.
 */
function skyShare(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): number {
  const cols = 12, rows = 5;
  const bw = Math.floor(width / cols);
  const bh = Math.floor((height * 0.45) / rows);
  if (bw < 4 || bh < 4) return 0;
  let skyBlocks = 0;
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let n = 0, s = 0, s2 = 0;
      for (let y = by * bh; y < (by + 1) * bh; y += 2) {
        for (let x = bx * bw; x < (bx + 1) * bw; x += 2) {
          const i = (y * width + x) * 4;
          const l = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
          n++; s += l; s2 += l * l;
        }
      }
      const mean = s / n;
      const std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      if (std < 0.07 && mean > 0.22) skyBlocks++;
    }
  }
  return skyBlocks / (cols * rows);
}

/** Smooth ramp: 0 below `a`, 1 above `b`. */
function ramp(x: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (x - a) / (b - a)));
}

/**
 * Combine the statistics into one 0..1 score.
 *
 * Exposure comes first — a frame you cannot see is worth nothing, however
 * warm its hue histogram is — then colour and open sky, with warm light as
 * the bonus that separates a real sunset from a nice afternoon.
 */
export function scoreFrame(stats: FrameStats): FrameScore {
  const notes: string[] = [];

  // Exposure: dark frames fall off a cliff, blown-out ones taper.
  let exposure = ramp(stats.brightness, 0.06, 0.28) * (1 - ramp(stats.brightness, 0.8, 0.97));
  exposure *= 1 - 0.6 * ramp(stats.dark, 0.5, 0.9);
  if (stats.brightness < 0.12) notes.push("very dark");
  else if (stats.brightness > 0.85) notes.push("blown out");

  const contrast = ramp(stats.contrast, 0.05, 0.22);
  if (stats.contrast < 0.08) notes.push("flat");

  const colour = ramp(stats.colorfulness, 0.08, 0.45);
  if (stats.colorfulness < 0.1) notes.push("grey");
  else if (stats.colorfulness > 0.4) notes.push("vivid");

  const sky = ramp(stats.sky, 0.1, 0.6);
  if (stats.sky < 0.15) notes.push("little sky");

  const warm = ramp(stats.warm, 0.03, 0.3);
  if (stats.warm > 0.12) notes.push("warm light");

  const base = 0.35 * contrast + 0.35 * colour + 0.3 * sky;
  const score = exposure * (0.7 * base + 0.3 * Math.max(base, warm)) ;
  return { ...stats, score: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000, notes };
}
