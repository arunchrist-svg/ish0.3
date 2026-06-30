import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push/vapid";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ enabled: false, publicKey: null });
  }
  return NextResponse.json({ enabled: true, publicKey });
}
