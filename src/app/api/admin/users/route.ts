import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { createUserSchema } from "@/lib/validation";
import { createUser, listUsers } from "@/lib/users";
import type { UserRole } from "@/lib/types";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    requireRole(user, ["admin_it"]);
    const role = request.nextUrl.searchParams.get("role") as UserRole | null;
    return jsonOk({
      users: await listUsers({
        search: request.nextUrl.searchParams.get("search") ?? undefined,
        role: role ?? undefined,
      }),
    });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["admin_it"]);
    const input = await parseJson(request, createUserSchema);
    const created = await createUser(
      {
        fullName: input.fullName,
        loginId: input.loginId,
        password: input.password,
        role: input.role,
        nim: input.nim ?? null,
        programStudy: input.programStudy ?? null,
        faculty: input.faculty ?? null,
        organizationId: input.organizationId ?? null,
        orgPosition: input.orgPosition ?? null,
        contactEmail: input.contactEmail ?? null,
      },
      user,
    );
    return jsonOk({ user: created }, 201);
  });
}
