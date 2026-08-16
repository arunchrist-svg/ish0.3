import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { listSavedScoutCompanies } from "@/lib/scout/save-leads";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const companies = await listSavedScoutCompanies({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });
    return NextResponse.json({ companies });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/saved-companies]");
    if (err.status !== 500) return err;
    return NextResponse.json({ error: "Could not load saved companies" }, { status: 500 });
  }
}
