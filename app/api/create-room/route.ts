import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRoom } from "@/lib/rooms";
import { createRealtimeMeeting } from "@/lib/cloudflareRealtime";

export async function POST(request: NextRequest) {
  try {
    const { cameraId, timezone } = await request.json();

    if (!cameraId) {
      return NextResponse.json(
        { error: "cameraId is required" },
        { status: 400 }
      );
    }

    const newRoomId = randomUUID();
    const voiceMeetingId = await createRealtimeMeeting(newRoomId);

    const room = await createRoom({
      cameraId,
      roomTimezone: timezone ?? null,
      roomId: newRoomId,
      voiceMeetingId,
    });

    return NextResponse.json({ roomId: room.room_id });
  } catch (error) {
    console.error("[api/create-room] error:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
