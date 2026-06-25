import { NextResponse } from "next/server";
import { reviseWriter } from "@/lib/agents/writer-revise";
import { friendlyLLMError } from "@/lib/llm";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { leadOutreachId, message } = await req.json();
    if (!leadOutreachId) return NextResponse.json({ error: "leadOutreachId required" }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

    await assertCredits(ctx.tenantId, "writer.revision", 1);
    const result = await reviseWriter(leadOutreachId, message.trim());
    await deductCredits({ tenantId: ctx.tenantId, action: "writer.revision", referenceId: leadOutreachId });
    void checkLowBalanceAlerts(ctx.tenantId);

    return NextResponse.json(result);
  } catch (e) {
    const errRes = handleApiError(e, "[api/agents/writer/revise]");
    if (errRes.status !== 500) return errRes;
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}
