import { describe, expect, it } from "vitest";
import { publicApiErrorMessage } from "@/lib/api-errors";

describe("publicApiErrorMessage", () => {
  it("does not leak SQL or session tokens from drizzle failures", () => {
    const err = new Error(
      'Failed query: select "users"."id" from "sessions" where ("sessions"."token" = $1) limit $2\nparams: abc123secret,1',
    );
    err.cause = new Error("Error connecting to database: TypeError: fetch failed");
    expect(publicApiErrorMessage(err)).toBe("Database is briefly unavailable. Retry in a moment.");
    expect(publicApiErrorMessage(err)).not.toMatch(/params:|abc123secret|select /i);
  });

  it("keeps short application errors", () => {
    expect(publicApiErrorMessage(new Error("Select at least one city"))).toBe("Select at least one city");
  });
});
