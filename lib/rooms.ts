import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RoomRecord = {
  room_id: string;
  camera_id: string;
  room_start_time: string;
  room_end_time: string;
  last_empty_at: string | null;
  room_timezone: string | null;
  room_type: string;
  voice_meeting_id: string | null;
  is_close: boolean;
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
    room_end_time: new Date().toISOString(),
    is_close: false,
    last_empty_at: null,
  };

  const { data, error } = await supabaseAdmin
    .from("rooms")
    .insert(payload)
    .select(
      "room_id,camera_id,room_start_time,room_end_time,last_empty_at,room_timezone,room_type,voice_meeting_id,is_close"
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
      "room_id,camera_id,room_start_time,room_end_time,last_empty_at,room_timezone,room_type,voice_meeting_id,is_close"
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

export async function listRoomsWithMeetings(options?: {
  limit?: number;
  olderThan?: Date;
}) {
  const limit = options?.limit ?? 200;
  const query = supabaseAdmin
    .from("rooms")
    .select(
      "room_id,camera_id,room_start_time,room_end_time,last_empty_at,room_timezone,room_type,voice_meeting_id,is_close"
    )
    .not("voice_meeting_id", "is", null)
    .eq("is_close", false)
    .order("room_start_time", { ascending: true })
    .limit(limit);

  if (options?.olderThan) {
    query.lt("room_start_time", options.olderThan.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data as RoomRecord[]) ?? [];
}

export async function closeRoom(roomId: string, closedAt?: string) {
  const timestamp = closedAt ?? new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("rooms")
    .update({
      is_close: true,
      room_end_time: timestamp,
      last_empty_at: timestamp,
    })
    .eq("room_id", roomId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateRoomLastEmpty(
  roomId: string,
  lastEmptyAt: string | null
) {
  const { error } = await supabaseAdmin
    .from("rooms")
    .update({ last_empty_at: lastEmptyAt })
    .eq("room_id", roomId);

  if (error) {
    throw new Error(error.message);
  }
}
