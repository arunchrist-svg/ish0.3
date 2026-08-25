import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, leadOutreach, leads } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { ensureCatalogOnOpenDraft } from "@/lib/email/promote-catalog-on-open";
import { CATALOG_ON_OPEN_SEQUENCE_POSITION } from "@/lib/email/ish-festive-catalog";

/** Ensure the If Opened A/B catalogue draft exists for this lead. */
export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json().catch(() => ({}));
    const leadId = (body as { leadId?: string }).leadId;
    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }

    const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const id = await ensureCatalogOnOpenDraft(leadId);
    if (!id) {
      return NextResponse.json({ error: "Could not create If Opened draft" }, { status: 500 });
    }

    const row = await db.query.leadOutreach.findFirst({
      where: and(
        eq(leadOutreach.leadId, leadId),
        eq(leadOutreach.sequencePosition, CATALOG_ON_OPEN_SEQUENCE_POSITION),
      ),
    });
    if (!row) {
      return NextResponse.json({ error: "If Opened draft missing after create" }, { status: 500 });
    }

    const draft = toWriterDraft(row, { sequencePosition: row.sequencePosition ?? undefined });
    const sequence = await db.query.leadOutreach.findMany({
      where: and(eq(leadOutreach.leadId, leadId), isNotNull(leadOutreach.sequencePosition)),
      orderBy: (t, { asc }) => [asc(t.sequencePosition)],
    });
    const drafts = sequence.map((d) =>
      toWriterDraft(d, { sequencePosition: d.sequencePosition ?? undefined }),
    );

    return NextResponse.json({ draft, drafts });
  } catch (e) {
    return handleApiError(e, "[api/outreach/catalog-on-open POST]");
  }
}
