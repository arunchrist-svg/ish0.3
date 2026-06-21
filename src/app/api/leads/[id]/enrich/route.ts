import { NextResponse } from "next/server";
import { enrichLeadById } from "@/lib/enrichment/enrich-lead";
import { hasAnyPaidProvider } from "@/lib/enrichment/provider-config";
import type { DataMode } from "@/lib/enrichment/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode === "paid" ? "paid" : "free") as "free" | "paid";
    const dataMode = (body.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;

    if (mode === "paid" && !hasAnyPaidProvider()) {
      return NextResponse.json(
        {
          error: "No paid enrichment keys configured. Add APOLLO_API_KEY or HUNTER_API_KEY in .env.local.",
        },
        { status: 400 },
      );
    }

    const result = await enrichLeadById({ leadId: id, mode, dataMode });

    return NextResponse.json({
      success: result.success,
      enrichment: {
        email: result.email ?? null,
        phone: result.phone ?? null,
        emailStatus: result.emailStatus,
        emailConfidence: result.emailConfidence,
        confidenceTier: result.confidenceTier,
        enrichmentSource: result.enrichmentSource,
        enrichmentProvider: result.enrichmentProvider,
        title: result.title ?? null,
        message: result.message,
      },
    });
  } catch (e) {
    console.error("[api/leads/[id]/enrich]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrichment failed" },
      { status: 500 },
    );
  }
}
