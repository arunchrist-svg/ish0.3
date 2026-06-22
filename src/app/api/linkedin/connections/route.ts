import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { eq, desc } from "drizzle-orm";
import { linkedinConnections } from "@/db/schema";
import { LINKEDIN_MEMBER_COOKIE } from "@/lib/linkedin/oauth";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(LINKEDIN_MEMBER_COOKIE)?.value;
  if (!memberId) {
    return NextResponse.json({ connections: [], total: 0 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const rows = await db
    .select()
    .from(linkedinConnections)
    .where(eq(linkedinConnections.memberId, memberId))
    .orderBy(desc(linkedinConnections.connectedOn))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    connections: rows.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`,
      linkedInUrl: r.linkedInUrl,
      email: r.email,
      company: r.company,
      position: r.position,
      connectedOn: r.connectedOn?.toISOString() ?? null,
    })),
    total: rows.length,
  });
}
