/**
 * Base OAuth provider class for all OAuth login flows.
 * Provides common functionality for window handling and login flows.
 */

import { Environment } from "../core/environment.js";
import { OAuthError } from "../core/errors.js";
import { OAuthProvider as OAuthProviderType, OAuthLoginOptions, WindowHandleInfo } from "../core/types.js";
import { WindowHandleUtil } from "../helpers/window-handle-util.js";
import { DEFAULT_TIMEOUTS } from "../helpers/wait-utils.js";

/**
 * Result of opening an OAuth window.
 */
export interface OAuthWindowInfo {
  mainAppHandle: string;
  oauthHandle: string;
}

/**
 * Base class for OAuth providers (Azure, Okta, BTP IAS).
 */
export abstract class BaseOAuthProvider {
  /**
   * The OAuth provider type.
   */
  public abstract readonly providerType: OAuthProviderType;

  /**
   * Get the browser instance.
   */
  protected get browser(): WebdriverIO.Browser {
    return Environment.getInstance().browser;
  }

  /**
   * Get the window handle utility.
   */
  protected get windowUtil(): WindowHandleUtil {
    return WindowHandleUtil.getInstance();
  }

  /**
   * Wait for an element to be displayed.
   */
  protected async waitForElement(
    selector: string,
    timeout: number = DEFAULT_TIMEOUTS.medium
  ): Promise<WebdriverIO.Element> {
    const element = await this.browser.$(selector);
    await element.waitForDisplayed({ timeout });
    // ChainablePromiseElement is runtime-compatible with Element; TS requires unknown for parent type mismatch
    return element as unknown as WebdriverIO.Element;
  }

  /**
   * Wait for an element and set its value.
   */
  protected async waitAndSetValue(
    selector: string,
    value: string,
    timeout: number = DEFAULT_TIMEOUTS.medium
  ): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.setValue(value);
  }

  /**
   * Wait for an element and click it.
   */
  protected async waitAndClick(
    selector: string,
    timeout = DEFAULT_TIMEOUTS.medium
  ): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.click();
  }

  /**
   * Try to click an element, ignoring errors if it doesn't exist.
   */
  protected async tryClick(selector: string, timeout = 3000): Promise<boolean> {
    try {
      const element = await this.browser.$(selector);
      await element.waitForDisplayed({ timeout });
      await element.click();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Switch to the OAuth window.
   */
  public async switchToOAuthWindow(): Promise<string> {
    const handle = this.windowUtil.getOAuthWindowHandle(this.providerType);
    if (handle) {
      await this.windowUtil.switchToWindow(handle);
      return handle;
    }
    
    // Try to find and classify windows
    const info = await this.windowUtil.classifyWindowHandles();
    const newHandle = this.getHandleFromInfo(info);
    
    if (!newHandle) {
      throw new OAuthError(this.providerType, "switchToOAuthWindow", "OAuth window not found");
    }
    
    await this.windowUtil.switchToWindow(newHandle);
    return newHandle;
  }

  /**
   * Get the OAuth handle from classified window info.
   */
  protected abstract getHandleFromInfo(info: WindowHandleInfo): string | undefined;

  /**
   * Switch back to the main app window.
   */
  public async switchToMainApp(): Promise<void> {
    await this.windowUtil.ensureInMainWindow();
  }

  /**
   * Open the OAuth login window.
   * This triggers the OAuth flow and switches to the OAuth window.
   */
  public async open(clickLoginButton?: () => Promise<void>): Promise<OAuthWindowInfo> {
    // Capture current windows
    await this.windowUtil.captureMainWindow();
    
    // Classify existing windows
    await this.windowUtil.classifyWindowHandles();
    
    // Check if OAuth window already exists
    let oauthHandle = this.windowUtil.getOAuthWindowHandle(this.providerType);
    
    if (!oauthHandle) {
      // Need to trigger OAuth flow by clicking login button
      if (clickLoginButton) {
        await clickLoginButton();
      }
      
      // Wait for OAuth window to appear
      const initialHandles = await this.windowUtil.getWindowHandles();
      oauthHandle = await this.windowUtil.waitForNewWindow(initialHandles, {
        timeout: DEFAULT_TIMEOUTS.long,
      });
      
      this.windowUtil.setOAuthWindowHandle(this.providerType, oauthHandle);
    }
    
    // Switch to OAuth window
    await this.windowUtil.switchToWindow(oauthHandle);
    
    return {
      mainAppHandle: this.windowUtil.getMainWindowHandle()!,
      oauthHandle,
    };
  }

  /**
   * Complete the OAuth login flow and return to main app.
   */
  public async loginAndReturn(options: OAuthLoginOptions): Promise<void> {
    await this.login(options);
    
    // Wait a bit for the redirect
    await this.browser.waitUntil(
      async () => {
        const handles = await this.windowUtil.getWindowHandles();
        // OAuth window should close or redirect
        return handles.length === 1 || 
               !(await this.windowUtil.getOAuthWindowHandle(this.providerType));
      },
      { timeout: DEFAULT_TIMEOUTS.medium, interval: 500 }
    ).catch(() => {
      // Timeout is OK, might still need to manually switch
    });
    
    // Ensure we're back in main app
    await this.switchToMainApp();
  }

  /**
   * Perform the login. Must be implemented by subclasses.
   */
  public abstract login(options: OAuthLoginOptions): Promise<void>;
}
