/**
 * Okta OAuth login provider.
 */

import { BaseOAuthProvider } from "./oauth-provider.js";
import { OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";
import { DEFAULT_TIMEOUTS } from "../helpers/wait-utils.js";

/**
 * Okta specific selectors.
 */
const OKTA_SELECTORS = {
  inputIdentifier: 'input[name="identifier"]',
  inputPassword: 'input[name="credentials.passcode"]',
  buttonSignIn: 'input[data-type="save"]',
  buttonNext: 'input[data-type="save"]',
  checkboxRememberMe: 'input[name="rememberMe"]',
  linkBackToSignIn: 'a[data-se="cancel"]',
  // Alternative selectors for different Okta versions
  inputIdentifierAlt: '#okta-signin-username',
  inputPasswordAlt: '#okta-signin-password',
  buttonSignInAlt: '#okta-signin-submit',
} as const;

/**
 * Okta login options.
 */
export interface OktaLoginOptions extends OAuthLoginOptions {
  /**
   * Whether to remember the user. Defaults to false.
   */
  rememberMe?: boolean;
}

/**
 * Okta OAuth login provider.
 */
export class OktaLogin extends BaseOAuthProvider {
  public readonly providerType = "okta" as const;

  /**
   * Get the Okta handle from classified window info.
   */
  protected getHandleFromInfo(info: WindowHandleInfo): string | undefined {
    return info.okta;
  }

  /**
   * Perform Okta login.
   * Handles the two-step flow where password might be on a separate page.
   */
  public async login(options: OktaLoginOptions): Promise<void> {
    const { email, password, rememberMe = false } = options;

    // Try to click "Back to sign in" if present (from previous session)
    await this.tryClick(OKTA_SELECTORS.linkBackToSignIn, 2000);

    // Wait for identifier input
    let identifierSelector: string = OKTA_SELECTORS.inputIdentifier;
    try {
      await this.waitForElement(OKTA_SELECTORS.inputIdentifier, 5000);
    } catch {
      // Try alternative selector
      identifierSelector = OKTA_SELECTORS.inputIdentifierAlt;
      await this.waitForElement(identifierSelector, DEFAULT_TIMEOUTS.medium as number);
    }

    // Enter username/email
    await this.waitAndSetValue(identifierSelector, email);

    // Handle remember me checkbox
    if (rememberMe) {
      await this.tryClick(OKTA_SELECTORS.checkboxRememberMe, 2000);
    }

    // Try to enter password on same page
    let passwordOnSamePage = true;
    try {
      const passwordInput = await this.browser.$(OKTA_SELECTORS.inputPassword);
      const isDisplayed = await passwordInput.isDisplayed();
      passwordOnSamePage = isDisplayed;
    } catch {
      passwordOnSamePage = false;
    }

    if (!passwordOnSamePage) {
      // Password is on next page, click next/sign in first
      await this.waitAndClick(OKTA_SELECTORS.buttonSignIn);

      // Wait for password input
      await this.browser.waitUntil(
        async () => {
          try {
            const passwordInput = await this.browser.$(OKTA_SELECTORS.inputPassword);
            return await passwordInput.isDisplayed();
          } catch {
            // Try alternative selector
            try {
              const passwordInputAlt = await this.browser.$(OKTA_SELECTORS.inputPasswordAlt);
              return await passwordInputAlt.isDisplayed();
            } catch {
              return false;
            }
          }
        },
        { timeout: DEFAULT_TIMEOUTS.medium, interval: 500 }
      );
    }

    // Enter password
    let passwordSelector: string = OKTA_SELECTORS.inputPassword;
    try {
      await this.waitAndSetValue(OKTA_SELECTORS.inputPassword, password, 3000);
    } catch {
      passwordSelector = OKTA_SELECTORS.inputPasswordAlt;
      await this.waitAndSetValue(passwordSelector, password);
    }

    // Click sign in
    try {
      await this.waitAndClick(OKTA_SELECTORS.buttonSignIn);
    } catch {
      await this.waitAndClick(OKTA_SELECTORS.buttonSignInAlt);
    }

    // Sometimes a second click is needed
    await this.browser.pause(1000);
    await this.tryClick(OKTA_SELECTORS.buttonSignIn, 2000);
  }

  /**
   * Check if currently on Okta login page.
   */
  public async isOnOktaLoginPage(): Promise<boolean> {
    try {
      const url = await this.browser.getUrl();
      return url.includes(".okta.com") || url.includes("oktapreview.com");
    } catch {
      return false;
    }
  }
}
