import Link from "next/link";

export function SiteHeader({ liveCount }: { liveCount: number | null }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-sm font-medium tracking-tight text-foreground">
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
