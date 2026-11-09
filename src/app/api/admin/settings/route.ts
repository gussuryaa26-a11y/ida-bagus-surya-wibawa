import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";
import { getSettings, updateSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    requireRole(user, ["academic", "admin_it"]);
    return jsonOk({ settings: await getSettings() });
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["academic", "admin_it"]);
    const input = await parseJson(request, settingsSchema);
    const settings = await updateSettings(
      {
        ...input,
        revisionHoldMinutes: input.revisionHoldMinutes ?? null,
        memoOfficialTemplatePath: input.memoOfficialTemplatePath ?? null,
        dataRetentionDays: input.dataRetentionDays ?? null,
      },
      user,
    );
    return jsonOk({ settings });
  });
}
