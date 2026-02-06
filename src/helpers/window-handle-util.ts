/**
 * Window handle utilities for managing browser windows and tabs.
 * Essential for OAuth flows that open new windows/tabs.
 */

import { Environment } from "../core/environment.js";
import { WindowHandleError } from "../core/errors.js";
import { WindowHandleInfo, OAuthProvider } from "../core/types.js";
import { DEFAULT_TIMEOUTS } from "./wait-utils.js";

/**
 * Singleton utility class for window handle management.
 */
export class WindowHandleUtil {
  private static instance: WindowHandleUtil;
  
  private mainWindowHandle?: string;
  private oauthWindowHandles: Map<OAuthProvider, string> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  public static getInstance(): WindowHandleUtil {
    if (!WindowHandleUtil.instance) {
      WindowHandleUtil.instance = new WindowHandleUtil();
    }
    return WindowHandleUtil.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  public static reset(): void {
    WindowHandleUtil.instance = new WindowHandleUtil();
  }

  /**
   * Clear cached window handles.
   * Call this after app restart when handles may have changed.
   */
  public clearCache(): void {
    this.mainWindowHandle = undefined;
    this.oauthWindowHandles.clear();
  }

  /**
   * Get the browser instance.
   */
  private get browser(): WebdriverIO.Browser {
    return Environment.getInstance().browser;
  }

  /**
   * Get all window handles.
   */
  public async getWindowHandles(): Promise<string[]> {
    return this.browser.getWindowHandles();
  }

  /**
   * Get the current window handle.
   */
  public async getCurrentWindowHandle(): Promise<string> {
    return this.browser.getWindowHandle();
  }

  /**
   * Switch to a specific window handle.
   */
  public async switchToWindow(handle: string): Promise<void> {
    await this.browser.switchToWindow(handle);
  }

  /**
   * Set the main app window handle.
   */
  public setMainWindowHandle(handle: string): void {
    this.mainWindowHandle = handle;
  }

  /**
   * Get the main app window handle.
   */
  public getMainWindowHandle(): string | undefined {
    return this.mainWindowHandle;
  }

  /**
   * Store the current window as the main app window.
   */
  public async captureMainWindow(): Promise<string> {
    this.mainWindowHandle = await this.getCurrentWindowHandle();
    return this.mainWindowHandle;
  }

  /**
   * Switch to the main app window.
   */
  public async switchToMainWindow(): Promise<void> {
    if (!this.mainWindowHandle) {
      throw new WindowHandleError("switchToMainWindow", "Main window handle not captured");
    }
    await this.switchToWindow(this.mainWindowHandle);
  }

  /**
   * Set an OAuth provider's window handle.
   */
  public setOAuthWindowHandle(provider: OAuthProvider, handle: string): void {
    this.oauthWindowHandles.set(provider, handle);
  }

  /**
   * Get an OAuth provider's window handle.
   */
  public getOAuthWindowHandle(provider: OAuthProvider): string | undefined {
    return this.oauthWindowHandles.get(provider);
  }

  /**
   * Switch to an OAuth provider's window.
   */
  public async switchToOAuthWindow(provider: OAuthProvider): Promise<void> {
    const handle = this.oauthWindowHandles.get(provider);
    if (!handle) {
      throw new WindowHandleError(
        "switchToOAuthWindow",
        `OAuth window handle for "${provider}" not found`
      );
    }
    await this.switchToWindow(handle);
  }

  /**
   * Wait for a new window to appear (compared to initial handles).
   */
  public async waitForNewWindow(
    initialHandles: string[],
    options: { timeout?: number; interval?: number } = {}
  ): Promise<string> {
    const { timeout = DEFAULT_TIMEOUTS.medium, interval = 500 } = options;

    let newHandle: string | undefined;

    await this.browser.waitUntil(
      async () => {
        const currentHandles = await this.getWindowHandles();
        const newHandles = currentHandles.filter((h) => !initialHandles.includes(h));
        if (newHandles.length > 0) {
          newHandle = newHandles[0];
          return true;
        }
        return false;
      },
      {
        timeout,
        interval,
        timeoutMsg: "New window did not appear",
      }
    );

    return newHandle!;
  }

  /**
   * Classify window handles by their content.
   * Detects main app, Azure, Okta, and BTP IAS windows.
   */
  public async classifyWindowHandles(): Promise<WindowHandleInfo> {
    const handles = await this.getWindowHandles();
    const currentHandle = await this.getCurrentWindowHandle();
    
    const info: WindowHandleInfo = {
      unknown: [],
    };

    for (const handle of handles) {
      await this.switchToWindow(handle);
      
      try {
        const url = await this.browser.getUrl();
        const title = await this.browser.getTitle();

        // Classify based on URL patterns
        if (this.isNeptunePage(url, title)) {
          info.mainApp = handle;
        } else if (this.isAzurePage(url)) {
          info.azure = handle;
        } else if (this.isOktaPage(url)) {
          info.okta = handle;
        } else if (this.isBtpIasPage(url)) {
          info.btpIas = handle;
        } else {
          info.unknown!.push(handle);
        }
      } catch {
        info.unknown!.push(handle);
      }
    }

    // Restore original window
    await this.switchToWindow(currentHandle);

    // Update stored handles
    if (info.mainApp) this.mainWindowHandle = info.mainApp;
    if (info.azure) this.oauthWindowHandles.set("azure", info.azure);
    if (info.okta) this.oauthWindowHandles.set("okta", info.okta);
    if (info.btpIas) this.oauthWindowHandles.set("btp-ias", info.btpIas);

    return info;
  }

  /**
   * Check if URL/title indicates a Neptune page.
   * For mobile apps, localhost URLs and REF_* prefixed titles are considered Neptune pages.
   */
  private isNeptunePage(url: string, title: string): boolean {
    const neptunePatterns = [
      /neptune/i,
      /launchpad/i,
      /appcache/i,
      /\/sap\/bc\/ui5_ui5/i,
      // Mobile apps typically run on localhost
      /^https?:\/\/localhost/i,
      // Reference apps used in tests
      /^REF_/i,
      // Neptune mobile client package patterns
      /com\.neptune\./i,
    ];

    return neptunePatterns.some((p) => p.test(url) || p.test(title));
  }

  /**
   * Check if URL indicates an Azure login page.
   */
  private isAzurePage(url: string): boolean {
    const azurePatterns = [
      /login\.microsoftonline\.com/i,
      /login\.windows\.net/i,
      /login\.microsoft\.com/i,
      /aadcdn\.msftauth\.net/i,
    ];

    return azurePatterns.some((p) => p.test(url));
  }

  /**
   * Check if URL indicates an Okta login page.
   */
  private isOktaPage(url: string): boolean {
    const oktaPatterns = [
      /\.okta\.com/i,
      /oktapreview\.com/i,
    ];

    return oktaPatterns.some((p) => p.test(url));
  }

  /**
   * Check if URL indicates a BTP IAS login page.
   */
  private isBtpIasPage(url: string): boolean {
    const btpPatterns = [
      /accounts\.sap\.com/i,
      /\.authentication\./i,
      /ondemand\.com.*login/i,
    ];

    return btpPatterns.some((p) => p.test(url));
  }

  /**
   * Ensure we're running in the main app window.
   * Classifies handles if needed and switches to main.
   * For mobile apps with a single window, assumes that window is the main app.
   */
  public async ensureInMainWindow(): Promise<void> {
    if (!this.mainWindowHandle) {
      const handles = await this.getWindowHandles();
      
      // If there's only one window, it must be the main app
      if (handles.length === 1) {
        this.mainWindowHandle = handles[0];
        await this.switchToWindow(this.mainWindowHandle);
        return;
      }
      
      // Multiple windows - need to classify
      const info = await this.classifyWindowHandles();
      if (!info.mainApp) {
        // Fallback: use the first window if we still can't identify the main app
        if (handles.length > 0) {
          console.warn("[WindowHandleUtil] Could not classify main app window, using first handle");
          this.mainWindowHandle = handles[0];
        } else {
          throw new WindowHandleError("ensureInMainWindow", "Could not find main app window");
        }
      }
    }
    await this.switchToMainWindow();
  }

  /**
   * Close all windows except the main app window.
   */
  public async closeOAuthWindows(): Promise<void> {
    const handles = await this.getWindowHandles();
    
    for (const handle of handles) {
      if (handle !== this.mainWindowHandle) {
        try {
          await this.switchToWindow(handle);
          await this.browser.closeWindow();
        } catch {
          // Window may already be closed
        }
      }
    }

    // Clear OAuth handles
    this.oauthWindowHandles.clear();

    // Switch back to main
    if (this.mainWindowHandle) {
      await this.switchToMainWindow();
    }
  }

  /**
   * Wait for OAuth window and switch to it.
   */
  public async waitForOAuthWindow(
    provider: OAuthProvider,
    options: { timeout?: number } = {}
  ): Promise<string> {
    const { timeout = DEFAULT_TIMEOUTS.long } = options;
    const initialHandles = await this.getWindowHandles();

    // Wait for new window
    const newHandle = await this.waitForNewWindow(initialHandles, { timeout });

    // Store and switch
    this.setOAuthWindowHandle(provider, newHandle);
    await this.switchToWindow(newHandle);

    return newHandle;
  }
}
