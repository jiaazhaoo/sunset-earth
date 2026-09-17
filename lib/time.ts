/**
 * Timezone helpers that do not depend on the machine's own timezone.
 *
 * Open-Meteo, when called with `timezone=<IANA>`, returns wall-clock strings
 * without an offset ("2026-09-17T19:45"). Turning that into an instant needs
 * the zone's offset at that moment; the previous implementation derived it
 * via `new Date(y, m, d, h, …)`, which silently uses the runtime's zone — fine
 * on Workers (UTC), an hour wrong under `next dev` on a BST laptop — and used
 * `hour12: false`, which V8 renders as "24" at midnight for UTC+0 zones.
 */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (east = +). */
export function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour") % 24,
    num("minute"),
    num("second")
  );
  return asUtc - instant.getTime();
}

/**
 * Parse an ISO-8601 string. With an explicit offset or "Z" it is taken as
 * is; without one it is read as wall-clock time in `timeZone` (or UTC when no
 * zone is given). Returns null for anything unparsable.
 */
export function parseDateInTimezone(
  value: string | null | undefined,
  timeZone?: string | null
): Date | null {
  if (!value) return null;

  if (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0)
  );
  if (Number.isNaN(wall)) return null;
  if (!timeZone) return new Date(wall);

  try {
    // First guess the offset at the wall-clock instant read as UTC, then
    // re-evaluate at the corrected instant so DST transitions land right.
    const guess = wall - timezoneOffsetMs(new Date(wall), timeZone);
    const exact = wall - timezoneOffsetMs(new Date(guess), timeZone);
    return new Date(exact);
  } catch {
    // Unknown zone: fall back to UTC rather than dropping the value.
    return new Date(wall);
  }
}
