import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { startAutopilotRun } from "@/lib/agents/autopilot";
import { listAutopilotRuns, serializeAutopilotRun } from "@/lib/agents/autopilot-store";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const runs = await listAutopilotRuns({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      limit: 50,
    });
    return NextResponse.json({ runs: runs.map(serializeAutopilotRun) });
  } catch (e) {
    return handleApiError(e, "[api/autopilot/runs]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as {
      cities?: string[];
      industries?: string[];
      businesses?: string[];
      seniority?: string[];
      departments?: string[];
      locationScope?: "focus" | "interest";
    };

    const cities = (body.cities ?? []).map((city) => city.trim()).filter(Boolean);
    if (!cities.length) {
      return NextResponse.json({ error: "Select at least one city" }, { status: 400 });
    }

    const run = await startAutopilotRun({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      cities,
      industries: body.industries,
      businesses: body.businesses,
      seniority: body.seniority,
      departments: body.departments,
      locationScope: body.locationScope,
    });

    return NextResponse.json({ run: serializeAutopilotRun(run) }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/paused|select at least one city/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return handleApiError(e, "[api/autopilot/runs POST]");
  }
}
