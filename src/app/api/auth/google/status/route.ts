import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/auth/google";

export async function GET() {
  return NextResponse.json({ configured: isGoogleOAuthConfigured() });
}
