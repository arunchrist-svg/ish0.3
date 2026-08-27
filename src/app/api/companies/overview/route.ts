import { NextResponse } from "next/server";
import { enrichCompanyOverview } from "@/lib/enrichment/company-overview";
import type { CompanyOverviewInput } from "@/lib/company-overview";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json()) as CompanyOverviewInput;

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await enrichCompanyOverview({
      name: body.name.trim(),
      city: body.city,
      industry: body.industry,
      domain: body.domain,
      website: body.website,
      employees: body.employees,
      budgetBand: body.budgetBand ?? body.giftBudget,
      fitScore: body.fitScore,
      intelligenceNotes: body.intelligenceNotes,
      accountId: body.accountId,
      force: body.force,
      decisionMakerHint: body.decisionMakerHint,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/companies/overview]");
  }
}
