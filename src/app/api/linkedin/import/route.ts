import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { importConnectionsFromFile } from "@/lib/linkedin/connections-import";
import { LINKEDIN_MEMBER_COOKIE } from "@/lib/linkedin/oauth";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(LINKEDIN_MEMBER_COOKIE)?.value;

  if (!memberId) {
    return NextResponse.json(
      { error: "Connect LinkedIn first before importing connections" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const summary = await importConnectionsFromFile(memberId, buffer, file.name);

  return NextResponse.json({ ok: true, ...summary });
}
