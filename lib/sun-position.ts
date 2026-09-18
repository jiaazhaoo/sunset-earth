/**
 * Where the sun is overhead right now — enough to draw the day/night line.
 * NOAA's low-precision solar position (declination + equation of time), good
 * to a fraction of a degree, which is far finer than a world map can show.
 */
export function subsolarPoint(date: Date): { lat: number; lng: number } {
  const ms = date.getTime();
  const dayOfYear =
    (ms - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000;
  const hoursUtc = (ms % 86_400_000) / 3_600_000;

  // Fractional year, radians.
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hoursUtc - 12) / 24);

  // Equation of time in minutes; declination in radians.
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  // Solar noon is at longitude where local solar time is 12:00.
  const lng = -15 * (hoursUtc - 12 + eqTime / 60);
  return { lat: (decl * 180) / Math.PI, lng: ((lng + 540) % 360) - 180 };
}
