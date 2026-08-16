import { NextResponse } from "next/server";
import { createAccountFromExtraction, mergeExtractionToAccount } from "@/lib/brand-intel/merge-accounts";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import type { ExtractedGiftIntel } from "@/lib/brand-intel/types";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json().catch(() => ({}));
    const { accountId, extraction } = body as {
      accountId?: string;
      extraction?: ExtractedGiftIntel;
    };

    if (!extraction) {
      return NextResponse.json({ error: "extraction is required" }, { status: 400 });
    }

    if (!accountId) {
      const created = await createAccountFromExtraction({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        extraction,
      });
      return NextResponse.json({ ok: true, accountId: created.accountId, created: true, name: created.name });
    }

    await mergeExtractionToAccount({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      accountId,
      extraction,
    });

    return NextResponse.json({ ok: true, accountId });
  } catch (e) {
    return handleApiError(e, "[api/agents/brand-intel/confirm]");
  }
}
