/**
 * BTP IAS (Identity Authentication Service) OAuth login provider.
 * 
 * Handles SAP BTP Identity Authentication Service login flows.
 * This is typically a single-page login form.
 */

/// <reference types="webdriverio" />
/// <reference types="@wdio/globals/types" />

import { BaseOAuthProvider } from "./oauth-provider.js";
import { OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";

/**
 * BTP IAS timeout configuration.
 */
const BTP_TIMEOUTS = {
  /** Wait for page to load */
  pageLoad: 15000,
  /** Wait for form elements */
  element: 10000,
  /** Short wait for optional elements */
  optional: 3000,
  /** Polling interval */
  interval: 300,
} as const;

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
    console.log(`[BtpIasLogin] Starting login for ${email}`);

    // Brief stabilization pause after context switch (important for iOS)
    await this.browser.pause(1000);

    // Wait for username input (try both selectors)
    console.log("[BtpIasLogin] Waiting for username input...");
    let usernameSelector: string = BTP_IAS_SELECTORS.inputUsername;
    try {
      await this.waitForElement(BTP_IAS_SELECTORS.inputUsername, 5000);
    } catch {
      usernameSelector = BTP_IAS_SELECTORS.inputUsernameAlt;
      await this.waitForElement(usernameSelector, BTP_TIMEOUTS.element);
    }

    // Enter username
    await this.waitAndSetValue(usernameSelector, email);
    console.log("[BtpIasLogin] Entered username");

    // Enter password (try both selectors)
    let passwordSelector: string = BTP_IAS_SELECTORS.inputPassword;
    try {
      await this.waitAndSetValue(BTP_IAS_SELECTORS.inputPassword, password, BTP_TIMEOUTS.optional);
    } catch {
      passwordSelector = BTP_IAS_SELECTORS.inputPasswordAlt;
      await this.waitAndSetValue(passwordSelector, password);
    }
    console.log("[BtpIasLogin] Entered password");

    // Handle "keep me signed in" checkbox
    if (keepMeSignedIn) {
      await this.tryClick(BTP_IAS_SELECTORS.checkboxRememberMe, BTP_TIMEOUTS.optional);
    }

    // Click continue/submit with retry logic
    await this.clickContinueWithRetry();

    console.log("[BtpIasLogin] Login flow completed");
  }

  /**
   * Click the Continue button with retry logic.
   * BTP IAS sometimes needs multiple clicks.
   */
  private async clickContinueWithRetry(): Promise<void> {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.waitAndClick(BTP_IAS_SELECTORS.buttonContinue, BTP_TIMEOUTS.element as number);
        console.log(`[BtpIasLogin] Clicked Continue button (attempt ${attempt}/${maxAttempts})`);
        
        // Wait for page transition
        await this.browser.pause(1000);
        
        // Check if we're still on the login page
        if (!(await this.isOnBtpIasLoginPage())) {
          return; // Successfully navigated away
        }
        
        if (attempt < maxAttempts) {
          console.log("[BtpIasLogin] Still on login page, retrying...");
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        console.log(`[BtpIasLogin] Continue click attempt ${attempt} failed, retrying...`);
        await this.browser.pause(500);
      }
    }
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
