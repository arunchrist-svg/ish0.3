import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import {
  loadUserPreferenceProfile,
  saveUserPreferenceProfile,
} from "@/lib/settings/preference-profile";
import {
  mergePlantSeatGoldCase,
  type PlantSeatGoldVerdict,
} from "@/lib/scout/plant-seat-gold";
import type { ScoutPersonSeat } from "@/lib/enrichment/types";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const plantCity = typeof body.plantCity === "string" ? body.plantCity.trim() : "";
    const personName = typeof body.personName === "string" ? body.personName.trim() : "";
    const verdict = body.verdict as PlantSeatGoldVerdict;
    if (!companyName || !plantCity || !personName) {
      return NextResponse.json(
        { error: "companyName, plantCity, and personName are required" },
        { status: 400 },
      );
    }
    if (verdict !== "keep" && verdict !== "drop") {
      return NextResponse.json({ error: "verdict must be keep or drop" }, { status: 400 });
    }

    const seat: ScoutPersonSeat | undefined =
      body.seat === "plant" || body.seat === "nearby_hq" ? body.seat : undefined;

    const profile = await loadUserPreferenceProfile(ctx.workspaceId);
    const nextCases = mergePlantSeatGoldCase(profile.plantSeatGoldCases ?? [], {
      companyName,
      plantCity,
      personName,
      title: typeof body.title === "string" ? body.title : undefined,
      location: typeof body.location === "string" ? body.location : undefined,
      linkedIn: typeof body.linkedIn === "string" ? body.linkedIn : undefined,
      seat,
      verdict,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    await saveUserPreferenceProfile(
      { ...profile, plantSeatGoldCases: nextCases },
      ctx.workspaceId,
    );
    return NextResponse.json({ ok: true, count: nextCases.length });
  } catch (e) {
    return handleApiError(e, "[api/scout/plant-seat-gold]");
  }
}
