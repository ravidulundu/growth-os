import { LoginPage } from "../pages/login-page";
import { expect, test } from "../fixtures/test-fixture";

test.describe("auth.magic-link.e2e", () => {
  test("renders landing for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(
      page.getByRole("heading", {
        name: "Build, ship, and learn from every post in one command center."
      })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Started" })).toHaveAttribute(
      "href",
      "/login?next=/studio"
    );
  });

  test("redirects authenticated users from landing to studio", async ({ page }) => {
    await page.goto("/api/auth/magic-link/verify?token=valid-token");
    await page.goto("/");
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByTestId("studio-hero-title")).toBeVisible();
  });

  test("requests magic link and shows success notice", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.requestMagicLink("founder@example.com");
    await expect(loginPage.notice).toContainText("Magic link gönderildi");
  });

  test("verifies token and opens dashboard", async ({ page }) => {
    await page.goto("/login?magic_token=valid-token&next=%2Fstudio");
    await expect(page).toHaveURL(/\/studio(\?.*)?$/);
    await expect(page.getByTestId("studio-hero-title")).toBeVisible();
  });

  test("invalid token stays on login with error notice", async ({ page }) => {
    await page.goto("/login?magic_token=expired-token&next=%2Fstudio");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-notice")).toContainText(
      "Invalid or expired magic link token"
    );
  });
});
