import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { assertSameOrigin, destroyCurrentSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    await destroyCurrentSession();
    return jsonOk({ ok: true });
  });
}
