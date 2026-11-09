import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseSearchParams } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { availabilityQuerySchema } from "@/lib/validation";
import { listRoomAvailability } from "@/lib/recommendation";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await requireApiUser(request);
    const query = parseSearchParams(request.nextUrl.searchParams, availabilityQuerySchema);
    const result = await listRoomAvailability({
      date: query.date,
      startTime: query.startTime,
      endTime: query.endTime,
      participantCount: query.participantCount,
      requiredFacilities: query.facilities ? query.facilities.split(",").filter(Boolean) : [],
    });
    return jsonOk(result);
  });
}
