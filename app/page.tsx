import type { Metadata } from "next";
import { CameraViewer } from "@/components/camera-viewer";
import { SiteHeader } from "@/components/site-header";
import {
  countAvailableCameras,
  getCameraById,
  getRandomCamera,
} from "@/lib/cameras";
import { fetchAvailableRankings } from "@/lib/rankings";
import { queryOne } from "@/lib/db";
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

/**
 * Share cards: a camera link (?camera=ID) gets the camera's name, its place
 * description and the stream's cover as og:image, so a pasted link shows a
 * picture of the view instead of a blank card.
 */
export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const params = await searchParams;
  if (!params?.camera) return {};
  const camera = await getCameraById(params.camera).catch(() => null);
  if (!camera) return {};
  const row = await queryOne<{ description: string | null }>(
    `SELECT description FROM camera_ytb WHERE camera_id = ?`,
    camera.id
  ).catch(() => null);
  const videoId = camera.sourceUrl?.match(/[?&]v=([\w-]{11})/)?.[1];
  const where = [camera.city, camera.country].filter(Boolean).join(", ");
  const title = `${camera.name}${where ? ` — ${where}` : ""} · Sunset Earth`;
  const description = row?.description || `Live camera in ${where || camera.name}, ranked for golden hour on Sunset Earth.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      url: `https://sunset-earth.com/?camera=${encodeURIComponent(camera.id)}`,
      images: videoId ? [{ url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

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
      <main className="mx-auto flex min-h-dvh w-full max-w-[1400px] items-start px-5 pb-10 pt-20 sm:px-8 lg:items-center lg:pt-14">
        <CameraViewer initialCamera={initialCamera} />
      </main>
    </>
  );
}
