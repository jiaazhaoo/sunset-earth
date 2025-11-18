import { NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";

export async function GET() {
  try {
    const cameras = await listCameras();
    return NextResponse.json({ cameras });
  } catch (err) {
    console.error("[api/cameras] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
