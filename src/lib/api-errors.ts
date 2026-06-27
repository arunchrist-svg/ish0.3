import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenant";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { SenderPreflightError } from "@/lib/email/sender-preflight";

export function handleApiError(e: unknown, logPrefix: string) {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof InsufficientCreditsError) {
    return NextResponse.json(
      { error: e.message, required: e.required, available: e.available, code: "INSUFFICIENT_CREDITS" },
      { status: 402 },
    );
  }
  if (e instanceof SenderPreflightError) {
    return NextResponse.json(
      { error: e.message, code: e.code, issues: e.issues, canOverride: e.canOverride },
      { status: 403 },
    );
  }
  console.error(logPrefix, e);
  const message = e instanceof Error ? e.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}
