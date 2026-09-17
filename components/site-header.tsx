import Link from "next/link";

export function SiteHeader({ liveCount }: { liveCount: number | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-amber-300 via-orange-500 to-rose-500 shadow-[0_0_18px_rgba(251,146,60,0.7)]"
          />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Sunset Earth
          </span>
          <span className="hidden text-sm text-faint sm:inline">
            · live golden hours, worldwide
          </span>
        </Link>

        <div className="flex items-center gap-2 text-xs">
          {liveCount !== null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="tnum">{liveCount}</span> cameras live
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
