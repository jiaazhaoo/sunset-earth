import { closeRoom } from "@/lib/rooms";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CleanupOptions = {
  limit?: number;
  minRoomAgeMinutes?: number;
};

export async function cleanupEmptyRooms(options?: CleanupOptions) {
  const minAgeMinutes = options?.minRoomAgeMinutes ?? 15;
  const limit = options?.limit ?? 200;
  const olderThan = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select(
      "room_id,last_empty_at,room_end_time,room_start_time,room_timezone,room_type,voice_meeting_id"
    )
    .eq("is_close", false)
    .not("last_empty_at", "is", null)
    .lt("last_empty_at", olderThan)
    .order("last_empty_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rooms = data ?? [];

  const summary = {
    checked: rooms.length,
    closed: 0,
    skipped: 0,
  };

  for (const room of rooms) {
    if (!room.last_empty_at) {
      summary.skipped++;
      continue;
    }

    try {
      const emptyAt = new Date(room.last_empty_at);
      const closedAt = new Date(
        emptyAt.getTime() + minAgeMinutes * 60 * 1000
      );
      if (Date.now() >= closedAt.getTime()) {
        await closeRoom(room.room_id, closedAt.toISOString());
        summary.closed++;
      } else {
        summary.skipped++;
      }
    } catch (error) {
      console.warn(
        `[cleanupEmptyRooms] failed to inspect room ${room.room_id}`,
        error
      );
      summary.skipped++;
    }
  }

  return summary;
}
