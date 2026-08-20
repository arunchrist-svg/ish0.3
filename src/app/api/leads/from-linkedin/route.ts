import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import {
  createLeadFromLinkedInUrl,
  LinkedInProfileIncompleteError,
} from "@/lib/leads/from-linkedin";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const body = (await req.json()) as {
      linkedInUrl?: string;
      linkedIn?: string;
      enrich?: boolean;
      score?: number;
    };

    const linkedInUrl = (body.linkedInUrl ?? body.linkedIn)?.trim();
    if (!linkedInUrl) {
      return NextResponse.json({ error: "LinkedIn profile URL is required" }, { status: 400 });
    }

    const result = await createLeadFromLinkedInUrl({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      linkedInUrl,
      enrich: body.enrich,
      score: body.score,
    });

    return NextResponse.json(
      {
        ok: true,
        id: result.id,
        existing: result.existing,
        enriched: result.enriched === true,
        profile: result.profile,
      },
      { status: result.existing ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof LinkedInProfileIncompleteError) {
      return NextResponse.json(
        {
          error: e.message,
          code: "LINKEDIN_PROFILE_INCOMPLETE",
          partial: e.partial,
        },
        { status: 422 },
      );
    }
    return handleApiError(e, "[api/leads/from-linkedin POST]");
  }
}
