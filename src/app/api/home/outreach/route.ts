import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getHomeOutreachSnapshot } from "@/lib/email/home-outreach-snapshot";
import { reconcileNonHumanRepliedLeads } from "@/lib/email/reconcile-non-human-replies";

export const preferredRegion = ["sin1"];

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    await reconcileNonHumanRepliedLeads(ctx.workspaceId);
    const { searchParams } = new URL(req.url);
    const snapshot = await getHomeOutreachSnapshot(ctx, {
      period: searchParams.get("period"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, max-age=15" },
    });
  } catch (e) {
    return handleApiError(e, "[api/home/outreach]");
  }
}
