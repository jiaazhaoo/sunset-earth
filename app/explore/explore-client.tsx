"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExploreMap, type ExploreDot } from "@/components/explore-map";
import { useFavourites } from "@/components/use-favourites";
import { useNow } from "@/components/use-now";
import { formatClock, formatRelative } from "@/lib/sun-format";
import { goldenNow, headlineFor, phaseOf, upcoming, type ScheduledCamera } from "@/lib/sun-schedule";

type LiveCamera = ScheduledCamera & { lat: number | null; lng: number | null; videoId: string | null; tag: string | null };

const LINEUP_HOURS = 8;

export function ExploreClient() {
  const router = useRouter();
  const now = useNow(30_000);
  const { favourites } = useFavourites();
  const [cameras, setCameras] = useState<LiveCamera[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/live-cameras", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { cameras: [] }))
        .then((d: { cameras?: LiveCamera[] }) => {
          if (!cancelled) setCameras(d.cameras ?? []);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dots = useMemo<ExploreDot[]>(() => {
    if (!now) return [];
    return cameras
      .filter((c) => c.lat !== null && c.lng !== null)
      .map((c) => {
        const phase = phaseOf(c, now);
        const isNight = phase.tone === "neutral" && phase.event?.type === "sunrise";
        return {
          id: c.id,
          name: c.name,
          city: c.city,
          lat: c.lat as number,
          lng: c.lng as number,
          tone: phase.tone === "golden" ? "golden" : phase.tone === "blue" ? "blue" : isNight ? "night" : "day",
          headline: headlineFor(phase, now),
        };
      });
  }, [cameras, now]);

  const golden = useMemo(() => (now ? goldenNow(cameras, now) : []), [cameras, now]);
  const lineup = useMemo(
    () =>
      now
        ? upcoming(cameras, now, "sunset").filter((u) => u.inMs > 0 && u.inMs <= LINEUP_HOURS * 3_600_000)
        : [],
    [cameras, now]
  );
  const saved = useMemo(() => cameras.filter((c) => favourites.includes(c.id)), [cameras, favourites]);

  const open = (id: string) => router.push(`/?camera=${encodeURIComponent(id)}`);

  return (
    <div className="flex flex-col gap-10">
      <div className="h-[52vh] min-h-[320px] w-full overflow-hidden ring-1 ring-white/10">
        <ExploreMap dots={dots} onPick={open} />
      </div>
      <p className="-mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/45">
        <Legend colour="#fcd34d" label="Golden hour" />
        <Legend colour="#a78bfa" label="Blue hour" />
        <Legend colour="#e5e7eb" label="Daylight" />
        <Legend colour="#52525b" label="Night" />
        <span className="ml-auto">{cameras.length} cameras live · click a dot to watch</span>
        <span className="basis-full text-[10px] text-white/30">
          Map © <a href="https://openfreemap.org" className="hover:text-white/60">OpenFreeMap</a> ·{" "}
          <a href="https://www.openstreetmap.org/copyright" className="hover:text-white/60">OpenStreetMap</a> contributors
        </span>
      </p>

      {saved.length ? (
        <Section title="Saved" sub="Cameras you marked with ♡ in this browser.">
          <Grid>{saved.map((c) => <Card key={c.id} camera={c} now={now} onOpen={open} />)}</Grid>
        </Section>
      ) : null}

      <Section title="Golden hour now" sub={golden.length ? "Best light on the network at this moment." : "Nothing in golden hour right now — see what is coming up."}>
        {golden.length ? <Grid>{golden.slice(0, 12).map((c) => <Card key={c.id} camera={c} now={now} onOpen={open} />)}</Grid> : null}
      </Section>

      <Section title="Tonight's sunsets" sub={`The next ${LINEUP_HOURS} hours, in order.`}>
        <ol className="divide-y divide-white/10 border-y border-white/10">
          {lineup.map(({ camera, event }) => (
            <li key={camera.id}>
              <button onClick={() => open(camera.id)} className="group flex w-full items-baseline gap-4 py-3 text-left">
                <span className="tnum w-24 shrink-0 text-sm text-amber-200/90">{now ? formatRelative(event.timeISO, now) : ""}</span>
                <span className="min-w-0 flex-1 truncate text-white group-hover:text-amber-200">{camera.name}</span>
                <span className="hidden truncate text-sm text-white/45 sm:block">{[camera.city, camera.country].filter(Boolean).join(", ")}</span>
                <span className="tnum shrink-0 text-xs text-white/35">{formatClock(event.timeISO, camera.meta.timezone)} local</span>
              </button>
            </li>
          ))}
          {!lineup.length ? <li className="py-3 text-sm text-white/40">No sunsets in the next {LINEUP_HOURS} hours.</li> : null}
        </ol>
      </Section>

      <p className="text-xs text-white/35">
        <Link href="/" className="hover:text-white/70">← Back to the live camera</Link>
      </p>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2" style={{ background: colour }} />
      {label}
    </span>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-3xl leading-none tracking-tight text-white">{title}</h2>
      {sub ? <p className="mt-1 text-sm text-white/45">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">{children}</ul>;
}

function Card({ camera, now, onOpen }: { camera: LiveCamera; now: Date | null; onOpen: (id: string) => void }) {
  const phase = now ? phaseOf(camera, now) : null;
  const tone = phase?.tone === "golden" ? "text-amber-300" : phase?.tone === "blue" ? "text-violet-300" : "text-white/45";
  return (
    <li>
      <button onClick={() => onOpen(camera.id)} className="group block w-full text-left">
        <div className="aspect-video w-full overflow-hidden bg-black ring-1 ring-white/10 transition group-hover:ring-amber-300/60">
          {camera.videoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`https://i.ytimg.com/vi/${camera.videoId}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
          ) : null}
        </div>
        <p className="mt-2 truncate text-sm text-white">{camera.name}</p>
        <p className="truncate text-xs text-white/45">
          {[camera.city, camera.country].filter(Boolean).join(", ")}
          {phase && now ? <span className={tone}> · {headlineFor(phase, now)}</span> : null}
        </p>
      </button>
    </li>
  );
}
