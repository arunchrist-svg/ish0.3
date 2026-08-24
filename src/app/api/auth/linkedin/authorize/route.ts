import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  buildAuthorizationUrl,
  generateOAuthState,
  isLinkedInOAuthConfigured,
  LINKEDIN_STATE_COOKIE,
} from "@/lib/linkedin/oauth";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageIntegrations } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageIntegrations(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Owner access required");
    }

  if (!isLinkedInOAuthConfigured()) {
    return NextResponse.json({ error: "LinkedIn OAuth is not configured" }, { status: 503 });
  }

  const state = generateOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizationUrl(state));
  } catch (e) {
    return handleApiError(e, "[linkedin/authorize]");
  }
}
