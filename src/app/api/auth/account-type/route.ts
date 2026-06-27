import { NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { isSuperadmin } from "@/lib/auth/platform";
import { listActiveMemberships } from "@/lib/tenant";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return NextResponse.json({ type: "unknown" });
  }

  if (isSuperadmin(user.platformRole)) {
    return NextResponse.json({ type: "platform" });
  }

  const memberships = await listActiveMemberships(user.id);
  if (memberships.length === 0) {
    return NextResponse.json({ type: "no_org" });
  }

  if (memberships.length === 1) {
    return NextResponse.json({
      type: "tenant",
      slugRequired: false,
      slug: memberships[0]!.slug,
      orgName: memberships[0]!.name,
    });
  }

  return NextResponse.json({
    type: "tenant",
    slugRequired: true,
    slugs: memberships.map((m) => ({ slug: m.slug, name: m.name })),
  });
}
