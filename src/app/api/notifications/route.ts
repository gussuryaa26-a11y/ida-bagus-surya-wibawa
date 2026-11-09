import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";
import { markReadSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    return jsonOk({ notifications: await listNotifications(user.id) });
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const input = await parseJson(request, markReadSchema);
    await markNotificationsRead(user.id, input.ids);
    return jsonOk({ ok: true });
  });
}
