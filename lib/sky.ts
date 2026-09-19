/**
 * Will the sky do anything at sunset? Photographers' rule of thumb, encoded:
 * high and mid-level cloud catches colour after the sun drops below it;
 * low cloud is a lid; a completely clear sky is fine but flat; haze and
 * rain mute everything. Open-Meteo gives the three cloud layers per hour.
 */

export type SkyInputs = {
  cloudLow?: number | null; // %
  cloudMid?: number | null; // %
  cloudHigh?: number | null; // %
  cloudTotal?: number | null; // % fallback when layers are missing
  humidity?: number | null; // %
  visibility?: number | null; // metres
  precipitation?: number | null; // mm/h
};

export type SkyOutlook = {
  /** 0..1 — how promising the sky is for golden-hour colour. */
  index: number;
  /** Two or three words for the caption. */
  title: string;
  /** One clause of explanation. */
  detail: string;
};

function ramp(x: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (x - a) / (b - a)));
}

export function sunsetSkyIndex(input: SkyInputs): SkyOutlook {
  const low = input.cloudLow ?? null;
  const mid = input.cloudMid ?? null;
  const high = input.cloudHigh ?? null;

  if (low === null && mid === null && high === null) {
    // Only total cloud: treat it as an even mix.
    const total = input.cloudTotal ?? 0;
    return sunsetSkyIndex({ ...input, cloudLow: total * 0.4, cloudMid: total * 0.3, cloudHigh: total * 0.3 });
  }

  const l = low ?? 0, m = mid ?? 0, h = high ?? 0;

  // Low cloud: a lid. 0–20 % harmless, past 60 % it takes the light away.
  const lidPenalty = 1 - 0.9 * ramp(l, 20, 85);

  // Upper cloud (high, plus half of mid): best between 25 % and 70 %.
  const upper = Math.min(100, h + 0.5 * m);
  let upperScore: number;
  if (upper <= 25) upperScore = 0.75 + 0.25 * ramp(upper, 0, 25); // clear → flat but fine
  else if (upper <= 70) upperScore = 1;
  else upperScore = 1 - 0.55 * ramp(upper, 70, 100); // overcast up high dims it

  const hazePenalty = 1 - 0.25 * ramp(input.humidity ?? 0, 85, 100);
  const vis = input.visibility ?? 20_000;
  const visPenalty = vis < 5_000 ? 0.55 : vis < 10_000 ? 0.85 : 1;
  const rainPenalty = (input.precipitation ?? 0) > 0.2 ? 0.4 : (input.precipitation ?? 0) > 0 ? 0.75 : 1;

  const index = Math.round(lidPenalty * upperScore * hazePenalty * visPenalty * rainPenalty * 1000) / 1000;

  let title: string;
  let detail: string;
  if (rainPenalty < 1) {
    title = "Rain";
    detail = "colour will be muted";
  } else if (l >= 60) {
    title = "Low cloud";
    detail = "the sun will set behind it";
  } else if (vis < 5_000) {
    title = "Hazy";
    detail = "poor visibility";
  } else if (upper >= 25 && upper <= 70 && l < 40) {
    title = "High cloud";
    detail = "the kind that catches colour";
  } else if (upper > 70) {
    title = "Overcast above";
    detail = "some glow, little colour";
  } else if (l >= 30) {
    title = "Some low cloud";
    detail = "colour depends on the gaps";
  } else {
    title = "Clear";
    detail = "clean light, a plain gradient";
  }
  return { index, title, detail };
}
