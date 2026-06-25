import { test, expect } from "./fixtures/auth";

test.describe("LEADS-E2E-001 lead accelerator", () => {
  test("loads leads queue with seeded test contact", async ({ authenticatedPage: page }) => {
    await page.goto("/leads");
    await expect(page.getByRole("button", { name: /Priya Sharma/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Test Corp India").first()).toBeVisible();
  });

  test("fetches leads from API", async ({ authenticatedPage: page }) => {
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/leads") && r.ok());
    await page.goto("/leads");
    const response = await responsePromise;
    const data = await response.json();
    expect(data.leads?.length).toBeGreaterThan(0);
    const names = data.leads.map((l: { name: string }) => l.name);
    expect(names).toContain("Priya Sharma");
  });
});
