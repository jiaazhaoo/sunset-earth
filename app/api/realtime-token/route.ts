import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createParticipantToken,
  createRealtimeMeeting,
} from "@/lib/cloudflareRealtime";
import { getRoom, updateRoomVoiceMeeting } from "@/lib/rooms";

export async function POST(request: NextRequest) {
  try {
    const { roomId, userName } = await request.json();

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    const room = await getRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    let meetingId = room.voice_meeting_id;
    if (!meetingId) {
      meetingId = await createRealtimeMeeting(room.room_id);
      await updateRoomVoiceMeeting(room.room_id, meetingId);
    }

    const token = await createParticipantToken({
      meetingId,
      participantName: userName ?? undefined,
      customParticipantId: randomUUID(),
    });

    return NextResponse.json({
      token,
      meetingId,
    });
  } catch (error) {
    console.error("[api/realtime-token] error:", error);
    return NextResponse.json(
      { error: "Failed to create voice token" },
      { status: 500 }
    );
  }
}
