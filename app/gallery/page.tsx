import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { countAvailableCameras } from "@/lib/cameras";
import { query } from "@/lib/db";
import { formatClock } from "@/lib/sun-format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gallery · Sunset Earth",
  description: "A frame from each camera's best golden hour, day by day.",
};

type Row = {
  camera_id: string;
  day: string;
  r2_key: string;
  score: number;
  label: string | null;
  taken_at: string;
  placename: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
};

/** Frames the tick cron kept from each camera's best golden hour. */
export default async function GalleryPage() {
  const [liveCount, rows] = await Promise.all([
    countAvailableCameras().catch(() => null),
    query<Row>(
      `SELECT h.camera_id, h.day, h.r2_key, h.score, h.label, h.taken_at,
              c.placename, c.city, c.country, c.timezone
       FROM highlights h JOIN camera_ytb c ON c.camera_id = h.camera_id
       ORDER BY h.day DESC, h.score DESC
       LIMIT 240`
    ).catch(() => [] as Row[]),
  ]);

  const days = new Map<string, Row[]>();
  for (const r of rows) days.set(r.day, [...(days.get(r.day) ?? []), r]);

  return (
    <>
      <SiteHeader liveCount={liveCount} />
      <main className="mx-auto w-full max-w-[1400px] px-5 pb-16 pt-20 sm:px-8">
        <h1 className="font-serif text-4xl leading-none tracking-tight text-white sm:text-5xl">Gallery</h1>
        <p className="mt-2 max-w-xl text-sm text-white/50">
          Every ten minutes the site keeps a frame from any camera in a strong golden hour — one per camera per day.
          These are those frames.
        </p>

        {[...days.entries()].map(([day, list]) => (
          <section key={day} className="mt-10">
            <h2 className="text-xs font-medium uppercase tracking-[0.22em] text-white/45">
              {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((r) => (
                <li key={`${r.day}-${r.camera_id}`}>
                  <Link href={`/?camera=${encodeURIComponent(r.camera_id)}`} className="group block">
                    <div className="aspect-video w-full overflow-hidden bg-black ring-1 ring-white/10 transition group-hover:ring-amber-300/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/highlights/${r.r2_key}`} alt={`${r.placename ?? r.camera_id} at golden hour`} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <p className="mt-2 truncate text-sm text-white">{r.placename ?? `Camera ${r.camera_id}`}</p>
                    <p className="truncate text-xs text-white/45">
                      {[r.city, r.country].filter(Boolean).join(", ")}
                      <span className="text-amber-200/80"> · {formatClock(r.taken_at, r.timezone)} local</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!rows.length ? (
          <p className="mt-10 text-sm text-white/40">Nothing kept yet — the first frames arrive with the next golden hour.</p>
        ) : null}
      </main>
    </>
  );
}
