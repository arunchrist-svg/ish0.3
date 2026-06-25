import { test as base, expect, type Page } from "@playwright/test";

export const TEST_EMAIL = "test@ish.local";
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Test-ISH-2026!";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
