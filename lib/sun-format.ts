/**
 * Small, dependency-free formatters shared by the viewer, the "up next" rail
 * and the timeline. Everything here is pure so it renders identically on the
 * server and the client.
 */

export type SolarEventType = "sunrise" | "sunset";

export type SolarEventRef = {
  type: SolarEventType;
  timeISO: string;
};

/** Golden hour spans ±30 min around the event, blue hour the 45 min beyond. */
export const GOLDEN_HOUR_MIN = 30;
export const BLUE_HOUR_MIN = 45;

export function describeWeather(weatherClass?: string | null) {
  switch (weatherClass) {
    case "clear":
      return { icon: "☀️", title: "Clear skies", detail: "Crisp colours likely" };
    case "partly-cloudy":
      return { icon: "⛅", title: "Partly cloudy", detail: "Cloud drama possible" };
    case "light-snow":
      return { icon: "🌨️", title: "Light snow", detail: "Soft, muted light" };
    case "light-rain":
      return { icon: "🌦️", title: "Light rain", detail: "Glow may be muted" };
    case "other":
      return { icon: "☁️", title: "Overcast", detail: "Glow may be muted" };
    default:
      return { icon: "🌤️", title: "Checking sky", detail: "Forecast updating" };
  }
}

/** "in 42 min", "in 3 h 05 min", "12 min ago". */
export function formatRelative(target: Date | string, now: Date): string {
  const t = typeof target === "string" ? Date.parse(target) : target.getTime();
  if (Number.isNaN(t)) return "";
  const diffMin = Math.round((t - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const body =
    abs < 60
      ? `${abs} min`
      : `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, "0")} min`;
  if (diffMin === 0) return "now";
  return diffMin > 0 ? `in ${body}` : `${body} ago`;
}

export function formatClock(date: Date | string, timezone: string | null | undefined) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "--:--";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone ?? undefined,
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "--:--";
  }
}

/** Short zone label like "GMT+2" or "EDT" for a timezone id. */
export function formatZoneAbbr(timezone: string | null | undefined, now: Date) {
  if (!timezone) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(now);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export type SunPhase = {
  /** Headline: "Golden hour", "Blue hour", "Sunset in 42 min", "Daylight"… */
  title: string;
  /** Supporting line: the event and its local clock time. */
  detail: string;
  /** For styling: golden/blue when inside a window, else neutral. */
  tone: "golden" | "blue" | "neutral";
  /** The event this phase refers to, if any. */
  event: SolarEventRef | null;
};

/**
 * Where a camera sits in its solar day, from its next and following events.
 * The "following" event lets us recognise the ±30 min golden window that
 * straddles an event which just passed.
 */
export function describeSunPhase(
  nextEvent: SolarEventRef | null | undefined,
  followingEvent: SolarEventRef | null | undefined,
  now: Date,
  timezone: string | null | undefined
): SunPhase {
  const candidates = [nextEvent, followingEvent].filter(
    (e): e is SolarEventRef => !!e && !Number.isNaN(Date.parse(e.timeISO))
  );
  if (!candidates.length) {
    return { title: "Sun times pending", detail: "Updating forecast", tone: "neutral", event: null };
  }

  // Closest event in either direction decides the phase.
  const closest = candidates.reduce((a, b) =>
    Math.abs(Date.parse(b.timeISO) - now.getTime()) <
    Math.abs(Date.parse(a.timeISO) - now.getTime())
      ? b
      : a
  );
  const deltaMin = (Date.parse(closest.timeISO) - now.getTime()) / 60_000;
  const label = closest.type === "sunrise" ? "Sunrise" : "Sunset";
  const clock = formatClock(closest.timeISO, timezone);

  if (Math.abs(deltaMin) <= GOLDEN_HOUR_MIN) {
    return {
      title: "Golden hour",
      detail: `${label} ${formatRelative(closest.timeISO, now)} · ${clock}`,
      tone: "golden",
      event: closest,
    };
  }
  const inBlue =
    closest.type === "sunset"
      ? deltaMin < -GOLDEN_HOUR_MIN && deltaMin >= -(GOLDEN_HOUR_MIN + BLUE_HOUR_MIN)
      : deltaMin > GOLDEN_HOUR_MIN && deltaMin <= GOLDEN_HOUR_MIN + BLUE_HOUR_MIN;
  if (inBlue) {
    return {
      title: "Blue hour",
      detail: `${label} ${formatRelative(closest.timeISO, now)} · ${clock}`,
      tone: "blue",
      event: closest,
    };
  }

  // Outside any window: point at the next upcoming event.
  const upcoming =
    candidates.find((e) => Date.parse(e.timeISO) > now.getTime()) ?? closest;
  const upLabel = upcoming.type === "sunrise" ? "Sunrise" : "Sunset";
  return {
    title: `${upLabel} ${formatRelative(upcoming.timeISO, now)}`,
    detail: `${upLabel} at ${formatClock(upcoming.timeISO, timezone)} local`,
    tone: "neutral",
    event: upcoming,
  };
}
