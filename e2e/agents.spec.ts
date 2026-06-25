import { test, expect } from "./fixtures/auth";

const MOCK_SCOUT_RESULT = {
  runId: "00000000-0000-0000-0000-000000000999",
  companiesDiscovered: 2,
  leadsSaved: 1,
  leadsSkipped: 0,
  errors: [],
};

test.describe("AGENT-E2E-001 agents page", () => {
  test("agents page shows scout agent card", async ({ authenticatedPage: page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scout Agent" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Run Scout Agent/i })).toBeVisible();
  });

  test("run scout shows success with mocked API response", async ({ authenticatedPage: page }) => {
    await page.route("**/api/agents/scout/run", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SCOUT_RESULT),
      });
    });

    await page.goto("/agents");
    await page.getByRole("button", { name: /Run Scout Agent/i }).click();
    await expect(page.getByText("Run complete")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Scout complete — 1 leads saved/i)).toBeVisible();
  });
});
