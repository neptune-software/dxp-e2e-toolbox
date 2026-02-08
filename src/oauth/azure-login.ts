/**
 * Azure AD OAuth login provider.
 * 
 * Handles Microsoft Azure AD login flows including:
 * - Email entry on first page
 * - Password entry on second page
 * - "Stay signed in?" prompt
 */

/// <reference types="webdriverio" />
/// <reference types="@wdio/globals/types" />

import { BaseOAuthProvider } from "./oauth-provider.js";
import { OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";

/**
 * Azure timeout configuration - balanced for reliability.
 */
const AZURE_TIMEOUTS = {
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
    console.log(`[AzureLogin] Starting login for ${email}`);

    // Brief stabilization pause after context switch (important for iOS)
    await this.browser.pause(1000);

    // Wait for email input to be displayed
    console.log("[AzureLogin] Waiting for email input...");
    await this.waitForElement(AZURE_SELECTORS.inputEmail, AZURE_TIMEOUTS.pageLoad);

    // Enter email
    await this.waitAndSetValue(AZURE_SELECTORS.inputEmail, email);
    console.log("[AzureLogin] Entered email");

    // Click next with retry logic
    await this.clickNextWithRetry();

    // Wait for password input with retry
    console.log("[AzureLogin] Waiting for password input...");
    await this.browser.waitUntil(
      async () => {
        try {
          const passwordInput = await this.browser.$(AZURE_SELECTORS.inputPassword);
          return await passwordInput.isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: AZURE_TIMEOUTS.pageLoad, interval: AZURE_TIMEOUTS.interval }
    );

    // Enter password
    await this.waitAndSetValue(AZURE_SELECTORS.inputPassword, password);
    console.log("[AzureLogin] Entered password");

    // Click sign in with retry
    await this.clickSignInWithRetry();

    this.browser.pause(1000);

    // OPTIMIZATION: Check if login has already auto-completed (OAuth page closed)
    // This happens when Azure doesn't show "Stay signed in" and immediately redirects
    // Checking early avoids 20+ second timeouts trying to find elements on a closed page
    const stillOnAzure = await this.isOnAzureLoginPage();
    
    if (!stillOnAzure) {
      console.log("[AzureLogin] Login auto-completed (already redirected back to app)");
      console.log("[AzureLogin] Login flow completed");
      return;
    }

    // Wait for "Stay signed in?" prompt (only if still on Azure)
    console.log("[AzureLogin] Still on Azure - checking for 'Stay signed in' prompt...");
    await this.browser.waitUntil(
      async () => {
        try {
          // First check if we've left Azure (login completed)
          const url = await this.browser.getUrl();
          if (!url.includes("microsoftonline.com") && !url.includes("login.microsoft")) {
            console.log("[AzureLogin] Redirected away from Azure, login completed");
            return true; // Exit the wait - login is done
          }
          
          // Check if stay signed in prompt appeared
          const noButton = await this.browser.$(AZURE_SELECTORS.buttonStaySignedInNo);
          const yesButton = await this.browser.$(AZURE_SELECTORS.buttonStaySignedInYes);
          return (await noButton.isDisplayed()) || (await yesButton.isDisplayed());
        } catch {
          return false;
        }
      },
      { timeout: AZURE_TIMEOUTS.element, interval: AZURE_TIMEOUTS.interval }
    ).catch(() => {
      console.log("[AzureLogin] 'Stay signed in' prompt not shown or page already closed");
    });

    // Only try to click if still on Azure
    const stillOnAzureAfterWait = await this.isOnAzureLoginPage();
    if (stillOnAzureAfterWait) {
      // Handle stay signed in prompt
      if (staySignedIn) {
        await this.tryClick(AZURE_SELECTORS.buttonStaySignedInYes, AZURE_TIMEOUTS.optional);
      } else {
        await this.tryClick(AZURE_SELECTORS.buttonStaySignedInNo, AZURE_TIMEOUTS.optional);
      }
    }

    console.log("[AzureLogin] Login flow completed");
  }

  /**
   * Click the Next button with retry logic.
   */
  private async clickNextWithRetry(): Promise<void> {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.waitAndClick(AZURE_SELECTORS.buttonNext, AZURE_TIMEOUTS.element as number);
        console.log(`[AzureLogin] Clicked Next button (attempt ${attempt}/${maxAttempts})`);
        
        // Wait for password field or page transition
        await this.browser.pause(500);
        
        // Check if password field appeared
        try {
          const passwordInput = await this.browser.$(AZURE_SELECTORS.inputPassword);
          if (await passwordInput.isDisplayed()) {
            return;
          }
        } catch {
          // Continue retry loop
        }
        
        if (attempt < maxAttempts) {
          console.log("[AzureLogin] Password not visible yet, retrying...");
          await this.browser.pause(500);
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        console.log(`[AzureLogin] Next click attempt ${attempt} failed, retrying...`);
        await this.browser.pause(500);
      }
    }
  }

  /**
   * Click the Sign In button with retry logic.
   */
  private async clickSignInWithRetry(): Promise<void> {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.waitAndClick(AZURE_SELECTORS.buttonSignIn, AZURE_TIMEOUTS.element as number);
        console.log(`[AzureLogin] Clicked Sign In button (attempt ${attempt}/${maxAttempts})`);
        
        // Wait for page transition
        await this.browser.pause(500);
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        console.log(`[AzureLogin] Sign In click attempt ${attempt} failed, retrying...`);
        await this.browser.pause(500);
      }
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
