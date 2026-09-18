import Link from "next/link";

export function SiteHeader({ liveCount }: { liveCount: number | null }) {
  return (
    <header className="absolute inset-x-0 top-0 z-10">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="font-serif text-[22px] italic tracking-tight text-white/90">
          Sunset Earth
        </Link>
        <nav className="flex items-center gap-5 text-xs text-white/55">
          <Link href="/explore" className="hover:text-white">Explore</Link>
          <Link href="/gallery" className="hover:text-white">Gallery</Link>
          {liveCount !== null ? (
            <span className="text-white/50">
              <span className="tnum text-white/80">{liveCount}</span> live
            </span>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
