import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-errors";
import { getLeadNetworkSummary } from "@/lib/network/graph";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const network = await getLeadNetworkSummary(id);
    return NextResponse.json({ network });
  } catch (e) {
    return handleApiError(e, "[api/leads/[id]/network/summary]");
  }
}
