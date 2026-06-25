import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession } from "@/lib/auth/session";
import { sessionMock } from "./session-mock";

export const TEST_USER_EMAIL = "test@ish.local";
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Test-ISH-2026!";
export const TEST_LEAD_DRAFT_READY_ID = "00000000-0000-0000-0000-000000000112";
export const TEST_LEAD_REPLIED_ID = "00000000-0000-0000-0000-000000000113";

export function hasTestDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getTestUserId(): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USER_EMAIL))
    .limit(1);
  if (!user) {
    throw new Error(`Test user not found (${TEST_USER_EMAIL}). Run: npx tsx scripts/seed-test-user.ts`);
  }
  return user.id;
}

export async function authenticateTestUser(): Promise<string> {
  const userId = await getTestUserId();
  const token = await createSession(userId);
  sessionMock.token = token;
  return token;
}

export function clearTestSession(): void {
  sessionMock.token = undefined;
}
