import { NextResponse, after } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { enqueueWriterForLeads } from "@/lib/jobs/enqueue";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import { assertCredits, creditActorFrom, deductCredits } from "@/lib/billing/credits";
import { getCreditCost } from "@/lib/billing/credit-costs";
import { isZeroCostTemplateWrite } from "@/lib/email/outreach-templates";
import {
  bulkFillIshTemplateSequences,
  canBulkFillIshTemplate,
} from "@/lib/agents/writer-bulk-template";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

/** Max leads per write-all request (chunked enqueue still applies inside). */
const MAX_WRITE_ALL = 5000;

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const body = (await req.json()) as {
      statuses?: string[];
      leadIds?: string[];
      outreachTemplate?: string;
      writerMode?: string;
      occasionTheme?: string | null;
    };

    const hasStatuses = Boolean(body.statuses?.length);
    const hasLeadIds = Boolean(body.leadIds?.length);
    if (!hasStatuses && !hasLeadIds) {
      return NextResponse.json(
        { error: "statuses or leadIds required" },
        { status: 400 },
      );
    }

    let leadIds: string[] = [];

    if (hasLeadIds) {
      const requested = [...new Set(body.leadIds!.filter(Boolean))].slice(0, MAX_WRITE_ALL);
      const where = withLeadVisibility(
        ctx,
        eq(leads.tenantId, ctx.tenantId),
        inArray(leads.id, requested),
      );
      const rows = await db.select({ id: leads.id }).from(leads).where(where);
      leadIds = rows.map((r) => r.id);
    } else {
      const where = withLeadVisibility(
        ctx,
        eq(leads.tenantId, ctx.tenantId),
        inArray(leads.status, body.statuses!),
      );
      const rows = await db
        .select({ id: leads.id })
        .from(leads)
        .where(where)
        .limit(MAX_WRITE_ALL);
      leadIds = rows.map((r) => r.id);
    }

    const freeTemplate = isZeroCostTemplateWrite(body.outreachTemplate);
    const draftsPerLead = 3;
    const creditsPerSequence = freeTemplate ? 0 : getCreditCost("writer.draft") * draftsPerLead;
    const useBulkFill =
      Boolean(body.outreachTemplate) &&
      canBulkFillIshTemplate({
        outreachTemplate: body.outreachTemplate,
        writerMode: body.writerMode,
      });

    if (!leadIds.length) {
      return NextResponse.json({
        enqueued: 0,
        mode: "queued" as const,
        creditsRequired: 0,
        creditsPerSequence,
      });
    }

    if (!freeTemplate) {
      await assertCredits(
        ctx.tenantId,
        "writer.draft",
        leadIds.length * draftsPerLead,
        creditActorFrom(ctx),
      );
    }

    const batchId = crypto.randomUUID();

    // Same template for every lead: one shared reference, company swap, batch DB writes.
    if (useBulkFill && body.outreachTemplate) {
      const templateId = body.outreachTemplate;
      const occasionTheme = body.occasionTheme;
      const actor = creditActorFrom(ctx);

      after(async () => {
        try {
          const result = await bulkFillIshTemplateSequences({
            leadIds,
            tenantId: ctx.tenantId,
            outreachTemplate: templateId,
            occasionTheme,
          });
          if (!freeTemplate && result.written > 0) {
            await deductCredits({
              tenantId: ctx.tenantId,
              action: "writer.draft",
              quantity: result.written * draftsPerLead,
              referenceId: batchId,
              idempotencyKey: `writer-bulk:${batchId}`,
              ...actor,
            });
          }
        } catch (e) {
          console.error("[write-all] bulk fill failed", e);
        }
      });

      return NextResponse.json({
        enqueued: leadIds.length,
        mode: "sync" as const,
        batchId,
        bulkFill: true,
        creditsRequired: leadIds.length * creditsPerSequence,
        creditsPerSequence,
      });
    }

    const mode = await enqueueWriterForLeads({
      leadIds,
      tenantId: ctx.tenantId,
      mode: "sequence",
      outreachTemplate: body.outreachTemplate,
      writerMode: body.writerMode,
      occasionTheme: body.occasionTheme,
      batchId,
    });

    return NextResponse.json({
      enqueued: leadIds.length,
      mode,
      batchId,
      creditsRequired: leadIds.length * creditsPerSequence,
      creditsPerSequence,
    });
  } catch (e) {
    return handleApiError(e, "[api/agents/writer/write-all]");
  }
}
