import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { linkedinConnections } from "@/db/schema";
import { isLinkedInOAuthConfigured, LINKEDIN_MEMBER_COOKIE } from "@/lib/linkedin/oauth";

const STALE_DAYS = 30;

export async function GET() {
  const configured = isLinkedInOAuthConfigured();
  const cookieStore = await cookies();
  const activeMemberId = cookieStore.get(LINKEDIN_MEMBER_COOKIE)?.value;

  const members = await db.query.teamMembers.findMany({
    orderBy: (m, { desc }) => [desc(m.updatedAt)],
  });

  const activeMember = activeMemberId
    ? members.find((m) => m.id === activeMemberId) ?? null
    : members[0] ?? null;

  let connectionCount = 0;
  if (activeMember) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(linkedinConnections)
      .where(eq(linkedinConnections.memberId, activeMember.id));
    connectionCount = row?.count ?? 0;
  }

  const stale =
    activeMember?.lastImportAt != null
      ? Date.now() - new Date(activeMember.lastImportAt).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000
      : true;

  return NextResponse.json({
    configured,
    activeMember: activeMember
      ? {
          id: activeMember.id,
          name: activeMember.name,
          email: activeMember.email,
          linkedInPicture: activeMember.linkedInPicture,
          lastImportAt: activeMember.lastImportAt?.toISOString() ?? null,
          connectionCount,
          stale,
        }
      : null,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      lastImportAt: m.lastImportAt?.toISOString() ?? null,
    })),
  });
}
