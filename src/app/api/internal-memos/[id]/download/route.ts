import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { downloadInternalMemo } from "@/lib/memos";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const { bytes, filename } = await downloadInternalMemo(id, user);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
