"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useNow } from "@/components/use-now";
import {
  describeSunPhase,
  describeWeather,
  formatClock,
  formatRelative,
  type SolarEventRef,
} from "@/lib/sun-format";

type Window = { start: string; end: string };

type TimelineEvent = {
  cameraId: string;
  cameraName: string;
  city: string | null;
  country: string;
  timezone: string;
  score: number;
  weatherClass: string | null;
  nextEvent: SolarEventRef | null;
  sunrise: string;
  sunset: string;
  goldenHourSunrise: Window;
  goldenHourSunset: Window;
  blueHourMorning: Window;
  blueHourEvening: Window;
};

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/**
 * Everything below the player: a rail of the golden hours coming up across
 * the network, then a compact 24-hour timeline grouped by timezone. One fetch
 * feeds both.
 */
export function SunOverview({ currentCameraId }: { currentCameraId: string | null }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const now = useNow(30_000);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/global-timeline")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!now) return null;

  return (
    <div className="flex flex-col gap-12">
      <UpNext events={events} now={now} currentCameraId={currentCameraId} />
      <Timeline events={events} now={now} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function UpNext({
  events,
  now,
  currentCameraId,
}: {
  events: TimelineEvent[];
  now: Date;
  currentCameraId: string | null;
}) {
  const cards = useMemo(() => {
    const nowMs = now.getTime();
    return events
      .filter((e) => e.cameraId !== currentCameraId)
      .map((e) => {
        // Soonest sunrise/sunset that is still within ±30 min or ahead of us.
        const candidates = [
          { type: "sunrise" as const, timeISO: e.sunrise },
          { type: "sunset" as const, timeISO: e.sunset },
          ...(e.nextEvent ? [e.nextEvent] : []),
        ].filter((c) => Date.parse(c.timeISO) - nowMs > -30 * 60_000);
        if (!candidates.length) return null;
        const next = candidates.reduce((a, b) =>
          Date.parse(a.timeISO) < Date.parse(b.timeISO) ? a : b
        );
        return { event: e, next, at: Date.parse(next.timeISO) };
      })
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => a.at - b.at)
      .slice(0, 12);
  }, [events, now, currentCameraId]);

  if (!cards.length) return null;

  return (
    <section aria-labelledby="up-next">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="up-next" className="text-lg font-semibold tracking-tight text-foreground">
            Golden hours coming up
          </h2>
          <p className="text-sm text-muted">
            The next sunrises and sunsets across {events.length} live cameras — tap one to jump there.
          </p>
        </div>
      </div>

      <div className="rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {cards.map(({ event, next }) => {
          const phase = describeSunPhase(next, null, now, event.timezone);
          const sky = describeWeather(event.weatherClass);
          const live = phase.tone !== "neutral";
          return (
            <Link
              key={event.cameraId}
              href={`/?camera=${encodeURIComponent(event.cameraId)}`}
              className={`group relative flex w-[15.5rem] shrink-0 snap-start flex-col gap-3 rounded-2xl p-4 ring-1 transition hover:-translate-y-0.5 hover:ring-line-strong ${
                phase.tone === "golden"
                  ? "bg-amber-400/10 ring-amber-400/30"
                  : phase.tone === "blue"
                    ? "bg-sky-400/10 ring-sky-400/30"
                    : "bg-surface ring-line"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl leading-none" aria-hidden>
                  {next.type === "sunrise" ? "🌅" : "🌇"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    live ? "bg-accent text-black" : "bg-surface-raised text-muted"
                  }`}
                >
                  {live ? phase.title : formatRelative(next.timeISO, now)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{event.cameraName}</p>
                <p className="truncate text-xs text-muted">
                  {[event.city, event.country].filter(Boolean).join(", ")}
                </p>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span aria-hidden>{sky.icon}</span>
                <span className="truncate">
                  {next.type === "sunrise" ? "Sunrise" : "Sunset"} at{" "}
                  <span className="tnum text-foreground">{formatClock(next.timeISO, event.timezone)}</span>{" "}
                  local · {sky.title}
                </span>
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function Timeline({ events, now }: { events: TimelineEvent[]; now: Date }) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const startMs = dayStart.getTime();
  const pct = (iso: string) =>
    Math.max(0, Math.min(100, ((Date.parse(iso) - startMs) / 86_400_000) * 100));
  const nowPct = ((now.getTime() - startMs) / 86_400_000) * 100;

  // One row per timezone: cameras in the same zone share sun times to within
  // minutes, so 124 rows collapse to ~25 without losing anything visible.
  const rows = useMemo(() => {
    const byZone = new Map<string, TimelineEvent[]>();
    for (const e of events) byZone.set(e.timezone, [...(byZone.get(e.timezone) ?? []), e]);
    return [...byZone.entries()]
      .map(([timezone, list]) => {
        const rep = list.reduce((a, b) => (a.score >= b.score ? a : b));
        return { timezone, count: list.length, rep, sunsetMs: Date.parse(rep.sunset) };
      })
      .sort((a, b) => a.sunsetMs - b.sunsetMs);
  }, [events]);

  if (!rows.length) return null;

  const userZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <section aria-labelledby="timeline">
      <div className="mb-4">
        <h2 id="timeline" className="text-lg font-semibold tracking-tight text-foreground">
          Today across the network
        </h2>
        <p className="text-sm text-muted">
          Sunrise and sunset windows for every live timezone, shown in your time ({userZone}).
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {/* Axis */}
        <div className="grid grid-cols-1 items-center gap-1 border-b border-line px-4 py-2 text-[11px] text-faint sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
          <span className="hidden sm:inline">Timezone</span>
          <div className="relative flex justify-between tnum">
            {HOURS.map((h) => (
              <span key={h} className={h % 6 ? "hidden sm:inline" : ""}>
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        <div className="divide-y divide-line">
          {rows.map(({ timezone, count, rep }) => (
            <div
              key={timezone}
              className="grid grid-cols-1 items-center gap-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2 sm:block">
                <p className="truncate text-sm text-foreground">{timezone.replace(/_/g, " ")}</p>
                <p className="shrink-0 truncate text-xs text-faint sm:shrink">
                  {count} camera{count === 1 ? "" : "s"}
                  <span className="hidden sm:inline"> · e.g. {rep.cameraName}</span>
                </p>
              </div>
              <div className="relative h-5 overflow-hidden rounded-md bg-background/60">
                <Band from={pct(rep.blueHourMorning.start)} to={pct(rep.blueHourMorning.end)} className="bg-sky-400/30" />
                <Band from={pct(rep.goldenHourSunrise.start)} to={pct(rep.goldenHourSunrise.end)} className="bg-amber-400/35" />
                <Band from={pct(rep.sunrise)} to={pct(rep.sunset)} className="bg-amber-200/10" />
                <Band from={pct(rep.goldenHourSunset.start)} to={pct(rep.goldenHourSunset.end)} className="bg-amber-400/35" />
                <Band from={pct(rep.blueHourEvening.start)} to={pct(rep.blueHourEvening.end)} className="bg-sky-400/30" />
                <Tick at={pct(rep.sunrise)} className="bg-amber-300" />
                <Tick at={pct(rep.sunset)} className="bg-orange-400" />
                <Tick at={nowPct} className="z-10 bg-accent shadow-[0_0_8px_rgba(251,146,60,0.9)]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <Legend swatch="bg-amber-400/35" label="Golden hour" />
        <Legend swatch="bg-sky-400/30" label="Blue hour" />
        <Legend swatch="bg-amber-200/10 ring-1 ring-line" label="Daylight" />
        <Legend swatch="bg-accent" label="Now" />
      </div>
    </section>
  );
}

function Band({ from, to, className }: { from: number; to: number; className: string }) {
  if (to <= from) return null;
  return (
    <div
      className={`absolute inset-y-0 ${className}`}
      style={{ left: `${from}%`, width: `${to - from}%` }}
    />
  );
}

function Tick({ at, className }: { at: number; className: string }) {
  return (
    <div className={`absolute inset-y-0 w-0.5 ${className}`} style={{ left: `${at}%` }} />
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-3 w-4 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
