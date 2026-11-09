import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson, clientIp } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { authenticate, assertSameOrigin, createSession, dashboardPathForRole } from "@/lib/auth";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const body = await parseJson(request, loginSchema);
    const ip = clientIp(request);
    const key = `login:${ip}:${body.loginId.toLowerCase()}`;
    const limit = consumeRateLimit(key, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Terlalu banyak percobaan login. Coba lagi dalam ${limit.retryAfterSeconds} detik.`,
      );
    }

    const user = await authenticate(body.loginId, body.password);
    resetRateLimit(key);
    await createSession(user.id, {
      userAgent: request.headers.get("user-agent"),
      ipAddress: ip,
    });
    await query(
      `INSERT INTO audit_logs (actor_id, actor_label, action, entity_type, entity_id, new_state, correlation_id)
       VALUES ($1, $2, 'auth.login', 'user', $1, $3, $4)`,
      [user.id, user.fullName, JSON.stringify({ role: user.role }), `login:${ip}`],
    ).catch((error) => console.error("[simpar] login audit failed", error));

    return jsonOk({
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        organizationName: user.organizationName,
      },
      redirectTo: dashboardPathForRole(user.role),
    });
  });
}
