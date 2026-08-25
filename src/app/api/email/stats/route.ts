import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { getOutreachAttentionCounts } from "@/lib/email/outreach-attention-counts";

/**
 * Lightweight Outreach badge counts for the sidebar.
 * Same visibility + needs-attention rules as `/api/email/overview` and `/api/hub/badge`.
 */
export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const { needsReview, replies } = await getOutreachAttentionCounts(ctx);

    return NextResponse.json(
      { needsReview, replies },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  } catch (e) {
    return handleApiError(e, "[api/email/stats]");
  }
}
