import Link from "next/link";

export function SiteHeader({ liveCount }: { liveCount: number | null }) {
  return (
    <header className="absolute inset-x-0 top-0 z-10">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="font-serif text-[22px] italic tracking-tight text-white/90">
          Sunset Earth
        </Link>
        {liveCount !== null ? (
          <span className="text-xs text-white/50">
            <span className="tnum text-white/80">{liveCount}</span> cameras live
          </span>
        ) : null}
      </div>
    </header>
  );
}
