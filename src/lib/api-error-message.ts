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

function isDatabaseQuotaError(e: unknown): boolean {
  return /exceeded the quota|upgrade your plan to increase limits|insufficient_resources/i.test(
    errorChainText(e),
  );
}

function isDrizzleQueryError(e: unknown): boolean {
  const text = errorChainText(e);
  return /failed query:/i.test(text) || (e instanceof Error && e.name === "NeonDbError");
}

export function isSafeToExposeDbOutage(e: unknown): boolean {
  return (
    isDatabaseQuotaError(e) ||
    isMissingSchemaError(e) ||
    isTransientDbError(e) ||
    isDrizzleQueryError(e)
  );
}

/** Safe copy for clients. Never include SQL, bind params, or session tokens. */
export function publicApiErrorMessage(e: unknown): string {
  if (
    e instanceof Error &&
    e.message &&
    !isDrizzleQueryError(e) &&
    !isTransientDbError(e) &&
    !isDatabaseQuotaError(e)
  ) {
    if (e.message.length < 280 && !/params:\s/i.test(e.message)) return e.message;
  }
  if (isDatabaseQuotaError(e)) {
    return "The database project is over quota. Upgrade the plan or wait for the limit to reset, then refresh.";
  }
  if (isMissingSchemaError(e)) {
    return "Database is missing a recent schema update. Apply the latest SQL migrations, then retry.";
  }
  if (isTransientDbError(e) || isDrizzleQueryError(e)) {
    return "Database is briefly unavailable. Retry in a moment.";
  }
  return "Request failed";
}

export {
  isDatabaseQuotaError,
  isDrizzleQueryError,
  isMissingSchemaError,
  isTransientDbError,
};
