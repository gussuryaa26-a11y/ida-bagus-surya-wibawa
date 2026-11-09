import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { calendarSchema } from "@/lib/validation";
import { createCalendarEntry, listCalendarEntries } from "@/lib/calendar";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    requireRole(user, ["academic", "facility_manager", "admin_it"]);
    return jsonOk({ entries: await listCalendarEntries() });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["academic", "facility_manager"]);
    const input = await parseJson(request, calendarSchema);
    const entry = await createCalendarEntry(input, user);
    return jsonOk({ entry }, 201);
  });
}
