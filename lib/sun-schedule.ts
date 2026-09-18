import { describeSunPhase, formatRelative, GOLDEN_HOUR_MIN, type SolarEventRef, type SunPhase } from "@/lib/sun-format";

/**
 * Turns the list of live cameras into "what is happening now" and "what is
 * coming up": the golden hours in progress, and the next sunsets/sunrises
 * in order. Pure, so the headline, TV mode and the explore page agree.
 */

export type ScheduledCamera = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  meta: {
    score: number;
    timezone: string | null;
    weatherClass?: string;
    sunrise?: string;
    sunset?: string;
    nextEvent: SolarEventRef | null;
    followingEvent: SolarEventRef | null;
  };
};

export type UpcomingEvent<T extends ScheduledCamera = ScheduledCamera> = {
  camera: T;
  event: SolarEventRef;
  /** ms until the event; negative while it is under way (within golden hour). */
  inMs: number;
};

/** All the sun events we know for a camera, deduplicated. */
function eventsOf(camera: ScheduledCamera, type?: "sunrise" | "sunset"): SolarEventRef[] {
  const all = [
    camera.meta.sunrise ? { type: "sunrise" as const, timeISO: camera.meta.sunrise } : null,
    camera.meta.sunset ? { type: "sunset" as const, timeISO: camera.meta.sunset } : null,
    camera.meta.nextEvent,
    camera.meta.followingEvent,
  ].filter((e): e is SolarEventRef => !!e && !Number.isNaN(Date.parse(e.timeISO)) && (!type || e.type === type));
  const seen = new Set<string>();
  return all.filter((e) => {
    const k = `${e.type}@${Date.parse(e.timeISO)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function phaseOf(camera: ScheduledCamera, now: Date): SunPhase {
  // The two events closest to now decide the phase, whichever fields they came from.
  const [a, b] = eventsOf(camera).sort(
    (x, y) => Math.abs(Date.parse(x.timeISO) - now.getTime()) - Math.abs(Date.parse(y.timeISO) - now.getTime())
  );
  return describeSunPhase(a ?? null, b ?? null, now, camera.meta.timezone);
}

/** Cameras in golden or blue hour right now, best first. */
export function goldenNow<T extends ScheduledCamera>(cameras: T[], now: Date): T[] {
  return cameras
    .filter((c) => phaseOf(c, now).tone !== "neutral")
    .sort((a, b) => b.meta.score - a.meta.score);
}

/**
 * The next sunrise/sunset per camera, soonest first. Events that started up
 * to a golden-hour ago still count (they are worth jumping to now).
 */
export function upcoming<T extends ScheduledCamera>(cameras: T[], now: Date, type?: "sunrise" | "sunset"): UpcomingEvent<T>[] {
  const nowMs = now.getTime();
  const out: UpcomingEvent<T>[] = [];
  for (const camera of cameras) {
    let best: UpcomingEvent<T> | null = null;
    for (const event of eventsOf(camera, type)) {
      const inMs = Date.parse(event.timeISO) - nowMs;
      if (Number.isNaN(inMs) || inMs < -GOLDEN_HOUR_MIN * 60_000) continue;
      if (!best || inMs < best.inMs) best = { camera, event, inMs };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.inMs - b.inMs);
}

/** "Sunset in 23 min", "Sunrise now", "Golden hour". */
export function headlineFor(phase: SunPhase, now: Date): string {
  if (phase.tone === "golden") return phase.event ? `${cap(phase.event.type)} ${formatRelative(phase.event.timeISO, now)}` : "Golden hour";
  if (phase.tone === "blue") return "Blue hour";
  if (!phase.event) return "Live";
  return `${cap(phase.event.type)} ${formatRelative(phase.event.timeISO, now)}`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
