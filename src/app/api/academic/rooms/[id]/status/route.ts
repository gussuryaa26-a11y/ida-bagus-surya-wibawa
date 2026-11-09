import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { roomStatusSchema } from "@/lib/validation";
import { setRoomOperationalStatusWithNotifications } from "@/lib/room-status-notifications";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["academic"]);
    const { id } = await context.params;
    const input = await parseJson(request, roomStatusSchema);
    const room = await setRoomOperationalStatusWithNotifications(id, input, user);
    return jsonOk({ room });
  });
}
