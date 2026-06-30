import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { runExactSearch } from "@/lib/agents/search-agent";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = await req.json();
    const { query, personName, city, selectedCompanyIndex, selectedPersonIndex } = body;

    if (!query?.trim() && !personName?.trim()) {
      return NextResponse.json({ error: "query or personName required" }, { status: 400 });
    }

    const result = await runExactSearch({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      query: query ?? "",
      personName,
      city,
      selectedCompanyIndex,
      selectedPersonIndex,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/scout/exact]");
  }
}
