import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { db, leads, leadResearch } from "@/db";
import { eq } from "drizzle-orm";
import { generateWriterPlan, updateWriterPlan, writerPlanSchema } from "@/lib/agents/writer-plan";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    const { id } = await params;
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const research = await db.query.leadResearch.findFirst({ where: eq(leadResearch.leadId, id) });
    return NextResponse.json({ writerPlan: research?.writerPlan ?? null });
  } catch (e) {
    return handleApiError(e, "[api/leads/research-plan GET]");
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = writerPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid writer plan", issues: parsed.error.flatten() }, { status: 400 });
    }

    const research = await db.query.leadResearch.findFirst({ where: eq(leadResearch.leadId, id) });
    if (!research) {
      return NextResponse.json({ error: "Research brief not found" }, { status: 404 });
    }

    const writerPlan = await updateWriterPlan(id, parsed.data);
    return NextResponse.json({ writerPlan });
  } catch (e) {
    return handleApiError(e, "[api/leads/research-plan PATCH]");
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const writerPlan = await generateWriterPlan(id);
    return NextResponse.json({ writerPlan });
  } catch (e) {
    return handleApiError(e, "[api/leads/research-plan POST]");
  }
}
