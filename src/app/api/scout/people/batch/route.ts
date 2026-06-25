import { NextResponse } from "next/server";
import { discoverPeopleBatch, discoverPeopleBatchStream } from "@/lib/enrichment/waterfall";
import type { DataMode } from "@/lib/enrichment/types";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";

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

    const batchParams = {
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      companies: mappedCompanies,
      dataMode: cfg.dataMode,
      config: discoveryConfig,
      limit: Math.min(requestedLimit ?? cfg.scoutLeadsLimit, 25),
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
    return NextResponse.json({ results });
  } catch (e) {
    console.error("[api/scout/people/batch]", e);
    return NextResponse.json({ error: "Batch people discovery failed" }, { status: 500 });
  }
}
