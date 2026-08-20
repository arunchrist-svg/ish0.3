import { NextResponse } from "next/server";
import { resolveCompanyLogoUrl } from "@/lib/fetch-company-logo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  const domain = searchParams.get("domain");
  const website = searchParams.get("website");
  const json = searchParams.get("format") === "json";

  if (!name?.trim() && !domain?.trim() && !website?.trim()) {
    return json
      ? NextResponse.json({ url: null })
      : new NextResponse(null, { status: 404 });
  }

  const url = await resolveCompanyLogoUrl({ name, domain, website });
  if (!url) {
    return json ? NextResponse.json({ url: null }) : new NextResponse(null, { status: 404 });
  }

  if (json) {
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  }

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
