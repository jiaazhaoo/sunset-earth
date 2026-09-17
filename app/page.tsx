import { CameraViewer } from "@/components/camera-viewer";
import { SiteHeader } from "@/components/site-header";
import { SunOverview } from "@/components/sun-overview";
import {
  countAvailableCameras,
  getCameraById,
  getRandomCamera,
} from "@/lib/cameras";
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
    if (camera && camera.linkAvailable !== false) {
      initialCamera = camera;
    }
  }

  const [bestCamera, liveCount] = await Promise.all([
    initialCamera ? Promise.resolve(initialCamera) : getBestCamera(),
    countAvailableCameras().catch(() => null),
  ]);
  initialCamera = bestCamera;

  return (
    <>
      <SiteHeader liveCount={liveCount} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-24 pt-5 sm:px-6 sm:pt-10">
        <CameraViewer initialCamera={initialCamera} />
        <SunOverview currentCameraId={initialCamera?.id ?? null} />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Cameras are ranked every few minutes by weather and distance to golden hour.
          </p>
          <p>Streams via YouTube · Forecasts via Open-Meteo</p>
        </div>
      </footer>
    </>
  );
}
