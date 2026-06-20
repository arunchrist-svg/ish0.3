import { NextResponse } from "next/server";
import { discoverCompanies } from "@/lib/enrichment/waterfall";
import { db, accounts } from "@/db";
import { eq } from "drizzle-orm";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cities = [], industries = [], dataMode = process.env.DEFAULT_DATA_MODE ?? "free" } = body;

    const results = await discoverCompanies({
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      cities,
      industries,
      dataMode,
      limit: 30,
    });

    return NextResponse.json({ companies: results });
  } catch (e) {
    console.error("[api/scout/companies]", e);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
}
