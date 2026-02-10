/**
 * WebView context utilities for hybrid mobile apps.
 * Handles switching between NATIVE_APP and WEBVIEW contexts.
 */

import { Environment } from "../core/environment.js";
import { WindowHandleError } from "../core/errors.js";
import { DEFAULT_TIMEOUTS } from "./wait-utils.js";

/**
 * Context types for mobile apps.
 */
export type ContextType = "NATIVE_APP" | string;

/**
 * WebView utility class for managing mobile app contexts.
 */
export class WebViewUtil {
  /**
   * Get all available contexts.
   */
  public static async getContexts(): Promise<string[]> {
    const browser = Environment.getInstance().browser;
    
    try {
      const contexts = await browser.getContexts();
      // Handle both string[] and object[] formats
      return contexts.map((ctx: unknown) => {
        if (typeof ctx === "string") return ctx;
        if (ctx && typeof ctx === "object" && "id" in ctx) {
          return String((ctx as { id: unknown }).id);
        }
        return String(ctx);
      });
    } catch {
      return ["NATIVE_APP"];
    }
  }

  /**
   * Get the current context.
   */
  public static async getCurrentContext(): Promise<string> {
    const browser = Environment.getInstance().browser;
    
    try {
      const ctx = await browser.getContext();
      if (typeof ctx === "string") return ctx;
      if (ctx && typeof ctx === "object" && "id" in ctx) {
        return String((ctx as { id: unknown }).id);
      }
      return String(ctx);
    } catch {
      return "NATIVE_APP";
    }
  }

  /**
   * Switch to a specific context.
   */
  public static async switchToContext(contextId: string): Promise<void> {
    const browser = Environment.getInstance().browser;
    await browser.switchContext(contextId);
  }

  /**
   * Switch to native app context.
   */
  public static async switchToNativeApp(): Promise<void> {
    await this.switchToContext("NATIVE_APP");
  }

  /**
   * Find and switch to a webview context.
   * @param namePattern Optional pattern to match specific webview
   */
  public static async switchToWebView(namePattern?: string | RegExp): Promise<string> {
    const contexts = await this.getContexts();
    
    const webviews = contexts.filter((ctx) => ctx.startsWith("WEBVIEW") || ctx.includes("WEBVIEW"));
    
    if (webviews.length === 0) {
      throw new WindowHandleError("switchToWebView", "No WEBVIEW context found");
    }

    let targetContext: string | undefined;

    if (namePattern) {
      const pattern = typeof namePattern === "string" 
        ? new RegExp(namePattern) 
        : namePattern;
      targetContext = webviews.find((ctx) => pattern.test(ctx));
    } else {
      // Default to first webview
      targetContext = webviews[0];
    }

    if (!targetContext) {
      throw new WindowHandleError(
        "switchToWebView",
        namePattern ? `No WEBVIEW matching "${namePattern}" found` : "No WEBVIEW found"
      );
    }

    await this.switchToContext(targetContext);
    return targetContext;
  }

  /**
   * Wait for a webview context to become available.
   */
  public static async waitForWebViewContext(
    options: {
      timeout?: number;
      interval?: number;
      namePattern?: string | RegExp;
    } = {}
  ): Promise<string> {
    const {
      timeout = DEFAULT_TIMEOUTS.long,
      interval = DEFAULT_TIMEOUTS.interval,
      namePattern,
    } = options;

    const browser = Environment.getInstance().browser;
    let foundContext: string | undefined;

    await browser.waitUntil(
      async () => {
        const contexts = await this.getContexts();
        const webviews = contexts.filter((ctx) => 
          ctx.startsWith("WEBVIEW") || ctx.includes("WEBVIEW")
        );

        if (webviews.length === 0) return false;

        if (namePattern) {
          const pattern = typeof namePattern === "string"
            ? new RegExp(namePattern)
            : namePattern;
          foundContext = webviews.find((ctx) => pattern.test(ctx));
          return !!foundContext;
        }

        foundContext = webviews[0];
        return true;
      },
      {
        timeout,
        interval,
        timeoutMsg: "WEBVIEW context did not become available",
      }
    );

    return foundContext!;
  }

  /**
   * Wait for the document to be fully loaded in the current webview.
   */
  public static async waitForDocumentReady(timeout = DEFAULT_TIMEOUTS.medium): Promise<void> {
    const browser = Environment.getInstance().browser;

    await browser.waitUntil(
      async () => {
        try {
          const state = await browser.execute(() => document.readyState);
          return state === "complete";
        } catch {
          return false;
        }
      },
      {
        timeout,
        interval: 200,
        timeoutMsg: "Document did not reach ready state",
      }
    );
  }

  /**
   * Check if we're currently in a webview context.
   */
  public static async isInWebView(): Promise<boolean> {
    const context = await this.getCurrentContext();
    return context !== "NATIVE_APP" && (context.startsWith("WEBVIEW") || context.includes("WEBVIEW"));
  }

  /**
   * Check if we're currently in native app context.
   */
  public static async isInNativeApp(): Promise<boolean> {
    const context = await this.getCurrentContext();
    return context === "NATIVE_APP";
  }

  /**
   * Execute a function in webview context and return to original context.
   */
  public static async executeInWebView<T>(
    fn: () => T | Promise<T>,
    webviewPattern?: string | RegExp
  ): Promise<T> {
    const originalContext = await this.getCurrentContext();
    
    try {
      await this.switchToWebView(webviewPattern);
      return await fn();
    } finally {
      await this.switchToContext(originalContext);
    }
  }

  /**
   * Execute a function in native context and return to original context.
   */
  public static async executeInNativeApp<T>(fn: () => T | Promise<T>): Promise<T> {
    const originalContext = await this.getCurrentContext();
    
    try {
      await this.switchToNativeApp();
      return await fn();
    } finally {
      await this.switchToContext(originalContext);
    }
  }
}
