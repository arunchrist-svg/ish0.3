import { NextResponse } from "next/server";
import { discoverPeople } from "@/lib/enrichment/waterfall";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      companyName,
      companyDomain,
      dataMode = process.env.DEFAULT_DATA_MODE ?? "free",
    } = body;

    if (!companyName) {
      return NextResponse.json({ error: "companyName required" }, { status: 400 });
    }

    const people = await discoverPeople({
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      companyName,
      companyDomain,
      dataMode,
      limit: 15,
    });

    return NextResponse.json({ people });
  } catch (e) {
    console.error("[api/scout/people]", e);
    return NextResponse.json({ error: "People discovery failed" }, { status: 500 });
  }
}
