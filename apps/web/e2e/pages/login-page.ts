import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly requestMagicLinkButton: Locator;
  readonly notice: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId("login-email-input");
    this.requestMagicLinkButton = page.getByTestId("request-magic-link-button");
    this.notice = page.getByTestId("login-notice");
  }

  async goto() {
    await this.page.goto("/login");
  }

  async requestMagicLink(email: string) {
    await this.emailInput.fill(email);
    await expect(this.requestMagicLinkButton).toBeEnabled();
    await this.requestMagicLinkButton.click();
  }
}
