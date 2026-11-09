import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { getInternalJobToken } from "@/lib/env";
import { runDeadlineJob } from "@/lib/deadlines";

function hasValidJobToken(request: NextRequest): boolean {
  const expected = getInternalJobToken();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    if (!hasValidJobToken(request)) {
      const user = await requireApiUser(request);
      requireRole(user, ["admin_it"]);
    }
    const result = await runDeadlineJob();
    return jsonOk(result);
  });
}
