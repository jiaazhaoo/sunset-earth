import Link from "next/link";

export function SiteHeader({ liveCount }: { liveCount: number | null }) {
  return (
    <header>
      {/* A sliver of sunset along the top edge. */}
      <div aria-hidden className="h-px w-full bg-gradient-to-r from-amber-300 via-orange-500 to-violet-600" />
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="bg-gradient-to-r from-amber-200 via-orange-300 to-fuchsia-300 bg-clip-text text-sm font-semibold tracking-tight text-transparent"
        >
          Sunset Earth
        </Link>
        {liveCount !== null ? (
          <span className="text-xs text-faint">
            <span className="tnum text-muted">{liveCount}</span> live
          </span>
        ) : null}
      </div>
    </header>
  );
}
