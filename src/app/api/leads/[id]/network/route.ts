import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-errors";
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
    return handleApiError(e, "[api/leads/[id]/network]");
  }
}
