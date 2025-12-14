import { CameraViewer } from "@/components/camera-viewer";
import { getCameraById, getRandomCamera } from "@/lib/cameras";
import { fetchAvailableRankings } from "@/lib/rankings";
import type { CameraRecord } from "@/lib/cameras";

const INITIAL_RANKING_FRESHNESS_MINUTES = 30;

async function getBestCamera(): Promise<CameraRecord | null> {
  try {
    let { rows } = await fetchAvailableRankings({
      limit: 10,
      freshnessMinutes: INITIAL_RANKING_FRESHNESS_MINUTES,
    });

    if (!rows.length) {
      ({ rows } = await fetchAvailableRankings({
        limit: 10,
        freshnessMinutes: 24 * 60,
      }));
    }

    for (const row of rows) {
      const camera = await getCameraById(row.camera_id);
      if (camera && camera.linkAvailable !== false) {
        return camera;
      }
    }

    console.warn("[getBestCamera] No ranked cameras available, using random fallback");
    return await getRandomCamera();
  } catch (error) {
    console.error("[getBestCamera] Error:", error);
    return await getRandomCamera();
  }
}

type HomeProps = {
  searchParams: Promise<{ camera?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

  // Prefer camera specified via query param (but only if available)
  let initialCamera: CameraRecord | null = null;
  if (params?.camera) {
    const camera = await getCameraById(params.camera);
    // Only use this camera if its link is available
    if (camera && camera.linkAvailable !== false) {
      initialCamera = camera;
    }
  }

  // Fallback to best-ranked camera
  if (!initialCamera) {
    initialCamera = await getBestCamera();
  }

  return (
    <div className="flex min-h-screen items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-zinc-800/80 px-4 py-1.5 shadow-sm backdrop-blur-sm">
            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-400"></div>
            <span className="text-xs font-medium uppercase tracking-[0.25em] text-orange-400">
              Live Now
            </span>
          </div>

          <h1 className="text-4xl font-bold leading-tight text-zinc-50 sm:text-5xl">
            Catch sunsets around the globe<span className="bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent"> in real time</span>
          </h1>

          <p className="max-w-2xl text-base text-zinc-400">
            We surface the most cinematic live cameras so you can enjoy golden-hour views anytime.
          </p>
        </header>

        <CameraViewer initialCamera={initialCamera} />
      </main>
    </div>
  );
}
