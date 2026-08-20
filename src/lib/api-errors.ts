import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenant";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { SenderPreflightError } from "@/lib/email/sender-preflight";

function isMissingSchemaError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message);
}

export function handleApiError(e: unknown, logPrefix: string) {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof InsufficientCreditsError) {
    return NextResponse.json(
      { error: e.message, required: e.required, available: e.available, scope: e.scope, code: "INSUFFICIENT_CREDITS" },
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
  if (isMissingSchemaError(e)) {
    return NextResponse.json(
      {
        error:
          "Database is missing a recent schema update. Apply the latest SQL migrations, then retry Scout.",
        code: "SCHEMA_DRIFT",
      },
      { status: 503 },
    );
  }
  const message = e instanceof Error ? e.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}
