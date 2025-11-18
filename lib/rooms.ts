import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RoomRecord = {
  room_id: string;
  camera_id: string;
  room_created_at: string;
  room_last_time: string;
  room_timezone: string | null;
  room_type: string;
  voice_meeting_id: string | null;
};

export async function createRoom(params: {
  cameraId: string;
  roomTimezone?: string | null;
  roomType?: string;
  roomId?: string;
  voiceMeetingId?: string | null;
}) {
  const payload = {
    room_id: params.roomId ?? randomUUID(),
    camera_id: params.cameraId,
    room_timezone: params.roomTimezone ?? null,
    room_type: params.roomType ?? "public",
    voice_meeting_id: params.voiceMeetingId ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("rooms")
    .insert(payload)
    .select(
      "room_id,camera_id,room_created_at,room_last_time,room_timezone,room_type,voice_meeting_id"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as RoomRecord;
}

export async function getRoom(roomId: string) {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select(
      "room_id,camera_id,room_created_at,room_last_time,room_timezone,room_type,voice_meeting_id"
    )
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RoomRecord | null) ?? null;
}

export async function updateRoomVoiceMeeting(
  roomId: string,
  meetingId: string
) {
  const { error } = await supabaseAdmin
    .from("rooms")
    .update({ voice_meeting_id: meetingId })
    .eq("room_id", roomId);

  if (error) {
    throw new Error(error.message);
  }
}
