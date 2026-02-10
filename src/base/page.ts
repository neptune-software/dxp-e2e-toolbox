/**
 * Base Page class for all page objects.
 */

import { DxpEditionType, DxpVersion } from "../core/types.js";
import { Environment } from "../core/environment.js";
import { WebView } from "./webview.js";
import { waitForNeptuneReady, waitForUI5Ready } from "../helpers/wait-utils.js";

/**
 * Base Page class that all page objects extend.
 */
export class Page extends WebView {
  /**
   * The DXP edition type for this page.
   */
  public readonly edition: DxpEditionType;

  /**
   * The DXP version for this page.
   */
  public readonly version: DxpVersion;

  constructor() {
    super();
    this.edition = Environment.getInstance().edition;
    this.version = Environment.getInstance().version;
  }

  /**
   * Wait until Neptune is fully initialized.
   */
  public async waitUntilNeptuneReady(): Promise<this> {
    await waitForNeptuneReady();
    return this;
  }

  /**
   * Wait until UI5 is ready.
   */
  public async waitUntilUI5Ready(): Promise<this> {
    await waitForUI5Ready();
    return this;
  }

  /**
   * Inject wdi5 into the page.
   * This is usually handled automatically by the wdi5 service.
   */
  public async injectUI5(): Promise<this> {
    try {
      const wdi5 = this.wdi5 as { injectUI5: (browser: WebdriverIO.Browser) => Promise<void> };
      if (wdi5 && typeof wdi5.injectUI5 === "function") {
        await wdi5.injectUI5(this.browser);
      }
    } catch (error) {
      console.warn("[DXP E2E Toolbox] Failed to inject UI5:", error);
    }
    return this;
  }

  /**
   * Get the current UI5 version.
   */
  public async getUI5Version(): Promise<string | null> {
    try {
      return await this.browser.execute(() => {
        if (window.sap?.ui?.version) return window.sap!.ui!.version;
        return null;
      });
    } catch {
      return null;
    }
  }

  /**
   * Navigate to a URL.
   */
  public async navigateTo(url: string): Promise<this> {
    await this.browser.url(url);
    return this;
  }

  /**
   * Get the current URL.
   */
  public async getCurrentUrl(): Promise<string> {
    return this.browser.getUrl();
  }

  /**
   * Get the page title.
   */
  public async getTitle(): Promise<string> {
    return this.browser.getTitle();
  }

  /**
   * Refresh the page.
   */
  public async refresh(): Promise<this> {
    await this.browser.refresh();
    return this;
  }

  /**
   * Take a screenshot.
   */
  public async takeScreenshot(): Promise<string> {
    return this.browser.takeScreenshot();
  }

  /**
   * Execute JavaScript in the browser.
   */
  public async execute<T>(script: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
    return this.browser.execute(script as string, ...args) as Promise<T>;
  }
}
