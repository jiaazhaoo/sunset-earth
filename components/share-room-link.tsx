'use client';

import { useState } from "react";

type Props = {
  shareUrl: string;
  variant?: "default" | "compact" | "flat";
};

export function ShareRoomLink({ shareUrl, variant = "default" }: Props) {
  const [copied, setCopied] = useState(false);
  const isCompact = variant === "compact" || variant === "flat";
  const isFlat = variant === "flat";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      alert("We couldn't copy the link. Please copy it manually.");
    }
  };

  return (
    <div
      className={
        isFlat
          ? "text-white"
          : isCompact
          ? "rounded-2xl border border-white/10 bg-white/5 p-4 text-white shadow-lg shadow-black/20 backdrop-blur-sm"
          : "rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 text-white shadow-xl shadow-black/30 backdrop-blur-sm"
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-orange-200/90">
          Share room
        </p>
        {!isCompact && (
          <span className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-white/70">
            Invite
          </span>
        )}
      </div>
      <p
        className={
          isFlat
            ? "mt-2 break-all rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60"
            : "mt-3 break-all rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/65"
        }
      >
        {shareUrl}
      </p>
      <div
        className={
          isCompact ? "mt-3 flex flex-wrap gap-2" : "mt-4 flex flex-col gap-2 sm:flex-row"
        }
      >
        <button
          onClick={handleCopy}
          className={
            isCompact
              ? "flex-1 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-500/35 transition hover:shadow-xl"
              : "flex-1 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/40 transition hover:shadow-xl"
          }
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `Sunset watch party: ${shareUrl}`
          )}`}
          target="_blank"
          rel="noreferrer"
          className={
            isCompact
              ? "rounded-full border border-white/15 px-3 py-1.5 text-center text-xs font-semibold text-white/75 transition hover:border-white/50 hover:text-white"
              : "rounded-xl border border-white/20 px-4 py-2 text-center text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white"
          }
        >
          Share to X
        </a>
      </div>
    </div>
  );
}
