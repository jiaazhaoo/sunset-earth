import { isCameraAvailable } from "@/lib/availability";
import { buildCameraStub } from "@/lib/cameras";

const makeCamera = buildCameraStub;

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
