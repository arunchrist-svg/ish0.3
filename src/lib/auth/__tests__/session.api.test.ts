import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, sessions } from "@/db";
import { createSession, getSessionUser, deleteSession } from "@/lib/auth/session";
import {
  authenticateTestUser,
  clearTestSession,
  getTestUserId,
  hasTestDatabase,
} from "@/test/api-helpers";

describe.skipIf(!hasTestDatabase())("AUTH-API-001 session lifecycle", () => {
  afterEach(() => {
    clearTestSession();
  });

  it("creates session and resolves user", async () => {
    const userId = await getTestUserId();
    const token = await createSession(userId);
    const user = await getSessionUser(token);
    expect(user?.id).toBe(userId);
    expect(user?.email).toBe("test@ish.local");
    await deleteSession(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null for unknown token", async () => {
    expect(await getSessionUser("invalid-token-value")).toBeNull();
  });

  it("authenticateTestUser sets session mock", async () => {
    const token = await authenticateTestUser();
    expect(token).toBeTruthy();
    const user = await getSessionUser(token);
    expect(user?.email).toBe("test@ish.local");
  });
});
