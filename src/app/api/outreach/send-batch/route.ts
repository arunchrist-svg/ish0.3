import { NextResponse, after } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, leads } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { batchQueueInitialEmails, prepareBatchQueue } from "@/lib/outreach/batch-send-initial";
import { SenderPreflightError } from "@/lib/email/sender-preflight";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import { runSequencer } from "@/lib/agents/sequencer";
import { withoutPendingInitialEmailSend } from "@/lib/outreach/pending-send-count";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

const MAX_SEND_ALL = 5000;
/** Above this size, queue in the background and let the client poll progress. */
const BACKGROUND_THRESHOLD = 20;

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as {
      leadIds?: unknown;
      statuses?: unknown;
      overridePreflight?: unknown;
      processDue?: unknown;
    };

    const requestedLeadIds = Array.isArray(body.leadIds)
      ? body.leadIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    const requestedStatuses = Array.isArray(body.statuses)
      ? body.statuses.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];
    const hasStatuses = requestedStatuses.length > 0;
    const hasLeadIds = requestedLeadIds.length > 0;

    if (!hasStatuses && !hasLeadIds) {
      return NextResponse.json({ error: "leadIds or statuses required" }, { status: 400 });
    }

    let leadIds: string[] = [];

    if (hasLeadIds) {
      const requested = [...new Set(requestedLeadIds)].slice(0, MAX_SEND_ALL);
      const where = withLeadVisibility(
        ctx,
        eq(leads.tenantId, ctx.tenantId),
        inArray(leads.id, requested),
      );
      const rows = await db.select({ id: leads.id }).from(leads).where(where);
      leadIds = rows.map((r) => r.id);
    } else {
      const statuses = requestedStatuses;
      const where = withLeadVisibility(
        ctx,
        eq(leads.tenantId, ctx.tenantId),
        inArray(leads.status, statuses),
        withoutPendingInitialEmailSend(),
      );
      const rows = await db
        .select({ id: leads.id })
        .from(leads)
        .where(where)
        .limit(MAX_SEND_ALL);
      leadIds = rows.map((r) => r.id);
    }

    if (leadIds.length === 0) {
      return NextResponse.json({ error: "No matching leads" }, { status: 400 });
    }

    const overridePreflight = Boolean(body.overridePreflight);
    const processDue = Boolean(body.processDue);

    if (leadIds.length > BACKGROUND_THRESHOLD) {
      const batchId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const prepared = await prepareBatchQueue(ctx, { leadIds, overridePreflight });

      after(async () => {
        try {
          await batchQueueInitialEmails(ctx, {
            leadIds,
            overridePreflight,
            prepared,
            batchId,
          });
          if (processDue) {
            await runSequencer();
          }
        } catch (e) {
          console.error("[api/outreach/send-batch] background queue failed", e);
        }
      });

      return NextResponse.json({
        mode: "background",
        batchId,
        startedAt,
        total: leadIds.length,
        ok: 0,
        failed: 0,
        errors: [],
        results: [],
        plan: prepared.plan,
      });
    }

    const result = await batchQueueInitialEmails(ctx, {
      leadIds,
      overridePreflight,
    });

    const response: Record<string, unknown> = { mode: "queued", ...result };

    if (processDue) {
      response.sequencer = await runSequencer();
    }

    return NextResponse.json(response);
  } catch (e) {
    if (e instanceof SenderPreflightError) {
      const critical = e.issues.filter((i) => i.severity === "critical");
      return NextResponse.json(
        {
          code: "SENDER_PREFLIGHT_FAILED",
          error: e.message,
          issues: critical,
          canOverride: e.canOverride,
        },
        { status: 422 },
      );
    }
    return handleApiError(e, "[api/outreach/send-batch]");
  }
}
