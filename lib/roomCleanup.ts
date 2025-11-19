import { listMeetingParticipants } from "@/lib/cloudflareRealtime";
import { deleteRoom, listRoomsWithMeetings } from "@/lib/rooms";

type CleanupOptions = {
  limit?: number;
  minRoomAgeMinutes?: number;
};

export async function cleanupEmptyRooms(options?: CleanupOptions) {
  const minAgeMinutes = options?.minRoomAgeMinutes ?? 10;
  const limit = options?.limit ?? 200;
  const olderThan = new Date(Date.now() - minAgeMinutes * 60 * 1000);

  const rooms = await listRoomsWithMeetings({
    limit,
    olderThan,
  });

  const summary = {
    checked: rooms.length,
    closed: 0,
    skipped: 0,
  };

  for (const room of rooms) {
    if (!room.voice_meeting_id) {
      summary.skipped++;
      continue;
    }

    try {
      const participants = await listMeetingParticipants(room.voice_meeting_id);
      if (participants.length === 0) {
        await deleteRoom(room.room_id);
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
