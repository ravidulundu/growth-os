import { LoginPage } from "../pages/login-page";
import { expect, test } from "../fixtures/test-fixture";

test.describe("auth.magic-link.e2e", () => {
  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Magic Link Login" })).toBeVisible();
  });

  test("requests magic link and shows success notice", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.requestMagicLink("founder@example.com");
    await expect(loginPage.notice).toContainText("Magic link gönderildi");
  });

  test("verifies token and opens dashboard", async ({ page }) => {
    await page.goto("/login?magic_token=valid-token&next=%2F");
    await expect(page).toHaveURL(/http:\/\/127\.0\.0\.1:3010\/(\?.*)?$/);
    await expect(page.getByTestId("studio-hero-title")).toBeVisible();
  });

  test("invalid token stays on login with error notice", async ({ page }) => {
    await page.goto("/login?magic_token=expired-token&next=%2F");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-notice")).toContainText(
      "Invalid or expired magic link token"
    );
  });
});
