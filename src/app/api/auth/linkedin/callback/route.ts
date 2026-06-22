import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, teamMembers } from "@/db";
import { eq } from "drizzle-orm";
import {
  exchangeCodeForUser,
  LINKEDIN_MEMBER_COOKIE,
  LINKEDIN_STATE_COOKIE,
} from "@/lib/linkedin/oauth";
import { getDefaultTenantContext } from "@/lib/tenant";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL("/settings", url.origin);
  settingsUrl.searchParams.set("tab", "integrations");

  if (error) {
    settingsUrl.searchParams.set("linkedin", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(LINKEDIN_STATE_COOKIE)?.value;
  cookieStore.delete(LINKEDIN_STATE_COOKIE);

  if (!code || !state || !savedState || state !== savedState) {
    settingsUrl.searchParams.set("linkedin", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const user = await exchangeCodeForUser(code);
    const { tenantId, workspaceId } = await getDefaultTenantContext();

    const existing = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.linkedInSub, user.sub),
    });

    let memberId: string;
    if (existing) {
      await db
        .update(teamMembers)
        .set({
          name: user.name,
          email: user.email ?? existing.email,
          linkedInPicture: user.picture ?? existing.linkedInPicture,
          updatedAt: new Date(),
        })
        .where(eq(teamMembers.id, existing.id));
      memberId = existing.id;
    } else {
      const [inserted] = await db
        .insert(teamMembers)
        .values({
          tenantId,
          workspaceId,
          name: user.name,
          email: user.email ?? null,
          linkedInSub: user.sub,
          linkedInPicture: user.picture ?? null,
        })
        .returning();
      memberId = inserted.id;
    }

    cookieStore.set(LINKEDIN_MEMBER_COOKIE, memberId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });

    settingsUrl.searchParams.set("linkedin", "connected");
    return NextResponse.redirect(settingsUrl);
  } catch (e) {
    console.error("[linkedin/callback]", e);
    settingsUrl.searchParams.set("linkedin", "error");
    return NextResponse.redirect(settingsUrl);
  }
}
