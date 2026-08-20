import { test, expect } from "./fixtures/auth";

test.describe("EMAIL-E2E-001 email settings", () => {
  test("email settings tab shows provider and send mode", async ({ authenticatedPage: page }) => {
    await page.goto("/settings?tab=email");
    await expect(page.getByRole("heading", { name: "Email" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Provider")).toBeVisible();
    await expect(page.getByRole("button", { name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend" })).toBeVisible();
    await expect(page.getByText("Mode")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dry run" })).toBeVisible();
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
