import { test, expect } from "./fixtures/auth";

test.describe("SCOUT-E2E-001 scouting wizard", () => {
  test("scouting page loads with city search", async ({ authenticatedPage: page }) => {
    await page.goto("/scouting");
    await expect(page.getByPlaceholder("Search city…")).toBeVisible({ timeout: 15_000 });
  });

  test("city selector accepts input", async ({ authenticatedPage: page }) => {
    await page.goto("/scouting");
    const search = page.getByPlaceholder("Search city…");
    await search.fill("Bangalore");
    await expect(search).toHaveValue("Bangalore");
  });
});
