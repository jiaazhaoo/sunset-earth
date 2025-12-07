import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanupEmptyRooms } from "@/lib/roomCleanup";

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
      markedUnavailable: 0,
      markedAvailable: 0,
      unavailableReasons: {} as Record<string, number>,
      details: [] as Array<{
        id: string;
        status: "available" | "unavailable";
        reason?: string;
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
        summary.checked++;
        try {
          const checkedAt = new Date().toISOString();
          const availability = await isCameraAvailable(camera);
          if (availability.available) {
            const updates: Record<string, unknown> = {
              last_check: checkedAt,
            };
            if (!camera.linkAvailable) {
              updates.link_available = true;
            }

            await supabaseAdmin
              .from("camera_ytb")
              .update(updates)
              .eq("camera_id", camera.id);

            if (!camera.linkAvailable) {
              summary.markedAvailable++;
              summary.details.push({
                id: camera.id,
                status: "available",
              });
              console.log("[refresh-links] restored", camera.id);
            }
            continue;
          }
          summary.unavailableReasons[availability.reason] =
            (summary.unavailableReasons[availability.reason] ?? 0) + 1;

          await markUnavailable(camera.id, checkedAt);
          summary.markedUnavailable++;
          summary.details.push({
            id: camera.id,
            status: "unavailable",
            reason: availability.reason,
          });
          console.log(
            "[refresh-links] marked unavailable",
            camera.id,
            availability.reason
          );
        } catch (error) {
          console.warn("[refresh-links] failed for camera", camera.id, error);
        }
      }
    }

    const roomsCleanup = await cleanupEmptyRooms();

    const result = {
      ...summary,
      roomsCleanup,
      chainStatus: {
        refreshLinks: "success",
        replaceLink: "pending",
      },
    };

    // Trigger next task in chain: replace-link
    try {
      const baseUrl = request.nextUrl.origin;
      console.log("[refresh-links] triggering replace-link...");
      const replaceUrl = buildBypassUrl(
        `${baseUrl}/api/replace-link`,
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      );
      const replaceHeaders: Record<string, string> = {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      };
      const bypassHeader = buildBypassHeader(
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      );
      if (bypassHeader) {
        replaceHeaders["x-vercel-protection-bypass"] = bypassHeader;
      }
      const replaceResponse = await fetch(replaceUrl, {
        headers: replaceHeaders,
      });

      if (!replaceResponse.ok) {
        const errorText = await replaceResponse.text();
        console.error(
          "[refresh-links] replace-link failed:",
          replaceResponse.status,
          errorText
        );
        result.chainStatus.replaceLink = "failed";
        return NextResponse.json(result, { status: 207 }); // 207 Multi-Status
      }

      result.chainStatus.replaceLink = "triggered";
      console.log("[refresh-links] successfully triggered replace-link");
    } catch (error) {
      console.error("[refresh-links] failed to trigger replace-link:", error);
      if (result.chainStatus.replaceLink === "pending") {
        result.chainStatus.replaceLink = "failed";
      }
      return NextResponse.json(result, { status: 207 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[refresh-links]", error);
    return NextResponse.json(
      { error: "Failed to refresh links" },
      { status: 500 }
    );
  }
}

async function markUnavailable(cameraId: string, checkedAt: string) {
  const { error } = await supabaseAdmin
    .from("camera_ytb")
    .update({
      link_available: false,
      last_check: checkedAt,
    })
    .eq("camera_id", cameraId);

  if (error) {
    throw new Error(error.message);
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
