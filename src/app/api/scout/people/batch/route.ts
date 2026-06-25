import { NextResponse } from "next/server";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { discoverPeopleBatch, discoverPeopleBatchStream } from "@/lib/enrichment/waterfall";
import type { DataMode } from "@/lib/enrichment/types";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";

type BatchCompanyInput = {
  id: string;
  name?: string;
  companyName?: string;
  domain?: string;
  companyDomain?: string;
  website?: string;
  companyWebsite?: string;
};

function mapCompanies(companies: BatchCompanyInput[]) {
  return companies.map((c) => ({
    id: c.id,
    companyName: c.name ?? c.companyName ?? "",
    companyDomain: c.domain ?? c.companyDomain,
    companyWebsite: c.website ?? c.companyWebsite,
  }));
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const url = new URL(req.url);
    const stream = url.searchParams.get("stream") === "1";
    const body = await req.json();
    const {
      companies,
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      searchProvider,
      enrichProvider,
      limit: requestedLimit,
      seniority = [],
      departments = [],
    } = body;

    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: "companies required" }, { status: 400 });
    }

    const requestOverride = {
      ...(searchProvider ? { searchProvider } : {}),
      ...(enrichProvider ? { enrichProvider } : {}),
      dataMode,
    };
    const cfg = await getResolvedWorkspaceEnrichmentConfig(requestOverride);
    const discoveryConfig = { ...cfg, ...requestOverride };
    const mappedCompanies = mapCompanies(companies);

    const batchLimit = Math.min(requestedLimit ?? cfg.scoutLeadsLimit, 25);
    await assertCredits(ctx.tenantId, "scout.contact", mappedCompanies.length * batchLimit);

    const batchParams = {
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      companies: mappedCompanies,
      dataMode: cfg.dataMode,
      config: discoveryConfig,
      limit: batchLimit,
      seniority,
      departments,
      concurrency: 3,
    };

    if (stream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      void discoverPeopleBatchStream(batchParams, async (companyId, result) => {
        await writer.write(
          encoder.encode(`${JSON.stringify({ id: companyId, ...result })}\n`),
        );
      })
        .then(async () => {
          await writer.close();
        })
        .catch(async (e) => {
          console.error("[api/scout/people/batch:stream]", e);
          await writer.abort(e);
        });

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }

    const results = await discoverPeopleBatch(batchParams);
    const contactCount = Object.values(results).reduce((sum, r) => sum + (r.people?.length ?? 0), 0);
    if (contactCount > 0) {
      await deductCredits({
        tenantId: ctx.tenantId,
        action: "scout.contact",
        quantity: contactCount,
        referenceId: `scout-batch-${Date.now()}`,
      });
    }
    return NextResponse.json({ results });
  } catch (e) {
    const { handleApiError } = await import("@/lib/api-errors");
    const errRes = handleApiError(e, "[api/scout/people/batch]");
    if (errRes.status !== 500) return errRes;
    console.error("[api/scout/people/batch]", e);
    return NextResponse.json({ error: "Batch people discovery failed" }, { status: 500 });
  }
}
