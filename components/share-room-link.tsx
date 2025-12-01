'use client';

import { useState } from "react";

type Props = {
  shareUrl: string;
};

export function ShareRoomLink({ shareUrl }: Props) {
  const [copied, setCopied] = useState(false);

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
    <div className="rounded-2xl border border-white/15 bg-white/10 p-5 text-white shadow-lg shadow-black/20 backdrop-blur-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-200">
        Share Room Link
      </p>
      <p className="mt-3 break-all rounded-xl bg-white/10 px-3 py-2 text-xs text-white/70">
        {shareUrl}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={handleCopy}
          className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/40 transition hover:shadow-xl"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `Sunset watch party: ${shareUrl}`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-white/30 px-4 py-2 text-center text-sm font-semibold text-white/80 transition hover:border-white hover:text-white"
        >
          Share to X
        </a>
      </div>
    </div>
  );
}
