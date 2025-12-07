import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { refreshCamera } from "@/lib/cameraRefresh";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const BATCH_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_SECRET) {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const summary = {
      checked: 0,
      refreshed: 0,
      failed: 0,
      details: [] as Array<{
        id: string;
        status: "updated" | "skipped" | "error";
        reason?: string;
        similarity?: number;
        newLink?: string | null;
      }>,
    };

    let offset = 0;
    while (true) {
      const batch = await listCameras(BATCH_SIZE, offset);
      if (!batch.length) {
        break;
      }
      offset += batch.length;

      for (const camera of batch) {
        if (camera.linkAvailable !== false) {
          continue;
        }
        summary.checked++;
        try {
          const result = await refreshCamera(camera);
          if (result.updated) {
            summary.refreshed++;
            summary.details.push({
              id: camera.id,
              status: "updated",
              similarity: (result as { similarity?: number }).similarity,
              newLink: result.camera?.sourceUrl ?? null,
            });
            console.log("[replace-link] updated", camera.id, {
              similarity: (result as { similarity?: number }).similarity,
              newLink: result.camera?.sourceUrl,
            });
          } else {
            summary.failed++;
            const reason = (result as { reason?: string }).reason ?? "unknown";
            summary.details.push({
              id: camera.id,
              status: "skipped",
              reason,
            });
            console.log("[replace-link] skipped", camera.id, reason);
          }
        } catch (error) {
          console.warn("[replace-link] failed to refresh", camera.id, error);
          summary.failed++;
          summary.details.push({
            id: camera.id,
            status: "error",
            reason:
              error instanceof Error ? error.message : "unexpected-error",
          });
        }
      }
    }

    const result = {
      ...summary,
      chainStatus: {
        replaceLink: "success",
        weatherCache: "pending",
        computeRankings: "pending",
      },
    };

    // Trigger next task in chain: weather-cache
    try {
      const baseUrl = request.nextUrl.origin;
      console.log("[replace-link] triggering weather-cache...");
      const weatherUrl = buildBypassUrl(
        `${baseUrl}/api/weather-cache`,
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      );
      const weatherHeaders: Record<string, string> = {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      };
      const bypassHeader = buildBypassHeader(
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      );
      if (bypassHeader) {
        weatherHeaders["x-vercel-protection-bypass"] = bypassHeader;
      }
      const weatherResponse = await fetch(weatherUrl, {
        headers: weatherHeaders,
      });

      if (!weatherResponse.ok) {
        const errorText = await weatherResponse.text();
        console.error(
          "[replace-link] weather-cache failed:",
          weatherResponse.status,
          errorText
        );
        result.chainStatus.weatherCache = "failed";
        result.chainStatus.computeRankings = "skipped";
        return NextResponse.json(result, { status: 207 });
      }

      result.chainStatus.weatherCache = "triggered";
      console.log("[replace-link] successfully triggered weather-cache");
    } catch (error) {
      console.error("[replace-link] failed to trigger weather-cache:", error);
      result.chainStatus.weatherCache = "failed";
      result.chainStatus.computeRankings = "skipped";
      return NextResponse.json(result, { status: 207 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[replace-link]", error);
    return NextResponse.json(
      { error: "Failed to replace links" },
      { status: 500 }
    );
  }
}

function buildBypassUrl(url: string, bypassSecret?: string) {
  if (!bypassSecret) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set("x-vercel-set-bypass-cookie", "true");
  parsed.searchParams.set("x-vercel-protection-bypass", bypassSecret);
  return parsed.toString();
}

function buildBypassHeader(bypassSecret?: string) {
  if (!bypassSecret) {
    return null;
  }
  return bypassSecret;
}
