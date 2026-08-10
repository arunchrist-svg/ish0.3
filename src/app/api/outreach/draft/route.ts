import { NextResponse } from "next/server";
import { db, leadOutreach, leads } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function PATCH(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const {
      leadOutreachId,
      emailBody,
      emailBodyB,
      emailBodyC,
      subjectA,
      subjectB,
      subjectC,
      chosenSubjectKey,
      chosenBodyKey,
    } = body as {
      leadOutreachId: string;
      emailBody?: string;
      emailBodyB?: string;
      emailBodyC?: string;
      subjectA?: string;
      subjectB?: string;
      subjectC?: string;
      chosenSubjectKey?: string;
      chosenBodyKey?: string;
    };

    if (!leadOutreachId) {
      return NextResponse.json({ error: "leadOutreachId required" }, { status: 400 });
    }

    const updates: Partial<typeof leadOutreach.$inferInsert> = {};
    if (emailBody !== undefined) updates.emailBody = emailBody;
    if (emailBodyB !== undefined) updates.emailBodyB = emailBodyB;
    if (emailBodyC !== undefined) updates.emailBodyC = emailBodyC;
    if (subjectA !== undefined) updates.subjectA = subjectA;
    if (subjectB !== undefined) updates.subjectB = subjectB;
    if (subjectC !== undefined) updates.subjectC = subjectC;
    if (chosenSubjectKey !== undefined) updates.chosenSubjectKey = chosenSubjectKey;
    if (chosenBodyKey !== undefined) updates.chosenBodyKey = chosenBodyKey;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [existing] = await db
      .select({ outreach: leadOutreach, lead: leads })
      .from(leadOutreach)
      .innerJoin(leads, eq(leads.id, leadOutreach.leadId))
      .where(eq(leadOutreach.id, leadOutreachId))
      .limit(1);

    if (!existing || existing.lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const [row] = await db
      .update(leadOutreach)
      .set(updates)
      .where(eq(leadOutreach.id, leadOutreachId))
      .returning();

    if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      subjectA: row.subjectA,
      subjectB: row.subjectB,
      subjectC: row.subjectC,
      emailBody: row.emailBody,
      emailBodyB: row.emailBodyB,
      emailBodyC: row.emailBodyC,
      chosenSubjectKey: row.chosenSubjectKey,
      chosenBodyKey: row.chosenBodyKey,
    });
  } catch (e) {
    return handleApiError(e, "[api/outreach/draft]");
  }
}
