import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/change-password",
  "/pricing",
  "/onboarding",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/account-type",
  "/api/auth/change-password",
  "/api/auth/google",
  "/api/auth/accept-invite",
  "/api/auth/invite",
  "/invite",
  "/api/auth/logout",
  "/api/auth/linkedin",
  "/api/webhooks/stripe", "/api/billing/plans",
  "/api/track/open",
  "/_next",
  "/favicon.ico",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
