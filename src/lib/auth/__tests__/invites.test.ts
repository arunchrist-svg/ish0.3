import { describe, expect, it } from "vitest";
import { buildInviteUrl, generateInviteToken } from "@/lib/auth/invites";

describe("invite utils", () => {
  it("generateInviteToken returns 64-char hex", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it("buildInviteUrl includes token in signup path", () => {
    const url = buildInviteUrl("abc123");
    expect(url).toContain("/signup?invite=abc123");
  });
});
