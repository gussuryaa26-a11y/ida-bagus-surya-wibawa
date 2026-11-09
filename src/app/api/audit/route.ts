import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser, requireRole } from "@/lib/auth";
import { listAuditLogs } from "@/lib/reports";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    requireRole(user, ["admin_it"]);
    const params = request.nextUrl.searchParams;
    return jsonOk({
      logs: await listAuditLogs({
        entityType: params.get("entityType") ?? undefined,
        entityId: params.get("entityId") ?? undefined,
        action: params.get("action") ?? undefined,
        search: params.get("search") ?? undefined,
        limit: params.get("limit") ? Math.min(500, Number(params.get("limit"))) : 100,
      }),
    });
  });
}
