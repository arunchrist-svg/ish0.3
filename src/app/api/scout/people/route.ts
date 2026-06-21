import { NextResponse } from "next/server";
import { discoverPeople } from "@/lib/enrichment/waterfall";
import { getScoutLeadsLimit } from "@/lib/enrichment/config";
import type { DataMode } from "@/lib/enrichment/types";

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

    const { people, warnings, errors } = await discoverPeople({
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      companyName,
      companyDomain,
      companyWebsite,
      dataMode,
      config: {
        ...(searchProvider ? { searchProvider } : {}),
        ...(enrichProvider ? { enrichProvider } : {}),
      },
      limit: Math.min(requestedLimit ?? getScoutLeadsLimit(), 25),
      seniority,
      departments,
    });

    return NextResponse.json({ people, warnings, errors });
  } catch (e) {
    console.error("[api/scout/people]", e);
    return NextResponse.json({ error: "People discovery failed" }, { status: 500 });
  }
}
