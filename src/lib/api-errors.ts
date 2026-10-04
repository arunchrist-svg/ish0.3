import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenant";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { SenderPreflightError } from "@/lib/email/sender-preflight";
import {
  isDatabaseQuotaError,
  isDrizzleQueryError,
  isMissingSchemaError,
  isTransientDbError,
  publicApiErrorMessage,
} from "@/lib/api-error-message";

export {
  isSafeToExposeDbOutage,
  publicApiErrorMessage,
} from "@/lib/api-error-message";

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
  if (isDatabaseQuotaError(e)) {
    return NextResponse.json(
      { error: publicApiErrorMessage(e), code: "DB_QUOTA" },
      { status: 503 },
    );
  }
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
