import { afterEach, describe, expect, it } from "vitest";
import { buildInviteUrl, generateInviteToken } from "@/lib/auth/invites";

describe("invite utils", () => {
  const originalAppUrl = process.env.APP_URL;
  const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalVercelUrl = process.env.VERCEL_URL;

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
    if (originalPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
  });

  it("generateInviteToken returns 64-char hex", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it("buildInviteUrl includes token in signup path", () => {
    process.env.APP_URL = "https://sales.example.com";
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = buildInviteUrl("abc123");
    expect(url).toBe("https://sales.example.com/signup?invite=abc123");
  });

  it("buildInviteUrl prefers APP_URL over localhost NEXT_PUBLIC_APP_URL", () => {
    process.env.APP_URL = "https://sales.example.com";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3002";
    const url = buildInviteUrl("abc123");
    expect(url).toBe("https://sales.example.com/signup?invite=abc123");
  });

  it("buildInviteUrl rejects localhost-only configuration", () => {
    delete process.env.APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3002";
    delete process.env.VERCEL_URL;
    expect(() => buildInviteUrl("abc123")).toThrow(/Public app URL required/);
  });
});
