/**
 * Okta OAuth login provider.
 * 
 * Handles various Okta login flows including:
 * - New user login (username on first page, password on second)
 * - Single-page login (username and password on same page)
 * - Returning user (may show "Back to sign in" link)
 * - Auto-submit scenarios (Okta may auto-submit after password entry)
 */

import { BaseOAuthProvider } from "./oauth-provider.js";
import { OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";

/**
 * Okta timeout configuration - balanced for reliability without excessive waits.
 */
const OKTA_TIMEOUTS = {
  /** Wait for page to load (increased for slow networks/connections) */
  pageLoad: 15000,
  /** Wait for form elements */
  element: 10000,
  /** Short wait for optional elements */
  optional: 3000,
  /** Very short wait for checking element existence */
  check: 2000,
  /** Polling interval */
  interval: 300,
  /** Wait after clicking back to sign in */
  pageTransition: 2000,
} as const;

/**
 * Okta specific selectors - multiple versions for compatibility.
 */
const OKTA_SELECTORS = {
  // Modern Okta Identity Engine (OIE) selectors
  inputIdentifier: 'input[name="identifier"]',
  inputPassword: 'input[name="credentials.passcode"]',
  buttonNext: 'input[data-type="save"]',
  buttonVerify: 'input[data-type="save"]',
  
  // Classic Okta selectors
  inputIdentifierClassic: '#okta-signin-username',
  inputPasswordClassic: '#okta-signin-password',
  buttonSignInClassic: '#okta-signin-submit',
  
  // Common selectors
  checkboxRememberMe: 'input[name="rememberMe"]',
  linkBackToSignIn: 'a[data-se="cancel"]',
  
  // Error indicators
  errorMessage: '.okta-form-infobox-error',
  
  // Loading indicators
  loadingSpinner: '.okta-loading-shim',
  formContainer: '.okta-sign-in-header, .auth-container, #okta-sign-in',
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
   * Wait for page to be fully loaded and interactive.
   */
  private async waitForPageReady(): Promise<void> {
    console.log("[OktaLogin] Waiting for page to be ready...");
    
    // Wait for document.readyState to be complete
    await this.browser.waitUntil(
      async () => {
        try {
          const readyState = await this.browser.execute(() => document.readyState);
          return readyState === "complete";
        } catch {
          return false;
        }
      },
      { timeout: OKTA_TIMEOUTS.pageLoad, interval: OKTA_TIMEOUTS.interval }
    );

    // Wait for Okta loading spinner to disappear (if present)
    try {
      const spinner = await this.browser.$(OKTA_SELECTORS.loadingSpinner);
      const spinnerExists = await spinner.isExisting();
      if (spinnerExists) {
        console.log("[OktaLogin] Waiting for loading spinner to disappear...");
        await spinner.waitForDisplayed({ 
          timeout: OKTA_TIMEOUTS.element, 
          reverse: true // Wait for it to NOT be displayed
        });
      }
    } catch {
      // Spinner not present, continue
    }

    // Wait for form container to be visible
    await this.browser.waitUntil(
      async () => {
        try {
          const container = await this.browser.$(OKTA_SELECTORS.formContainer);
          return await container.isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: OKTA_TIMEOUTS.element, interval: OKTA_TIMEOUTS.interval }
    );

    console.log("[OktaLogin] Page is ready");
  }

  /**
   * Find and return the first available element from multiple selectors.
   */
  private async findFirstAvailable(selectors: string[], timeout: number = OKTA_TIMEOUTS.element): Promise<{
    element: WebdriverIO.Element | null;
    selector: string | null;
  }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        try {
          const element = await this.browser.$(selector);
          const isDisplayed = await element.isDisplayed();
          if (isDisplayed) {
            return { element: element as unknown as WebdriverIO.Element, selector };
          }
        } catch {
          // Continue to next selector
        }
      }
      await this.browser.pause(OKTA_TIMEOUTS.interval);
    }
    
    return { element: null, selector: null };
  }

  /**
   * Check if the login was successful (page navigated away from Okta).
   */
  private async checkLoginSuccess(): Promise<boolean> {
    try {
      const url = await this.browser.getUrl();
      const isStillOnOkta = url.includes(".okta.com") || url.includes("oktapreview.com");
      return !isStillOnOkta;
    } catch {
      // If we can't get URL, might be because we navigated away
      return true;
    }
  }

  /**
   * Perform Okta login.
   * Handles the two-step flow where password might be on a separate page.
   */
  public async login(options: OktaLoginOptions): Promise<void> {
    const { email, password, rememberMe = false } = options;
    console.log(`[OktaLogin] Starting login for ${email}`);

    // Wait for page to be ready first
    await this.waitForPageReady();

    // Handle returning user - click "Back to sign in" if present
    const backToSignInClicked = await this.handleBackToSignIn();
    if (backToSignInClicked) {
      // Wait for page to reload after clicking back
      await this.waitForPageReady();
    }

    // Find username input (try multiple selectors)
    const { element: usernameInput, selector: usernameSelector } = await this.findFirstAvailable([
      OKTA_SELECTORS.inputIdentifier,
      OKTA_SELECTORS.inputIdentifierClassic,
    ]);

    if (!usernameInput || !usernameSelector) {
      throw new Error("[OktaLogin] Could not find username input field");
    }

    console.log(`[OktaLogin] Found username input: ${usernameSelector}`);

    // Clear and enter username
    await usernameInput.clearValue();
    await usernameInput.setValue(email);
    console.log("[OktaLogin] Entered username");

    // Handle remember me checkbox (optional)
    if (rememberMe) {
      await this.tryClick(OKTA_SELECTORS.checkboxRememberMe, OKTA_TIMEOUTS.optional);
    }

    // Check if password field is on the same page
    const passwordOnSamePage = await this.isPasswordFieldVisible();
    
    if (!passwordOnSamePage) {
      console.log("[OktaLogin] Password on separate page, clicking Next...");
      
      // Click Next/Sign In button to proceed to password page (handles retries)
      await this.clickNextButton();
      
      // Check if login completed automatically (SSO) - clickNextButton returns if so
      if (await this.checkLoginSuccess()) {
        console.log("[OktaLogin] Login completed automatically (SSO or cached session)");
        return;
      }
      
      // Final verification that password field is visible
      if (!(await this.isPasswordFieldVisible())) {
        throw new Error("[OktaLogin] Password field not visible after clicking Next");
      }
    }

    // Enter password
    await this.enterPassword(password);
    console.log("[OktaLogin] Entered password");

    // Click the submit button
    await this.clickSubmitButton();

    // Wait briefly to check if login succeeded or if we need additional actions
    await this.browser.pause(1000);

    // Check if we're still on Okta (might need to handle MFA or errors)
    const stillOnOkta = await this.isOnOktaLoginPage();
    if (stillOnOkta) {
      // Try clicking submit again in case it didn't register
      console.log("[OktaLogin] Still on Okta, trying submit again...");
      await this.tryClickSubmit();
      
      // Wait for navigation
      await this.browser.waitUntil(
        async () => !(await this.isOnOktaLoginPage()),
        { timeout: OKTA_TIMEOUTS.element, interval: OKTA_TIMEOUTS.interval }
      ).catch(() => {
        console.log("[OktaLogin] Warning: Still on Okta page after login attempt");
      });
    }

    console.log("[OktaLogin] Login flow completed");
  }

  /**
   * Handle "Back to sign in" link for returning users.
   */
  private async handleBackToSignIn(): Promise<boolean> {
    console.log("[OktaLogin] Checking for 'Back to sign in' link...");
    
    try {
      const backLink = await this.browser.$(OKTA_SELECTORS.linkBackToSignIn);
      const isDisplayed = await backLink.isDisplayed();
      
      if (isDisplayed) {
        console.log("[OktaLogin] Found 'Back to sign in' link, clicking...");
        await backLink.click();
        
        // Wait for page transition - this is a full page reload
        console.log("[OktaLogin] Waiting for page to reload after 'Back to sign in'...");
        await this.browser.pause(OKTA_TIMEOUTS.pageTransition);
        
        return true;
      }
    } catch {
      // Link not present, continue
    }
    
    return false;
  }

  /**
   * Check if password field is visible on current page.
   */
  private async isPasswordFieldVisible(): Promise<boolean> {
    const passwordSelectors = [
      OKTA_SELECTORS.inputPassword,
      OKTA_SELECTORS.inputPasswordClassic,
    ];

    for (const selector of passwordSelectors) {
      try {
        const element = await this.browser.$(selector);
        const isDisplayed = await element.isDisplayed();
        if (isDisplayed) {
          return true;
        }
      } catch {
        // Continue
      }
    }
    
    return false;
  }

  /**
   * Click the Next button to proceed from username to password page.
   * Uses a resilient retry pattern: click, wait 500ms, check for password field, repeat if needed.
   */
  private async clickNextButton(): Promise<void> {
    const buttonSelectors = [
      OKTA_SELECTORS.buttonNext,
      OKTA_SELECTORS.buttonSignInClassic,
    ];

    const maxAttempts = 5;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Find the Next button
      const { element: button } = await this.findFirstAvailable(buttonSelectors, OKTA_TIMEOUTS.check);
      
      if (button) {
        try {
          // Scroll to button if needed (ensures visibility)
          await button.scrollIntoView();
          await this.browser.pause(100);
          
          // Click the button
          await button.click();
          console.log(`[OktaLogin] Clicked Next button (attempt ${attempt}/${maxAttempts})`);
        } catch (clickError) {
          console.log(`[OktaLogin] Click failed: ${clickError}, will retry...`);
        }
      } else {
        console.log(`[OktaLogin] Next button not found on attempt ${attempt}/${maxAttempts}`);
      }
      
      // Wait 500ms for page to respond
      await this.browser.pause(500);
      
      // Check if password field is now visible
      if (await this.isPasswordFieldVisible()) {
        console.log("[OktaLogin] Password field appeared after click");
        return;
      }
      
      // Check if we navigated away (SSO or auto-login)
      if (await this.checkLoginSuccess()) {
        console.log("[OktaLogin] Login completed automatically");
        return;
      }
      
      // If we've tried a few times, wait a bit longer before next attempt
      if (attempt >= 2) {
        console.log(`[OktaLogin] Password still not visible, waiting before retry ${attempt + 1}...`);
        await this.browser.pause(500);
      }
    }
    
    // After all attempts, check one more time
    if (await this.isPasswordFieldVisible()) {
      console.log("[OktaLogin] Password field finally visible");
      return;
    }
    
    throw new Error(`[OktaLogin] Could not proceed to password page after ${maxAttempts} Next button clicks`);
  }

  /**
   * Enter password into the password field.
   */
  private async enterPassword(password: string): Promise<void> {
    const passwordSelectors = [
      OKTA_SELECTORS.inputPassword,
      OKTA_SELECTORS.inputPasswordClassic,
    ];

    const { element: passwordInput } = await this.findFirstAvailable(passwordSelectors, OKTA_TIMEOUTS.element);
    
    if (!passwordInput) {
      throw new Error("[OktaLogin] Could not find password input field");
    }

    await passwordInput.clearValue();
    await passwordInput.setValue(password);
  }

  /**
   * Click the submit/verify button after entering password.
   */
  private async clickSubmitButton(): Promise<void> {
    const buttonSelectors = [
      OKTA_SELECTORS.buttonVerify,
      OKTA_SELECTORS.buttonNext,
      OKTA_SELECTORS.buttonSignInClassic,
    ];

    const { element: button } = await this.findFirstAvailable(buttonSelectors, OKTA_TIMEOUTS.element);
    
    if (!button) {
      console.log("[OktaLogin] Warning: Could not find submit button, login may have auto-submitted");
      return;
    }

    await button.click();
    console.log("[OktaLogin] Clicked submit button");
  }

  /**
   * Try to click submit button without throwing.
   */
  private async tryClickSubmit(): Promise<boolean> {
    const buttonSelectors = [
      OKTA_SELECTORS.buttonVerify,
      OKTA_SELECTORS.buttonNext,
      OKTA_SELECTORS.buttonSignInClassic,
    ];

    for (const selector of buttonSelectors) {
      try {
        const element = await this.browser.$(selector);
        const isDisplayed = await element.isDisplayed();
        if (isDisplayed) {
          await element.click();
          return true;
        }
      } catch {
        // Continue
      }
    }
    
    return false;
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
