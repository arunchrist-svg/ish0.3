import { test, expect } from "./fixtures/auth";

test.describe("SCOUT-E2E-001 scouting wizard", () => {
  test("scouting page loads with city search", async ({ authenticatedPage: page }) => {
    await page.goto("/scouting");
    await page.getByRole("button", { name: "Location scope" }).click();
    await page.getByRole("menuitem", { name: "Area of Interest" }).click();
    await page.getByRole("button", { name: /City/i }).first().click();
    await expect(page.getByPlaceholder("Search districts or states…")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Scout" })).toBeVisible();
  });

  test("city selector accepts input", async ({ authenticatedPage: page }) => {
    await page.goto("/scouting");
    await page.getByRole("button", { name: "Location scope" }).click();
    await page.getByRole("menuitem", { name: "Area of Interest" }).click();
    await page.getByRole("button", { name: /City/i }).first().click();
    const search = page.getByPlaceholder("Search districts or states…");
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("Bangalore");
    await expect(search).toHaveValue("Bangalore");
  });
});
