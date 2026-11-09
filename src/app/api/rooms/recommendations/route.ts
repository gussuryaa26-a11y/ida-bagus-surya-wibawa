import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { recommendationSchema } from "@/lib/validation";
import { recommendRooms } from "@/lib/recommendation";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    await requireApiUser(request);
    const input = await parseJson(request, recommendationSchema);
    const result = await recommendRooms(input);
    return jsonOk({
      bestUnavailable: result.bestUnavailable,
      candidates: result.candidates,
      timezone: result.timezone,
    });
  });
}
