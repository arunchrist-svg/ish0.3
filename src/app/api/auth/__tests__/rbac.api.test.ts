import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { POST as loginPost } from "../login/route";
import { POST as scoutPost } from "../../agents/scout/run/route";
import { GET as accountTypeGet } from "../account-type/route";
import {
  authenticateTestUser,
  clearTestSession,
  hasTestDatabase,
  TEST_USER_EMAIL,
  TEST_TENANT_ID,
} from "@/test/api-helpers";
import { db, orgMembers, users } from "@/db";
import { eq } from "drizzle-orm";

describe.skipIf(!hasTestDatabase())("RBAC API", () => {
  afterEach(() => {
    clearTestSession();
  });

  beforeAll(async () => {
    await authenticateTestUser();
  });

  it("account-type returns tenant info for test user", async () => {
    const res = await accountTypeGet(
      new Request(`http://localhost/api/auth/account-type?email=${encodeURIComponent(TEST_USER_EMAIL)}`),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("tenant");
  });

  it("viewer gets 403 on scout run", async () => {
    const userId = (await db.select({ id: users.id }).from(users).where(eq(users.email, TEST_USER_EMAIL)).limit(1))[0]?.id;
    if (!userId) throw new Error("test user missing");

    const [member] = await db
      .select({ id: orgMembers.id, role: orgMembers.role })
      .from(orgMembers)
      .where(eq(orgMembers.userId, userId))
      .limit(1);

    const priorRole = member?.role ?? "owner";
    if (member) {
      await db.update(orgMembers).set({ role: "viewer" }).where(eq(orgMembers.id, member.id));
    }

    clearTestSession();
    await authenticateTestUser();

    const res = await scoutPost(
      new Request("http://localhost/api/agents/scout/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cities: ["Bangalore"] }),
      }),
    );
    expect(res.status).toBe(403);

    if (member) {
      await db.update(orgMembers).set({ role: priorRole }).where(eq(orgMembers.id, member.id));
    }
  });

  it("login rejects wrong password", async () => {
    clearTestSession();
    const res = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_USER_EMAIL, password: "wrong-password-xyz" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
