import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { countSendableEmailStageLeads } from "@/lib/outreach/pending-send-count";
import { loadSendBatchJobResult } from "@/lib/outreach/send-batch-job";
import { progressFromRemaining } from "@/lib/outreach/send-batch-progress";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = (await req.json()) as {
      startedAt?: string;
      total?: number;
      statuses?: string[];
      batchId?: string;
    };

    const total = Math.max(0, body.total ?? 0);
    const batchId = typeof body.batchId === "string" ? body.batchId : "";

    if (batchId) {
      const done = await loadSendBatchJobResult(batchId);
      if (done) {
        return NextResponse.json({
          completed: done.ok,
          total: total || done.ok + done.failed,
          ok: done.ok,
          failed: done.failed,
          errors: done.errors,
          done: true,
        });
      }
    }

    const remaining = await countSendableEmailStageLeads(ctx);
    const { completed } = progressFromRemaining(total, remaining);

    return NextResponse.json({
      completed,
      total,
      ok: completed,
      failed: 0,
      errors: [],
      done: false,
    });
  } catch (e) {
    return handleApiError(e, "[api/outreach/send-batch/progress]");
  }
}
