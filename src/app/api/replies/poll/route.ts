import { NextResponse } from "next/server";
import { pollRepliesForAllWorkspaces, pollRepliesForWorkspace } from "@/lib/email/reply-poller";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  try {
    if (isCronAuthorized(req)) {
      const results = await pollRepliesForAllWorkspaces();
      const processed = results.reduce((sum, r) => sum + r.processed, 0);
      return NextResponse.json({ ok: true, processed, results });
    }

    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const result = await pollRepliesForWorkspace(ctx.workspaceId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(e, "[api/replies/poll]");
  }
}
