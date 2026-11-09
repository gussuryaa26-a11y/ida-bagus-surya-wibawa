import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getRoomById } from "@/lib/rooms";
import { assertStartNotPast, checkRoomAvailability } from "@/lib/availability";
import { getScheduleFreshness } from "@/lib/schedule-import";
import { getSettings } from "@/lib/settings";
import { combineDateAndTime, dateKeyInTimezone } from "@/lib/operational-clock";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireApiUser(request);
    const { id } = await context.params;
    const room = await getRoomById(id);
    if (!room) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");
    const params = request.nextUrl.searchParams;
    const settings = await getSettings();
    const date = params.get("date") ?? dateKeyInTimezone(new Date(), settings.timezone);
    const startTime = params.get("startTime") ?? "09:00";
    const endTime = params.get("endTime") ?? "11:00";
    const startAt = combineDateAndTime(date, startTime, settings.timezone);
    assertStartNotPast(startAt);
    const availability = await checkRoomAvailability({
      roomId: room.id,
      startAt,
      endAt: combineDateAndTime(date, endTime, settings.timezone),
    });
    return jsonOk({
      room,
      availability,
      scheduleFreshness: await getScheduleFreshness(),
    });
  });
}
