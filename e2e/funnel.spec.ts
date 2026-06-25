import { test, expect } from "./fixtures/auth";

test.describe("FUNNEL-E2E-001 yield funnel", () => {
  test("shows pipeline stages and funnel chart", async ({ authenticatedPage: page }) => {
    await page.goto("/funnel");
    await expect(page.getByRole("heading", { name: "Yield Funnel" })).toBeVisible();
    await expect(page.getByText("Pipeline Funnel")).toBeVisible();
    await expect(page.getByText("Draft Ready").first()).toBeVisible();
    await expect(page.getByText("Replied").first()).toBeVisible();
  });

  test("loads funnel data from API", async ({ authenticatedPage: page }) => {
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/funnel") && r.ok());
    await page.goto("/funnel");
    const response = await responsePromise;
    const data = await response.json();
    expect(data.leadStatuses).toBeDefined();
    expect(Array.isArray(data.leadStatuses)).toBe(true);
  });
});
