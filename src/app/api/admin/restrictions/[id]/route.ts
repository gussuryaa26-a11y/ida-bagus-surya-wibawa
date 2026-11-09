import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { deleteRestriction } from "@/lib/rooms";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager"]);
    const { id } = await context.params;
    await deleteRestriction(id, user);
    return jsonOk({ ok: true });
  });
}
