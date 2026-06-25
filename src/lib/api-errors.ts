import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenant";
import { InsufficientCreditsError } from "@/lib/billing/credits";

export function handleApiError(e: unknown, logPrefix: string) {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (e instanceof InsufficientCreditsError) {
    return NextResponse.json(
      { error: e.message, required: e.required, available: e.available, code: "INSUFFICIENT_CREDITS" },
      { status: 402 },
    );
  }
  console.error(logPrefix, e);
  const message = e instanceof Error ? e.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}
