import { config as loadEnv } from "dotenv";
import { listCameras } from "../lib/cameras";
import { refreshCamera } from "../lib/cameraRefresh";

loadEnv({ path: ".env.local" });

async function main() {
  const cameras = await listCameras(500);
  const disabled = cameras.filter((camera) => camera.linkAvailable === false);

  const summary = {
    checked: disabled.length,
    refreshed: 0,
    failed: 0,
    details: [] as Array<{ id: string; updated: boolean; reason?: string }>,
  };

  for (const camera of disabled) {
    try {
      const result = await refreshCamera(camera);
      summary.details.push({
        id: camera.id,
        updated: result.updated,
        reason: (result as { reason?: string }).reason,
      });
      if (result.updated) {
        summary.refreshed++;
      } else {
        summary.failed++;
      }
    } catch (error) {
      summary.details.push({
        id: camera.id,
        updated: false,
        reason: error instanceof Error ? error.message : "unknown-error",
      });
      summary.failed++;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
