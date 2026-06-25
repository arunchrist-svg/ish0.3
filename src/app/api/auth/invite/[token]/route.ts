import { NextResponse } from "next/server";
import { getInviteByToken } from "@/lib/auth/invites";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });
  }
  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    tenantName: invite.tenantName,
    expiresAt: invite.expiresAt,
  });
}
