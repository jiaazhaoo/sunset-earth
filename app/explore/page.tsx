import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { countAvailableCameras } from "@/lib/cameras";
import { ExploreClient } from "./explore-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore · Sunset Earth",
  description: "Every live camera on a map, coloured by the light it is in right now, and tonight's sunsets in order.",
};

export default async function ExplorePage() {
  const liveCount = await countAvailableCameras().catch(() => null);
  return (
    <>
      <SiteHeader liveCount={liveCount} />
      <main className="mx-auto w-full max-w-[1400px] px-5 pb-16 pt-20 sm:px-8">
        <h1 className="sr-only">Explore live cameras</h1>
        <ExploreClient />
      </main>
    </>
  );
}
