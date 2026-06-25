import { test, expect, TEST_EMAIL, TEST_PASSWORD } from "./fixtures/auth";

test.describe("AUTH-E2E-001 login flow", () => {
  test("login page renders welcome message", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("shows error on bad password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill("wrong-password-xyz");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test("valid login redirects to home", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
    await expect(page).toHaveURL("/");
  });
});
