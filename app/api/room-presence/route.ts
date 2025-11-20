import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const { roomId, count } = (await request.json()) as {
      roomId?: string;
      count?: number;
    };

    if (!roomId || typeof count !== "number" || count < 0) {
      return NextResponse.json(
        { error: "roomId and count are required" },
        { status: 400 }
      );
    }

    const updates =
      count === 0
        ? { last_empty_at: new Date().toISOString() }
        : { last_empty_at: null };

    const { error } = await supabaseAdmin
      .from("rooms")
      .update(updates)
      .eq("room_id", roomId)
      .is("is_close", false);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[room-presence] error", error);
    return NextResponse.json(
      { error: "Failed to update presence" },
      { status: 500 }
    );
  }
}
