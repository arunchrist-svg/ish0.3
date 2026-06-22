import { NextResponse } from "next/server";
import { enrichCompanyOverview } from "@/lib/enrichment/company-overview";
import type { CompanyOverviewInput } from "@/lib/company-overview";

export async function POST(req: Request) {
  try {
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
      giftBudget: body.giftBudget,
      giftScore: body.giftScore,
      intelligenceNotes: body.intelligenceNotes,
      accountId: body.accountId,
      force: body.force,
      decisionMakerHint: body.decisionMakerHint,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/companies/overview]", e);
    return NextResponse.json({ error: "Failed to enrich company overview" }, { status: 500 });
  }
}
