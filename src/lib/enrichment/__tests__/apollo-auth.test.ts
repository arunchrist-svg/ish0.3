import { describe, expect, it } from "vitest";
import { ApolloAuthError, isApolloAuthError } from "@/lib/enrichment/apollo";

describe("isApolloAuthError", () => {
  it("detects typed auth failures and 401 messages", () => {
    expect(isApolloAuthError(new ApolloAuthError(401))).toBe(true);
    expect(
      isApolloAuthError(
        new Error("Apollo /mixed_people/search failed: 401 Invalid API key. See https://docs.apollo.io/reference/authentication"),
      ),
    ).toBe(true);
    expect(isApolloAuthError(new Error("Apollo hit an API rate limit"))).toBe(false);
  });
});
