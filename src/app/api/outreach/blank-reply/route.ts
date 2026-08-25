import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, leadOutreach, leads } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { ensureBlankReplyDraft } from "@/lib/email/blank-reply-draft";

/** Ensure a blank reply draft exists so the user can write their own reply. */
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
    // Allow blank reply while awaiting (outreached/hot) or after they reply.
    if (lead.status !== "replied" && lead.status !== "outreached") {
      return NextResponse.json(
        { error: "Reply draft is only available after outreach has started" },
        { status: 400 },
      );
    }

    const { outreachId } = await ensureBlankReplyDraft(leadId);
    const row = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.id, outreachId),
    });
    if (!row) {
      return NextResponse.json({ error: "Reply draft missing after create" }, { status: 500 });
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
    return handleApiError(e, "[api/outreach/blank-reply POST]");
  }
}
