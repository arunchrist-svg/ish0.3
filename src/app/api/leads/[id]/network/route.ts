import { NextResponse } from "next/server";
import { buildLeadNetworkGraph } from "@/lib/network/graph";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const graph = await buildLeadNetworkGraph(id);
    if (!graph) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ graph });
  } catch (e) {
    console.error("[api/leads/[id]/network]", e);
    return NextResponse.json({ error: "Failed to build network graph" }, { status: 500 });
  }
}
