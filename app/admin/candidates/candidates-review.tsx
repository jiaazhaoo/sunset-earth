"use client";

import { useCallback, useEffect, useState } from "react";
import type { CandidateRow } from "@/lib/discovery";

type Status = "pending" | "approved" | "rejected";

export function CandidatesReview() {
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (s: Status) => {
    const res = await fetch(`/api/admin/candidates?status=${s}`, { cache: "no-store" });
    const data = res.ok ? await res.json() : { candidates: [] };
    return (data.candidates ?? []) as CandidateRow[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(status).then((list) => {
      if (cancelled) return;
      setRows(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [status, load]);

  function switchStatus(s: Status) {
    setLoading(true);
    setStatus(s);
  }

  async function act(id: number, action: "approve" | "reject") {
    setBusyId(id);
    setMessage(null);
    const res = await fetch("/api/admin/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMessage(action === "approve" ? `Added as camera ${data.cameraId}.` : "Rejected.");
    } else {
      setMessage(data.error ?? "Request failed.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => switchStatus(s)}
            className={`rounded-full px-3 py-1 ring-1 transition ${
              status === s ? "bg-accent text-black ring-accent" : "bg-surface text-muted ring-line hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-faint">{loading ? "Loading…" : `${rows.length} shown`}</span>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <ul className="flex flex-col gap-3">
        {rows.map((c) => (
          <li key={c.id} className="grid gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line sm:grid-cols-[12rem_1fr_auto]">
            <a
              href={`https://www.youtube.com/watch?v=${c.video_id}`}
              target="_blank"
              rel="noreferrer noopener"
              className="block aspect-video overflow-hidden rounded-lg bg-black"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </a>
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold text-foreground">{c.placename ?? "(no place)"}</p>
              <p className="truncate text-muted">{[c.city, c.country].filter(Boolean).join(", ") || "location unknown"}</p>
              <p className="mt-1 truncate text-xs text-faint" title={c.title}>{c.title}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-faint">
                <span>conf {c.confidence?.toFixed(2) ?? "–"}</span>
                <span>{c.source}</span>
                {c.timezone ? <span>{c.timezone}</span> : null}
                {c.tag ? <span>{c.tag}</span> : null}
                {c.latitude !== null && c.longitude !== null ? (
                  <a className="underline-offset-2 hover:underline" href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=13/${c.latitude}/${c.longitude}`} target="_blank" rel="noreferrer noopener">map</a>
                ) : null}
                {c.channel_url ? (
                  <a className="underline-offset-2 hover:underline" href={c.channel_url} target="_blank" rel="noreferrer noopener">channel</a>
                ) : null}
                {c.reject_reason ? <span className="text-rose-400">{c.reject_reason}</span> : null}
                {c.camera_id ? <span className="text-emerald-400">camera {c.camera_id}</span> : null}
              </p>
            </div>
            {status !== "approved" ? (
              <div className="flex gap-2 sm:flex-col">
                <button
                  disabled={busyId === c.id || c.latitude === null}
                  onClick={() => act(c.id, "approve")}
                  className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
                >
                  Approve
                </button>
                {status === "pending" ? (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, "reject")}
                    className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted ring-1 ring-line disabled:opacity-40"
                  >
                    Reject
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {!loading && !rows.length ? <li className="text-sm text-faint">Nothing here.</li> : null}
      </ul>
    </div>
  );
}
