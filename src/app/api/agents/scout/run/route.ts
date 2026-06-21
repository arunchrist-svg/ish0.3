import { NextResponse } from "next/server";
import { runScoutBatch } from "@/lib/agents/scout";
import type { DataMode } from "@/lib/enrichment/types";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      cities,
      industries,
      dataMode = (process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
      companyLimit,
      maxCompaniesToProcess,
    } = body;

    const result = await runScoutBatch({
      cities,
      industries,
      dataMode,
      companyLimit,
      maxCompaniesToProcess,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/agents/scout/run]", e);
    return NextResponse.json({ error: "Scout agent failed" }, { status: 500 });
  }
}
