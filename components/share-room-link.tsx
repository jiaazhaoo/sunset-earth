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
      alert("复制失败，请手动复制链接");
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-zinc-700">分享此房间链接</p>
      <p className="mt-2 break-all rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
        {shareUrl}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {copied ? "已复制" : "复制房间链接"}
        </button>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `一起看日落：${shareUrl}`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-900"
        >
          分享到 X
        </a>
      </div>
    </div>
  );
}
