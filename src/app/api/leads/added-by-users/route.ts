import { NextResponse } from "next/server";
import { db, orgMembers, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.tenantId, ctx.tenantId), eq(orgMembers.status, "active")))
      .orderBy(users.name);

    const usersList = members.map((member) => ({
      id: member.id,
      name: member.name?.trim() || member.email,
      email: member.email,
    }));

    return NextResponse.json({ users: usersList });
  } catch (e) {
    return handleApiError(e, "[api/leads/added-by-users]");
  }
}
