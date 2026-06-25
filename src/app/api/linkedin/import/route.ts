import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { importConnectionsFromFile } from "@/lib/linkedin/connections-import";
import { LINKEDIN_MEMBER_COOKIE } from "@/lib/linkedin/oauth";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const cookieStore = await cookies();
    const memberId = cookieStore.get(LINKEDIN_MEMBER_COOKIE)?.value;

    if (!memberId) {
      return NextResponse.json(
        { error: "Connect LinkedIn first before importing connections" },
        { status: 400 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    await assertCredits(ctx.tenantId, "linkedin.import", 1);

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await importConnectionsFromFile(memberId, buffer, file.name);

    await deductCredits({
      tenantId: ctx.tenantId,
      action: "linkedin.import",
      referenceId: file.name,
      idempotencyKey: `linkedin-import-${ctx.tenantId}-${Date.now()}`,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return handleApiError(e, "[linkedin/import]");
  }
}
