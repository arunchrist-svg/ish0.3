import { NextResponse } from "next/server";
import { discoverPeople } from "@/lib/enrichment/waterfall";
import type { DataMode } from "@/lib/enrichment/types";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      companyName,
      companyDomain,
      companyWebsite,
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      searchProvider,
      enrichProvider,
      limit: requestedLimit,
      seniority = [],
      departments = [],
    } = body;

    if (!companyName) {
      return NextResponse.json({ error: "companyName required" }, { status: 400 });
    }

    const requestOverride = {
      ...(searchProvider ? { searchProvider } : {}),
      ...(enrichProvider ? { enrichProvider } : {}),
      dataMode,
    };
    const cfg = await getResolvedWorkspaceEnrichmentConfig(requestOverride);
    const discoveryConfig = { ...cfg, ...requestOverride };

    const { people, warnings, errors } = await discoverPeople({
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      companyName,
      companyDomain,
      companyWebsite,
      dataMode: cfg.dataMode,
      config: discoveryConfig,
      limit: Math.min(requestedLimit ?? cfg.scoutLeadsLimit, 25),
      seniority,
      departments,
    });

    return NextResponse.json({ people, warnings, errors });
  } catch (e) {
    console.error("[api/scout/people]", e);
    return NextResponse.json({ error: "People discovery failed" }, { status: 500 });
  }
}
