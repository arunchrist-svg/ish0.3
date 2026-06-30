import { NextResponse } from "next/server";
import { mergeExtractionToAccount } from "@/lib/gift-intel/merge-accounts";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import type { ExtractedGiftIntel } from "@/lib/gift-intel/types";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json().catch(() => ({}));
    const { accountId, extraction } = body as {
      accountId?: string;
      extraction?: ExtractedGiftIntel;
    };

    if (!accountId || !extraction) {
      return NextResponse.json({ error: "accountId and extraction are required" }, { status: 400 });
    }

    await mergeExtractionToAccount({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      accountId,
      extraction,
    });

    return NextResponse.json({ ok: true, accountId });
  } catch (e) {
    return handleApiError(e, "[api/agents/gift-intel/confirm]");
  }
}
