import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validation";
import { adminUpdateUser } from "@/lib/users";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["admin_it"]);
    const { id } = await context.params;
    const input = await parseJson(request, updateUserSchema);
    await adminUpdateUser(id, input, user);
    return jsonOk({ ok: true });
  });
}
