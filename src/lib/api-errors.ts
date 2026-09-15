import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenant";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { SenderPreflightError } from "@/lib/email/sender-preflight";

function errorChainText(e: unknown): string {
  const parts: string[] = [];
  let current: unknown = e;
  for (let i = 0; i < 6 && current; i++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join("\n");
}

function isMissingSchemaError(e: unknown): boolean {
  return /column .* does not exist|relation .* does not exist/i.test(errorChainText(e));
}

function isTransientDbError(e: unknown): boolean {
  return /fetch failed|error connecting to database|connection terminated|econnreset|etimedout|enotfound|socket hang up|neon.*timeout|too many connections|remaining connection slots/i.test(
    errorChainText(e),
  );
}

function isDrizzleQueryError(e: unknown): boolean {
  const text = errorChainText(e);
  return /failed query:/i.test(text) || (e instanceof Error && e.name === "NeonDbError");
}

/** Safe copy for API clients. Never include SQL, bind params, or session tokens. */
export function publicApiErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message && !isDrizzleQueryError(e) && !isTransientDbError(e)) {
    if (e.message.length < 280 && !/params:\s/i.test(e.message)) return e.message;
  }
  if (isMissingSchemaError(e)) {
    return "Database is missing a recent schema update. Apply the latest SQL migrations, then retry.";
  }
  if (isTransientDbError(e) || isDrizzleQueryError(e)) {
    return "Database is briefly unavailable. Retry in a moment.";
  }
  return "Request failed";
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
        error: publicApiErrorMessage(e),
        code: "SCHEMA_DRIFT",
      },
      { status: 503 },
    );
  }
  if (isTransientDbError(e) || isDrizzleQueryError(e)) {
    return NextResponse.json(
      { error: publicApiErrorMessage(e), code: "DB_UNAVAILABLE" },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: publicApiErrorMessage(e) }, { status: 500 });
}
