import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { pin } = await req.json();
  if (pin !== process.env.APP_PIN) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ish_session", "authenticated", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return res;
}
