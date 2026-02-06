/**
 * Azure AD OAuth login provider.
 */

import { BaseOAuthProvider } from "./oauth-provider.js";
import { OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";
import { DEFAULT_TIMEOUTS } from "../helpers/wait-utils.js";

/**
 * Azure AD specific selectors.
 */
const AZURE_SELECTORS = {
  inputEmail: "#i0116",
  inputPassword: "#i0118",
  buttonNext: "#idSIButton9",
  buttonSignIn: "#idSIButton9",
  buttonStaySignedInNo: "#idBtn_Back",
  buttonStaySignedInYes: "#idSIButton9",
  // Error states
  errorBanner: "#usernameError",
  passwordError: "#passwordError",
} as const;

/**
 * Azure AD login options.
 */
export interface AzureLoginOptions extends OAuthLoginOptions {
  /**
   * Whether to stay signed in. Defaults to false.
   */
  staySignedIn?: boolean;
}

/**
 * Azure AD OAuth login provider.
 */
export class AzureLogin extends BaseOAuthProvider {
  public readonly providerType = "azure" as const;

  /**
   * Get the Azure handle from classified window info.
   */
  protected getHandleFromInfo(info: WindowHandleInfo): string | undefined {
    return info.azure;
  }

  /**
   * Perform Azure AD login.
   */
  public async login(options: AzureLoginOptions): Promise<void> {
    const { email, password, staySignedIn = false } = options;

    // Wait for email input to be displayed
    await this.waitForElement(AZURE_SELECTORS.inputEmail, DEFAULT_TIMEOUTS.long as number);

    // Enter email
    await this.waitAndSetValue(AZURE_SELECTORS.inputEmail, email);

    // Click next
    await this.waitAndClick(AZURE_SELECTORS.buttonNext);

    // Wait for password input
    await this.browser.waitUntil(
      async () => {
        try {
          const passwordInput = await this.browser.$(AZURE_SELECTORS.inputPassword);
          return await passwordInput.isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: DEFAULT_TIMEOUTS.medium, interval: 500 }
    );

    // Enter password
    await this.waitAndSetValue(AZURE_SELECTORS.inputPassword, password);

    // Click sign in
    await this.waitAndClick(AZURE_SELECTORS.buttonSignIn);

    // Wait for "Stay signed in?" prompt
    await this.browser.waitUntil(
      async () => {
        try {
          // Check if stay signed in prompt appeared
          const noButton = await this.browser.$(AZURE_SELECTORS.buttonStaySignedInNo);
          const yesButton = await this.browser.$(AZURE_SELECTORS.buttonStaySignedInYes);
          return (await noButton.isDisplayed()) || (await yesButton.isDisplayed());
        } catch {
          return false;
        }
      },
      { timeout: DEFAULT_TIMEOUTS.medium, interval: 500 }
    ).catch(() => {
      // Prompt might not appear, that's OK
    });

    // Handle stay signed in prompt
    if (staySignedIn) {
      await this.tryClick(AZURE_SELECTORS.buttonStaySignedInYes, 3000);
    } else {
      await this.tryClick(AZURE_SELECTORS.buttonStaySignedInNo, 3000);
    }
  }

  /**
   * Check if currently on Azure login page.
   */
  public async isOnAzureLoginPage(): Promise<boolean> {
    try {
      const url = await this.browser.getUrl();
      return url.includes("login.microsoftonline.com") ||
             url.includes("login.windows.net") ||
             url.includes("login.microsoft.com");
    } catch {
      return false;
    }
  }

  /**
   * Get login error message if present.
   */
  public async getErrorMessage(): Promise<string | null> {
    try {
      const usernameError = await this.browser.$(AZURE_SELECTORS.errorBanner);
      if (await usernameError.isDisplayed()) {
        return await usernameError.getText();
      }

      const passwordError = await this.browser.$(AZURE_SELECTORS.passwordError);
      if (await passwordError.isDisplayed()) {
        return await passwordError.getText();
      }
    } catch {
      // No error visible
    }
    return null;
  }
}
