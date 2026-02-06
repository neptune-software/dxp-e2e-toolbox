/**
 * BTP IAS (Identity Authentication Service) OAuth login provider.
 */

import { BaseOAuthProvider } from "./oauth-provider.js";
import { OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";
import { DEFAULT_TIMEOUTS } from "../helpers/wait-utils.js";

/**
 * BTP IAS specific selectors.
 */
const BTP_IAS_SELECTORS = {
  inputUsername: "#j_username",
  inputPassword: "#j_password",
  buttonContinue: "#logOnFormSubmit",
  checkboxRememberMe: "#rememberme",
  // Alternative selectors
  inputUsernameAlt: 'input[name="j_username"]',
  inputPasswordAlt: 'input[name="j_password"]',
} as const;

/**
 * BTP IAS login options.
 */
export interface BtpIasLoginOptions extends OAuthLoginOptions {
  /**
   * Whether to keep signed in. Defaults to false.
   */
  keepMeSignedIn?: boolean;
}

/**
 * BTP IAS OAuth login provider.
 */
export class BtpIasLogin extends BaseOAuthProvider {
  public readonly providerType = "btp-ias" as const;

  /**
   * Get the BTP IAS handle from classified window info.
   */
  protected getHandleFromInfo(info: WindowHandleInfo): string | undefined {
    return info.btpIas;
  }

  /**
   * Perform BTP IAS login.
   */
  public async login(options: BtpIasLoginOptions): Promise<void> {
    const { email, password, keepMeSignedIn = false } = options;

    // Wait for username input
    let usernameSelector: string = BTP_IAS_SELECTORS.inputUsername;
    try {
      await this.waitForElement(BTP_IAS_SELECTORS.inputUsername, 5000);
    } catch {
      usernameSelector = BTP_IAS_SELECTORS.inputUsernameAlt;
      await this.waitForElement(usernameSelector, DEFAULT_TIMEOUTS.medium as number);
    }

    // Enter username
    await this.waitAndSetValue(usernameSelector, email);

    // Enter password
    let passwordSelector: string = BTP_IAS_SELECTORS.inputPassword;
    try {
      await this.waitAndSetValue(BTP_IAS_SELECTORS.inputPassword, password, 3000);
    } catch {
      passwordSelector = BTP_IAS_SELECTORS.inputPasswordAlt;
      await this.waitAndSetValue(passwordSelector, password);
    }

    // Handle "keep me signed in" checkbox
    if (keepMeSignedIn) {
      await this.tryClick(BTP_IAS_SELECTORS.checkboxRememberMe, 2000);
    }

    // Click continue/submit
    await this.waitAndClick(BTP_IAS_SELECTORS.buttonContinue);

    // Sometimes a second click is needed for BTP IAS
    await this.browser.pause(1000);
    await this.tryClick(BTP_IAS_SELECTORS.buttonContinue, 2000);
  }

  /**
   * Check if currently on BTP IAS login page.
   */
  public async isOnBtpIasLoginPage(): Promise<boolean> {
    try {
      const url = await this.browser.getUrl();
      return url.includes("accounts.sap.com") ||
             url.includes(".authentication.") ||
             (url.includes("ondemand.com") && url.includes("login"));
    } catch {
      return false;
    }
  }
}
