import { isCameraAvailable } from "@/lib/availability";
import type { CameraRecord } from "@/lib/cameras";

function makeCamera(videoId: string, title: string) {
  const params = "autoplay=1&mute=1&rel=0&playsinline=1";
  const camera: CameraRecord = {
    id: videoId,
    name: title,
    embedUrl: `https://www.youtube.com/embed/${videoId}?${params}`,
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    lat: null,
    lng: null,
    timezone: null,
    city: null,
    country: null,
    tags: [],
    hostLink: null,
    ytbTitle: title,
    linkAvailable: true,
    sunsetDelay: 0,
    sunriseAdvance: 0,
  };
  return camera;
}

async function main() {
  const targets = [
    { name: "Marina di Alassio", video: "Q629TedNkRg" },
    { name: "Tembe Elephant Park", video: "gdrNUUf-cQw" },
    { name: "Manarola", video: "QpqsJKI0Wfk" },
  ];

  for (const target of targets) {
    const camera = makeCamera(target.video, target.name);
    const result = await isCameraAvailable(camera);
    console.log({
      name: target.name,
      url: camera.sourceUrl,
      result,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
