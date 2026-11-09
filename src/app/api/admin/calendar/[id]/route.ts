import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { calendarSchema } from "@/lib/validation";
import { deleteCalendarEntry, updateCalendarEntry } from "@/lib/calendar";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["academic", "facility_manager"]);
    const { id } = await context.params;
    const input = await parseJson(request, calendarSchema);
    const entry = await updateCalendarEntry(id, input, user);
    return jsonOk({ entry });
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["academic", "facility_manager"]);
    const { id } = await context.params;
    await deleteCalendarEntry(id, user);
    return jsonOk({ ok: true });
  });
}
