import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";

export const dynamic = "force-dynamic";

/** Serves a stored highlight frame from R2: /api/highlights/<day>/<camera>.jpg */
export async function GET(_request: NextRequest, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const path = key.join("/");
  if (!/^\d{4}-\d{2}-\d{2}\/[\w-]+\.jpg$/.test(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bucket = (getCloudflareContext().env as { HIGHLIGHTS?: R2Bucket }).HIGHLIGHTS;
  const object = await bucket?.get(path);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
