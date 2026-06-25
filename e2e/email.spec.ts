import { test, expect } from "./fixtures/auth";

test.describe("EMAIL-E2E-001 email settings", () => {
  test("email settings tab shows provider and send mode", async ({ authenticatedPage: page }) => {
    await page.goto("/settings?tab=email");
    await expect(page.getByText("SMTP", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/send mode/i).first()).toBeVisible();
  });

  test("loads email config from API", async ({ authenticatedPage: page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/settings/email") && r.ok(),
    );
    await page.goto("/settings?tab=email");
    const response = await responsePromise;
    const data = await response.json();
    expect(data.config ?? data).toBeDefined();
  });
});
