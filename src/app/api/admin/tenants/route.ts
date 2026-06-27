import { NextResponse } from "next/server";
import { db, tenants, orgMembers, creditBalances } from "@/db";
import { count, eq } from "drizzle-orm";
import { requireSuperadmin } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { provisionTenantShell } from "@/lib/auth/provision";
import { createOrgInvite } from "@/lib/auth/invites";
import { normalizeTenantSlug } from "@/lib/auth/slug";

export async function GET() {
  try {
    await requireSuperadmin();
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        demoMode: tenants.demoMode,
        onboardingStatus: tenants.onboardingStatus,
        createdAt: tenants.createdAt,
        credits: creditBalances.balance,
      })
      .from(tenants)
      .leftJoin(creditBalances, eq(creditBalances.tenantId, tenants.id))
      .orderBy(tenants.createdAt);

    const withCounts = await Promise.all(
      rows.map(async (t) => {
        const [memberCount] = await db
          .select({ count: count() })
          .from(orgMembers)
          .where(eq(orgMembers.tenantId, t.id));
        return { ...t, memberCount: memberCount?.count ?? 0 };
      }),
    );

    return NextResponse.json({ tenants: withCounts });
  } catch (e) {
    return handleApiError(e, "[admin/tenants]");
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireSuperadmin();
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      plan?: string;
      ownerEmail?: string;
      workspaceName?: string;
    };

    if (!body.name?.trim() || !body.ownerEmail?.trim()) {
      return NextResponse.json({ error: "Organization name and owner email are required" }, { status: 400 });
    }

    const slug = body.slug ? normalizeTenantSlug(body.slug) : undefined;
    const { tenantId, slug: resolvedSlug } = await provisionTenantShell({
      orgName: body.name.trim(),
      workspaceName: body.workspaceName?.trim() || "Main Workspace",
      planSlug: body.plan,
      slug,
    });

    const invite = await createOrgInvite({
      tenantId,
      email: body.ownerEmail.trim(),
      role: "owner",
      invitedBy: admin.userId,
      invitedBySuperadmin: true,
      skipSeatCheck: true,
    });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    return NextResponse.json({
      tenant: { id: tenantId, name: tenant?.name, slug: resolvedSlug, plan: tenant?.plan },
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
    });
  } catch (e) {
    return handleApiError(e, "[admin/tenants POST]");
  }
}
