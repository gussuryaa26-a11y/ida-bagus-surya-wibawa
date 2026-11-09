import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { listRooms } from "@/lib/rooms";
import { getScheduleFreshness } from "@/lib/schedule-import";
import type { RoomCategory } from "@/lib/types";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await requireApiUser(request);
    const params = request.nextUrl.searchParams;
    const category = params.get("category") as RoomCategory | null;
    const rooms = await listRooms({
      search: params.get("search") ?? undefined,
      category: category ?? undefined,
      minCapacity: params.get("minCapacity") ? Number(params.get("minCapacity")) : undefined,
      facility: params.get("facility") ?? undefined,
      includeInactive: params.get("includeInactive") === "true",
    });
    const freshness = await getScheduleFreshness();
    return jsonOk({ rooms, scheduleFreshness: freshness });
  });
}
