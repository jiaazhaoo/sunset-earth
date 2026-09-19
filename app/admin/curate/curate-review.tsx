"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurateRow } from "@/lib/curate";
import { curationFactor } from "@/lib/quality";

type Sort = "unrated" | "picture" | "viewers" | "score" | "id";

const SORTS: Array<[Sort, string]> = [
  ["unrated", "unrated first"],
  ["picture", "worst picture"],
  ["viewers", "most skipped"],
  ["score", "highest score"],
  ["id", "by id"],
];

export function CurateReview() {
  const [rows, setRows] = useState<CurateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>("unrated");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Cache-buster for the thumbnails; set after mount so server and client agree.
  const [stamp, setStamp] = useState(0);

  const fetchRows = useCallback(async () => {
    const res = await fetch("/api/admin/curate", { cache: "no-store" });
    const data = res.ok ? await res.json() : { cameras: [] };
    return (data.cameras ?? []) as CurateRow[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRows().then((list) => {
      if (cancelled) return;
      setRows(list);
      setStamp(Date.now());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  async function reload() {
    setLoading(true);
    const list = await fetchRows();
    setRows(list);
    setStamp(Date.now());
    setLoading(false);
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = rows.filter(
      (r) => !q || [r.placename, r.city, r.country, r.camera_id].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
    const picture = (r: CurateRow) => (r.live && r.picture !== null ? r.picture : 2);
    const byId = (a: CurateRow, b: CurateRow) => Number(a.camera_id) - Number(b.camera_id);
    switch (sort) {
      case "unrated":
        return list.sort((a, b) => Number(a.curated_rating !== null) - Number(b.curated_rating !== null) || picture(a) - picture(b) || byId(a, b));
      case "picture":
        return list.sort((a, b) => picture(a) - picture(b) || byId(a, b));
      case "viewers":
        return list.sort((a, b) => (b.skips ?? 0) - (a.skips ?? 0) || byId(a, b));
      case "score":
        return list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byId(a, b));
      default:
        return list.sort(byId);
    }
  }, [rows, sort, filter]);

  async function rate(cameraId: string, rating: number | null) {
    setBusy(cameraId);
    setMessage(null);
    const res = await fetch("/api/admin/curate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraId, rating }),
    });
    setBusy(null);
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.camera_id === cameraId ? { ...r, curated_rating: rating } : r)));
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Request failed.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {SORTS.map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`border px-3 py-1 transition ${
              sort === s ? "border-foreground bg-foreground text-background" : "border-line bg-surface text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by place"
          className="ml-auto border border-line bg-surface px-3 py-1 text-foreground placeholder:text-faint"
        />
        <button onClick={reload} className="border border-line px-3 py-1 text-muted transition hover:text-foreground">
          Refresh frames
        </button>
        <span className="text-xs text-faint">{loading ? "Loading…" : `${shown.length} cameras`}</span>
      </div>
      {message && <p className="text-sm text-muted">{message}</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (
          <Card key={r.camera_id} row={r} stamp={stamp} busy={busy === r.camera_id} onRate={rate} />
        ))}
      </ul>
    </div>
  );
}

function Card({
  row,
  stamp,
  busy,
  onRate,
}: {
  row: CurateRow;
  stamp: number;
  busy: boolean;
  onRate: (cameraId: string, rating: number | null) => void;
}) {
  const videoId = row.video_id ?? row.link?.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;
  const place = [row.city, row.country].filter(Boolean).join(", ");
  const picture = row.picture !== null && row.picture !== undefined ? Math.round(row.picture * 100) : null;
  const frame = row.live ? "live frame" : (row.checks ?? 0) >= 6 ? "static card" : "not yet known";
  const rating = row.curated_rating ?? 0;
  return (
    <li className="flex flex-col border border-line bg-surface">
      <a href={row.link ?? "#"} target="_blank" rel="noreferrer" className="block aspect-video w-full bg-black">
        {videoId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg${stamp ? `?t=${stamp}` : ""}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </a>
      <div className="flex flex-col gap-1 p-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-foreground">{row.placename ?? `Camera ${row.camera_id}`}</span>
          <span className="text-xs text-faint">#{row.camera_id}</span>
        </div>
        <div className="text-muted">{place}</div>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted">
          <dt>Now</dt>
          <dd>
            {row.score ?? "–"} · {row.label ?? "–"}
            {row.sky_title ? ` · ${row.sky_title} sky` : ""}
          </dd>
          <dt>Picture</dt>
          <dd>
            {picture !== null ? `${picture}%` : "–"} · {frame}
            {row.notes ? ` · ${row.notes}` : ""}
          </dd>
          <dt>Stream</dt>
          <dd>{row.max_height ? `${row.max_height}p` : "resolution not read yet"}</dd>
          <dt>Viewers</dt>
          <dd>
            {row.skips ?? 0} skipped · {row.dwells ?? 0} stayed · {row.favs ?? 0} saved
          </dd>
        </dl>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              disabled={busy}
              onClick={() => onRate(row.camera_id, rating === n ? null : n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating >= n}
              className={`h-8 w-8 border text-base leading-none transition ${
                rating >= n ? "border-amber-500 text-amber-500" : "border-line text-faint hover:text-foreground"
              }`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-xs text-faint">
            {rating ? `${rating}/5 · weight ×${curationFactor(rating)}` : "unrated"}
          </span>
        </div>
      </div>
    </li>
  );
}
