import { NextResponse } from "next/server";
import { resolveCompanyLogoUrl } from "@/lib/fetch-company-logo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  const domain = searchParams.get("domain");
  const website = searchParams.get("website");

  if (!name?.trim() && !domain?.trim() && !website?.trim()) {
    return new NextResponse(null, { status: 404 });
  }

  const url = await resolveCompanyLogoUrl({ name, domain, website });
  if (!url) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
