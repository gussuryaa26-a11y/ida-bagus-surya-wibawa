import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    return jsonOk({ user });
  });
}
