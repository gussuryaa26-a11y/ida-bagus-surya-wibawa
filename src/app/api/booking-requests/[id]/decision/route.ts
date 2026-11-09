import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { decisionSchema } from "@/lib/validation";
import { decideBooking } from "@/lib/approvals";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const input = await parseJson(request, decisionSchema);
    const result = await decideBooking(
      { bookingId: id, action: input.action, reason: input.reason },
      user,
    );
    return jsonOk(result);
  });
}
