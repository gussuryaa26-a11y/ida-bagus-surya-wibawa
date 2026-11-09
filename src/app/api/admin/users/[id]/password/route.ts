import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { resetPasswordSchema } from "@/lib/validation";
import { adminResetPassword } from "@/lib/users";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["admin_it"]);
    const { id } = await context.params;
    const input = await parseJson(request, resetPasswordSchema);
    await adminResetPassword(id, input.password, user);
    return jsonOk({ ok: true });
  });
}
