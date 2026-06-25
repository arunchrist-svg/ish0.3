import { describe, expect, it, afterEach } from "vitest";
import { POST } from "../login/route";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  hasTestDatabase,
} from "@/test/api-helpers";

describe.skipIf(!hasTestDatabase())("AUTH-API-002 login route", () => {
  afterEach(() => {
    // no-op
  });

  it("returns 400 when email or password missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@ish.local" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 401 for invalid credentials", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_USER_EMAIL, password: "wrong-password" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets session cookie on valid login", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/");
    const cookie = res.cookies.get("ish_token");
    expect(cookie?.value).toBeTruthy();
  });
});
