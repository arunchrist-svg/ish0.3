import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { enqueueWriterRun } from "@/lib/jobs/enqueue";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export const preferredRegion = ["sin1"];

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const { statuses, outreachTemplate } = (await req.json()) as {
      statuses?: string[];
      outreachTemplate?: string;
    };

    if (!statuses?.length) {
      return NextResponse.json({ error: "statuses required" }, { status: 400 });
    }

    const where = withLeadVisibility(
      ctx,
      eq(leads.tenantId, ctx.tenantId),
      inArray(leads.status, statuses),
    );

    const rows = await db.select({ id: leads.id }).from(leads).where(where);

    await Promise.all(
      rows.map((row) =>
        enqueueWriterRun({
          leadId: row.id,
          tenantId: ctx.tenantId,
          mode: "sequence",
          outreachTemplate,
        }),
      ),
    );

    return NextResponse.json({ enqueued: rows.length });
  } catch (e) {
    return handleApiError(e, "[api/agents/writer/write-all]");
  }
}
