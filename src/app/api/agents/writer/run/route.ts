import { NextResponse } from "next/server";
import { runWriter } from "@/lib/agents/writer";
import { db, leadOutreach } from "@/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const outreachId = await runWriter(leadId);

    const draft = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.id, outreachId),
    });

    return NextResponse.json({ draft });
  } catch (e) {
    console.error("[api/agents/writer/run]", e);
    return NextResponse.json({ error: "Writer failed" }, { status: 500 });
  }
}
