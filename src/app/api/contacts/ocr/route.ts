import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { extractBusinessCardFromImage } from "@/lib/enrichment/business-card-ocr";

export async function POST(req: Request) {
  try {
    await requireTenantContext();
    const { imageBase64 } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
    }
    if (imageBase64.length > 6_000_000) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const fields = await extractBusinessCardFromImage(imageBase64);
    return NextResponse.json({ fields });
  } catch (e) {
    return handleApiError(e, "[api/contacts/ocr]");
  }
}
