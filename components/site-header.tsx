import Link from "next/link";

export function SiteHeader({ liveCount }: { liveCount: number | null }) {
  return (
    <header className="border-b border-line">
      {/* A sliver of sunset along the top edge. */}
      <div aria-hidden className="h-0.5 w-full bg-gradient-to-r from-amber-300 via-orange-500 to-violet-600" />
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-foreground">
          <span aria-hidden className="h-2.5 w-2.5 bg-gradient-to-br from-amber-300 to-fuchsia-500" />
          Sunset Earth
        </Link>
        {liveCount !== null ? (
          <span className="text-xs text-muted">
            <span className="tnum text-foreground">{liveCount}</span> cameras live
          </span>
        ) : null}
      </div>
    </header>
  );
}
