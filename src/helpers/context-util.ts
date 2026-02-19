/**
 * Context Utilities
 *
 * Handles all the complexity of context/window switching for BOTH:
 * - Mobile apps: webview/native context switching
 * - Browser apps: tab/window switching for OAuth flows
 *
 * Features:
 * - Automatic context detection and classification
 * - Seamless switching between native and webview contexts (mobile)
 * - Seamless switching between browser tabs/windows (browser)
 * - OAuth window detection and handling (both mobile and browser)
 * - iOS permission dialogs
 * - Resilient operations that "just work"
 *
 * The goal is to abstract away all platform-specific complexity so tests
 * can focus on business logic, not context/window juggling.
 */

/// <reference types="webdriverio" />
/// <reference types="@wdio/globals/types" />
/// <reference types="wdio-ui5-service" />

import { Environment } from "../core/environment.js";
import { ToolboxError } from "../core/errors.js";
import { OAuthProvider } from "../core/types.js";
import { DEFAULT_TIMEOUTS } from "./wait-utils.js";
import { WindowHandleUtil } from "./window-handle-util.js";

/**
 * Types of contexts we can be in.
 */
export type ContextType =
  | "native" // Native app context (NATIVE_APP)
  | "webview" // Main app webview (WEBVIEW_*)
  | "oauth" // OAuth browser window
  | "unknown";

/**
 * Information about the current context.
 */
export interface ContextInfo {
  /** Raw context name from driver */
  name: string;

  /** Classified type */
  type: ContextType;

  /** Platform */
  platform: "ios" | "android" | "unknown";

  /** Whether this is the main app webview */
  isMainApp: boolean;

  /** Detected OAuth provider if in OAuth context */
  oauthProvider?: OAuthProvider;

  /** App package/bundle this webview belongs to */
  appId?: string;
}

/**
 * Options for context switching operations.
 */
export interface ContextSwitchOptions {
  /** Timeout for waiting operations (ms) */
  timeout?: number;

  /** Interval between checks (ms) */
  interval?: number;

  /** Whether to inject wdi5/UI5 bridge after switching */
  injectUI5?: boolean;

  /** Force reinject UI5/wdi5 bridge even if it appears to exist (useful after app restart) */
  forceInject?: boolean;
}

/**
 * Options for OAuth window handling.
 */
export interface OAuthWindowOptions extends ContextSwitchOptions {
  /** The OAuth provider to look for */
  provider?: OAuthProvider;

  /** Whether to handle iOS permission dialog */
  handlePermissionDialog?: boolean;

  /** Callback to trigger login button if needed */
  triggerLogin?: () => Promise<void>;
}

/**
 * Error thrown when context operations fail.
 */
export class ContextError extends ToolboxError {
  public readonly operation: string;

  constructor(operation: string, message: string) {
    super(
      `Context operation "${operation}" failed: ${message}`,
      "CONTEXT_ERROR",
    );
    this.name = "ContextError";
    this.operation = operation;
  }
}

/**
 * Singleton utility for managing contexts (mobile webviews and browser tabs).
 *
 * Works for both mobile and browser scenarios:
 * - Mobile: Switches between NATIVE_APP and WEBVIEW_* contexts
 * - Browser: Switches between browser tabs/windows for OAuth flows
 *
 * @example
 * ```typescript
 * const ctx = ContextUtil.getInstance();
 *
 * // Ensure we're in the main webview
 * await ctx.ensureInWebview();
 *
 * // Handle OAuth flow
 * await ctx.waitForOAuthWindow({
 *   provider: 'azure',
 *   triggerLogin: async () => await Launchpad.clickLogin()
 * });
 *
 * // Return to main app after OAuth
 * await ctx.returnToMainApp();
 * ```
 */
export class ContextUtil {
  private static instance: ContextUtil;

  /** Cached main app context name */
  private mainAppContext?: string;

  /** Cached main app package/bundle ID */
  private mainAppId?: string;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  public static getInstance(): ContextUtil {
    if (!ContextUtil.instance) {
      ContextUtil.instance = new ContextUtil();
    }
    return ContextUtil.instance;
  }

  /**
   * Reset the singleton (clears cached context info).
   */
  public static reset(): void {
    ContextUtil.instance = new ContextUtil();
  }

  /**
   * Clear cached context information.
   * Call this after app restart when contexts may have changed.
   */
  public clearCache(): void {
    this.mainAppContext = undefined;
    this.mainAppId = undefined;
  }

  /**
   * Get the browser/driver instance.
   */
  private get browser(): WebdriverIO.Browser {
    return Environment.getInstance().browser;
  }

  /**
   * Check if running on Android.
   */
  public isAndroid(): boolean {
    return this.browser.isAndroid === true;
  }

  /**
   * Check if running on iOS.
   */
  public isIOS(): boolean {
    return this.browser.isIOS === true;
  }

  /**
   * Get the platform name.
   */
  public getPlatform(): "ios" | "android" | "unknown" {
    if (this.isAndroid()) return "android";
    if (this.isIOS()) return "ios";
    return "unknown";
  }

  // ==================== Context Information ====================

  /**
   * Get the current context name.
   */
  public async getCurrentContextName(): Promise<string> {
    return (await this.browser.getContext()) as string;
  }

  /**
   * Get all available contexts.
   */
  public async getAllContextNames(): Promise<string[]> {
    const contexts = await this.browser.getContexts();
    return contexts as string[];
  }

  /**
   * Classify a context name.
   */
  public classifyContext(contextName: string): ContextInfo {
    const platform = this.getPlatform();

    // Native context
    if (contextName === "NATIVE_APP") {
      return {
        name: contextName,
        type: "native",
        platform,
        isMainApp: false,
      };
    }

    // Webview context - extract app ID
    const webviewMatch = contextName.match(/WEBVIEW_(.+)/i);
    if (webviewMatch) {
      const appId = webviewMatch[1];
      return {
        name: contextName,
        type: "webview",
        platform,
        isMainApp: this.isMainAppContext(contextName, appId),
        appId,
      };
    }

    // Check for OAuth patterns
    const oauthProvider = this.detectOAuthProvider(contextName);
    if (oauthProvider) {
      return {
        name: contextName,
        type: "oauth",
        platform,
        isMainApp: false,
        oauthProvider,
      };
    }

    return {
      name: contextName,
      type: "unknown",
      platform,
      isMainApp: false,
    };
  }

  /**
   * Get detailed info about the current context.
   */
  public async getCurrentContext(): Promise<ContextInfo> {
    const name = await this.getCurrentContextName();
    return this.classifyContext(name);
  }

  /**
   * Get info about all available contexts.
   */
  public async getAllContexts(): Promise<ContextInfo[]> {
    const names = await this.getAllContextNames();
    return names.map((name) => this.classifyContext(name));
  }

  /**
   * Check if a context is the main app webview (synchronous heuristic check).
   * Used by classifyContext which must be sync.
   * For definitive detection, use probeForNeptuneApp() which actually
   * switches into the context and checks for the `neptune` global.
   */
  private isMainAppContext(contextName: string, appId?: string): boolean {
    if (this.mainAppContext) {
      return contextName === this.mainAppContext;
    }

    if (this.mainAppId && appId) {
      return appId === this.mainAppId || appId.includes(this.mainAppId);
    }

    // Android: package names like com.neptune.basicpin
    if (appId && /neptune/i.test(appId)) {
      return true;
    }

    return false;
  }

  /**
   * Probe a webview context to check if it contains the Neptune app
   * by looking for the `neptune` global variable on `window`.
   * 
   * This is the definitive way to find the main app webview because
   * Neptune DXP always exposes `window.neptune`. This works regardless
   * of platform (Android package name vs iOS numeric webview ID).
   * 
   * @returns true if the context contains the Neptune app
   */
  private async probeForNeptuneApp(contextName: string): Promise<boolean> {
    try {
      await this.browser.switchContext(contextName);
      const hasNeptune = await this.browser.execute(() => {
        return typeof (window as any).neptune !== "undefined";
      });
      return hasNeptune === true;
    } catch {
      return false;
    }
  }

  /**
   * Detect OAuth provider from context/URL.
   */
  private detectOAuthProvider(contextOrUrl: string): OAuthProvider | undefined {
    const patterns: Record<OAuthProvider, RegExp[]> = {
      azure: [
        /login\.microsoftonline\.com/i,
        /login\.windows\.net/i,
        /login\.microsoft\.com/i,
        /microsoftonline/i,
      ],
      okta: [/\.okta\.com/i, /oktapreview\.com/i],
      "btp-ias": [
        /accounts\.sap\.com/i,
        /\.authentication\./i,
        /ondemand\.com/i,
      ],
    };

    for (const [provider, regexes] of Object.entries(patterns)) {
      if (regexes.some((r) => r.test(contextOrUrl))) {
        return provider as OAuthProvider;
      }
    }

    return undefined;
  }

  // ==================== Context Switching ====================

  /**
   * Switch to a specific context by name.
   */
  public async switchToContext(contextName: string): Promise<void> {
    try {
      await this.browser.switchContext(contextName);
    } catch (error) {
      throw new ContextError(
        "switchToContext",
        `Could not switch to context "${contextName}": ${error}`,
      );
    }
  }

  /**
   * Switch to native context.
   */
  public async switchToNative(): Promise<void> {
    await this.switchToContext("NATIVE_APP");
  }

  /**
   * Find and switch to the main app webview.
   * 
   * Detection strategy (in order):
   * 1. Use cached context if available
   * 2. Heuristic match (Android package name contains "neptune")
   * 3. Probe each webview for `window.neptune` global (definitive)
   * 4. Fallback to the first non-browser webview
   */
  public async switchToMainWebview(
    options: ContextSwitchOptions = {},
  ): Promise<void> {
    const { timeout = DEFAULT_TIMEOUTS.medium, interval = 500 } = options;

    // Fast path: cached context
    if (this.mainAppContext) {
      try {
        await this.switchToContext(this.mainAppContext);
        return;
      } catch {
        this.mainAppContext = undefined;
      }
    }

    await this.browser.waitUntil(
      async () => {
        const contextNames = await this.getAllContextNames();
        const webviewNames = contextNames.filter(
          (c) => c.includes("WEBVIEW") && !c.toLowerCase().includes("chrome"),
        );

        if (webviewNames.length === 0) return false;

        // Single webview: it's the one
        if (webviewNames.length === 1) {
          this.mainAppContext = webviewNames[0];
          console.log(`[ContextUtil] Single webview found: ${this.mainAppContext}`);
          return true;
        }

        // Multiple webviews: try heuristic first (fast, no context switch needed)
        const heuristicMatch = webviewNames.find((name) => /neptune/i.test(name));
        if (heuristicMatch) {
          this.mainAppContext = heuristicMatch;
          console.log(`[ContextUtil] Heuristic match: ${this.mainAppContext}`);
          return true;
        }

        // Probe each webview for window.neptune (definitive but slower)
        console.log(`[ContextUtil] Probing ${webviewNames.length} webviews for Neptune app...`);
        for (const name of webviewNames) {
          if (await this.probeForNeptuneApp(name)) {
            this.mainAppContext = name;
            const appId = name.match(/WEBVIEW_(.+)/i)?.[1];
            if (appId) this.mainAppId = appId;
            console.log(`[ContextUtil] Probe found Neptune app in: ${this.mainAppContext}`);
            return true;
          }
        }

        // Last resort: take the first one
        this.mainAppContext = webviewNames[0];
        console.log(`[ContextUtil] Fallback to first webview: ${this.mainAppContext}`);
        return true;
      },
      {
        timeout,
        interval,
        timeoutMsg: "Could not find main app webview",
      },
    );

    await this.switchToContext(this.mainAppContext!);
  }

  /**
   * Ensure we're in the main app webview.
   * Switches if necessary.
   * 
   * Uses `window.neptune` probe to definitively identify the correct webview
   * when heuristics alone cannot determine it.
   */
  public async ensureInWebview(
    options: ContextSwitchOptions = {},
  ): Promise<void> {
    // iOS: Wait for any InAppBrowser cookie sync to complete
    if (this.isIOS()) {
      await this.waitForInAppBrowserToClose();
    }

    const currentName = await this.getCurrentContextName();

    // If we already know this is the main app context, skip
    if (currentName === this.mainAppContext && !options.forceInject) {
      if (options.injectUI5) {
        await this.injectUI5(false);
      }
      return;
    }

    // If we're in a webview but don't know if it's the main app,
    // probe it instead of blindly switching away
    if (currentName.includes("WEBVIEW") && !this.mainAppContext) {
      try {
        const hasNeptune = await this.browser.execute(() => {
          return typeof (window as any).neptune !== "undefined";
        });
        if (hasNeptune) {
          this.mainAppContext = currentName;
          const appId = currentName.match(/WEBVIEW_(.+)/i)?.[1];
          if (appId) this.mainAppId = appId;
          console.log(`[ContextUtil] Already in Neptune app webview: ${currentName}`);
          if (options.injectUI5 || options.forceInject) {
            await this.injectUI5(options.forceInject ?? false);
          }
          return;
        }
      } catch {
        // execute failed, need to switch
      }
    }

    // Not in main webview, find it
    await this.switchToMainWebview(options);

    if (options.injectUI5 || options.forceInject) {
      await this.injectUI5(options.forceInject ?? false);
    }
  }

  /**
   * Wait for any InAppBrowser (extra webview) to close.
   *
   * This handles scenarios where the framework opens InAppBrowser:
   * - iOS cookie sync after PIN entry
   * - Background auth refresh
   * - Token validation
   *
   * The InAppBrowser should close automatically once the operation completes.
   * If it appears stuck (blank screen), this method will attempt to recover.
   *
   * @param timeout - Maximum time to wait in ms (default 30s)
   * @param expectedWebviewCount - Expected number of webviews after close (default 2)
   */
  public async waitForInAppBrowserToClose(
    timeout: number = 30000,
    expectedWebviewCount: number = 2,
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000;
    const stuckThreshold = 10000; // Consider stuck if no change for 10s
    let lastChangeTime = Date.now();
    let lastWebviewCount = 0;
    let stuckWebviewUrl: string | null = null;

    // First check if there are extra webviews that might be InAppBrowser
    let contexts = await this.getAllContextNames();
    let webviewContexts = contexts.filter(
      (c) => c.includes("WEBVIEW") && !c.toLowerCase().includes("chrome"),
    );

    // If we have 3+ webviews on iOS, one might be InAppBrowser for cookie sync
    // Normal state: NATIVE_APP + 1-2 app webviews
    // Cookie sync state: NATIVE_APP + 2-3 webviews (extra one is InAppBrowser)
    const initialWebviewCount = webviewContexts.length;
    lastWebviewCount = initialWebviewCount;

    if (initialWebviewCount <= 2) {
      // Normal state, no extra webviews
      console.log(
        `[ContextUtil] iOS: No extra webviews detected (${initialWebviewCount}), cookie sync not needed`,
      );
      return;
    }

    console.log(
      `[ContextUtil] iOS: Detected ${initialWebviewCount} webviews, waiting for InAppBrowser cookie sync...`,
    );

    // Capture the original/main app webview to return to later
    const mainAppWebview = this.mainAppContext || webviewContexts[0];

    // Wait for webview count to decrease (InAppBrowser closing)
    while (Date.now() - startTime < timeout) {
      await this.browser.pause(pollInterval);

      contexts = await this.getAllContextNames();
      webviewContexts = contexts.filter(
        (c) => c.includes("WEBVIEW") && !c.toLowerCase().includes("chrome"),
      );

      if (webviewContexts.length !== lastWebviewCount) {
        lastChangeTime = Date.now();
        lastWebviewCount = webviewContexts.length;
      }

      if (webviewContexts.length < initialWebviewCount) {
        console.log(
          `[ContextUtil] iOS: InAppBrowser closed (webviews: ${initialWebviewCount} -> ${webviewContexts.length})`,
        );
        await this.browser.pause(500);
        return;
      }

      // Check if stuck (no change for too long)
      const stuckDuration = Date.now() - lastChangeTime;
      if (stuckDuration > stuckThreshold) {
        console.log(
          `[ContextUtil] iOS: InAppBrowser appears stuck (no change for ${Math.round(stuckDuration / 1000)}s)`,
        );

        // Try to diagnose the stuck state
        const extraWebviews = webviewContexts.filter(
          (w) => w !== mainAppWebview,
        );

        for (const ctx of extraWebviews) {
          try {
            await this.browser.switchContext(ctx);
            const url = await this.browser.getUrl();
            console.log(`[ContextUtil] iOS: Stuck webview ${ctx} URL: ${url}`);
            stuckWebviewUrl = url;

            // If it's a blank or about:blank page, the cookie sync likely failed
            if (url === "about:blank" || url === "" || !url) {
              console.log(
                `[ContextUtil] iOS: InAppBrowser shows blank - cookie sync may have failed`,
              );

              // Try to close the InAppBrowser by navigating back to main webview
              // The framework should eventually close it
            }
          } catch (e) {
            console.log(
              `[ContextUtil] iOS: Cannot access stuck webview ${ctx}: ${e}`,
            );
          }
        }

        // After diagnosing, switch back to main app webview
        try {
          await this.browser.switchContext(mainAppWebview);
        } catch (e) {
          console.log(
            `[ContextUtil] iOS: Failed to switch back to main webview: ${e}`,
          );
        }

        // If stuck for too long, break out and let the test continue
        // The framework may eventually close the InAppBrowser
        if (stuckDuration > 20000) {
          console.log(
            `[ContextUtil] iOS: InAppBrowser stuck for too long, proceeding anyway`,
          );
          console.log(
            `[ContextUtil] iOS: Last known stuck URL: ${stuckWebviewUrl}`,
          );
          return;
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 5 === 0) {
        console.log(
          `[ContextUtil] iOS: Waiting for InAppBrowser to close... (${elapsed}s, webviews: ${webviewContexts.length})`,
        );
      }
    }

    console.log(
      `[ContextUtil] iOS: Timeout waiting for InAppBrowser to close after ${Math.round(timeout / 1000)}s`,
    );
    console.log(
      `[ContextUtil] iOS: Current webview count: ${webviewContexts.length}, expected: ${expectedWebviewCount}`,
    );

    // Switch back to main app webview before returning
    try {
      await this.browser.switchContext(mainAppWebview);
      console.log(
        `[ContextUtil] iOS: Switched back to main app webview: ${mainAppWebview}`,
      );
    } catch (e) {
      console.log(`[ContextUtil] iOS: Failed to switch to main webview: ${e}`);
    }
  }

  /**
   * Ensure we're in native context.
   */
  public async ensureInNative(): Promise<void> {
    const current = await this.getCurrentContext();

    if (current.type === "native") {
      return; // Already in native
    }

    await this.switchToNative();
  }

  // ==================== OAuth Window Handling ====================

  /**
   * Wait for an OAuth window to appear and switch to it.
   *
   * This handles the complexity of:
   * - Checking if already in OAuth window
   * - Triggering login button if needed
   * - Waiting for new window/context
   * - iOS permission dialogs
   */
  public async waitForOAuthWindow(
    options: OAuthWindowOptions = {},
  ): Promise<void> {
    const {
      timeout = DEFAULT_TIMEOUTS.long,
      interval = 1000,
      provider,
      handlePermissionDialog = true,
      triggerLogin,
    } = options;

    // Check if already in an OAuth context
    const current = await this.getCurrentContext();
    if (current.type === "oauth") {
      if (!provider || current.oauthProvider === provider) {
        return; // Already in the right place
      }
    }

    // Store initial state
    const initialContexts = await this.getAllContextNames();
    const windowHandleUtil = WindowHandleUtil.getInstance();
    let initialHandles: string[] = [];

    try {
      initialHandles = await windowHandleUtil.getWindowHandles();
    } catch {
      // Window handles may not be available in all contexts
    }

    // Trigger login if provided
    if (triggerLogin) {
      try {
        await triggerLogin();
      } catch (error) {
        // Login trigger might fail if already triggered by app
        console.log(`[ContextUtil] Login trigger: ${error}`);
      }
    }

    // Handle iOS permission dialog if needed
    if (this.isIOS() && handlePermissionDialog) {
      await this.handleIOSPermissionDialog();
    }

    // Wait for new OAuth context or window
    await this.browser.waitUntil(
      async () => {
        // Check for new contexts
        const currentContexts = await this.getAllContextNames();
        const newContexts = currentContexts.filter(
          (c) => !initialContexts.includes(c),
        );

        for (const ctx of newContexts) {
          const info = this.classifyContext(ctx);
          if (info.type === "oauth" || info.type === "webview") {
            if (!provider || info.oauthProvider === provider) {
              await this.switchToContext(ctx);
              return true;
            }
          }
        }

        // Check for new window handles (browser-based OAuth)
        try {
          const currentHandles = await windowHandleUtil.getWindowHandles();
          const newHandles = currentHandles.filter(
            (h) => !initialHandles.includes(h),
          );

          if (newHandles.length > 0) {
            await windowHandleUtil.switchToWindow(newHandles[0]);

            // Verify it's an OAuth window by checking URL
            const url = await this.browser.getUrl();
            const detectedProvider = this.detectOAuthProvider(url);

            if (!provider || detectedProvider === provider) {
              return true;
            }
          }
        } catch {
          // Window handles not available
        }

        return false;
      },
      {
        timeout,
        interval,
        timeoutMsg: `OAuth window${provider ? ` for ${provider}` : ""} did not appear`,
      },
    );
  }

  /**
   * Handle iOS permission dialog for OAuth.
   * This dialog asks if you want to continue in Safari/etc.
   */
  public async handleIOSPermissionDialog(): Promise<void> {
    if (!this.isIOS()) return;

    try {
      // Switch to native to interact with dialog
      await this.switchToNative();
      await this.browser.pause(500);

      // Look for common iOS permission dialog buttons
      const continueSelectors = [
        "~Continue",
        "~Allow",
        "~OK",
        '**/XCUIElementTypeButton[`label == "Continue"`]',
        '**/XCUIElementTypeButton[`label == "Allow"`]',
      ];

      for (const selector of continueSelectors) {
        try {
          const element = await this.browser.$(selector);
          if (await element.isDisplayed()) {
            await element.click();
            await this.browser.pause(1000);
            return;
          }
        } catch {
          // Element not found, try next
        }
      }
    } catch (error) {
      // Dialog might not exist, which is fine
      console.log(`[ContextUtil] Permission dialog handling: ${error}`);
    }
  }

  /**
   * Return to the main app after OAuth flow.
   * Handles closing OAuth windows and switching contexts.
   */
  public async returnToMainApp(
    options: ContextSwitchOptions = {},
  ): Promise<void> {
    const { injectUI5 = true } = options;

    try {
      // Try to close any OAuth windows
      const windowHandleUtil = WindowHandleUtil.getInstance();
      await windowHandleUtil.closeOAuthWindows();
    } catch {
      // May not have window handles
    }

    // Clear cached handles since they may be stale
    WindowHandleUtil.getInstance().clearCache();

    // Switch back to main webview
    await this.switchToMainWebview(options);

    // Inject UI5 bridge
    if (injectUI5) {
      await this.injectUI5();
    }
  }

  // ==================== UI5 Bridge ====================

  /**
   * Inject wdi5/UI5 bridge into current context.
   * @param force - Force reinjection even if wdi5 appears to exist
   */
  public async injectUI5(force: boolean = false): Promise<void> {
    try {
      if (!force) {
        // Check if already injected
        const hasWdi5 = await this.browser.execute(() => {
          return typeof window.wdi5 !== "undefined";
        });

        if (hasWdi5) {
          console.log("[ContextUtil] wdi5 already present, skipping injection");
          return; // Already injected
        }
      }

      //@ts-ignore
      if (typeof this.browser.injectUI5 === "function") {
        console.log("[ContextUtil] Injecting UI5/wdi5 bridge");
        //@ts-ignore
        await this.browser.injectUI5();
      }
    } catch (error) {
      console.warn(`[ContextUtil] UI5 injection: ${error}`);
    }
  }

  /**
   * Wait for UI5 to be ready in current context.
   */
  public async waitForUI5Ready(
    timeout: number = DEFAULT_TIMEOUTS.medium,
  ): Promise<void> {
    await this.browser.waitUntil(
      async () => {
        try {
          const ready = await this.browser.execute(() => {
            //@ts-ignore
            const core = window.sap?.ui?.getCore?.();
            return core ? core.isInitialized() : false;
          });
          return ready === true;
        } catch {
          return false;
        }
      },
      {
        timeout,
        interval: 500,
        timeoutMsg: "UI5 did not become ready",
      },
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Execute a function in the main webview context.
   * Switches contexts if needed and returns afterward.
   */
  public async executeInWebview<T>(
    fn: () => Promise<T>,
    options: ContextSwitchOptions = {},
  ): Promise<T> {
    const originalContext = await this.getCurrentContextName();
    const current = await this.getCurrentContext();

    try {
      if (current.type !== "webview" || !current.isMainApp) {
        await this.ensureInWebview(options);
      }

      return await fn();
    } finally {
      // Try to restore original context if different
      const finalContext = await this.getCurrentContextName();
      if (finalContext !== originalContext) {
        try {
          await this.switchToContext(originalContext);
        } catch {
          // Original context may no longer exist
        }
      }
    }
  }

  /**
   * Execute a function in native context.
   * Switches contexts if needed and returns afterward.
   */
  public async executeInNative<T>(fn: () => Promise<T>): Promise<T> {
    const originalContext = await this.getCurrentContextName();
    const current = await this.getCurrentContext();

    try {
      if (current.type !== "native") {
        await this.ensureInNative();
      }

      return await fn();
    } finally {
      // Try to restore original context if different
      const finalContext = await this.getCurrentContextName();
      if (finalContext !== originalContext) {
        try {
          await this.switchToContext(originalContext);
        } catch {
          // Original context may no longer exist
        }
      }
    }
  }

  /**
   * Get a snapshot of context state for debugging.
   */
  public async getDebugInfo(): Promise<Record<string, unknown>> {
    const currentName = await this.getCurrentContextName();
    const allNames = await this.getAllContextNames();
    const allContexts = await this.getAllContexts();

    let windowHandles: string[] = [];
    try {
      windowHandles = await WindowHandleUtil.getInstance().getWindowHandles();
    } catch {
      // Not available
    }

    return {
      currentContext: currentName,
      currentInfo: this.classifyContext(currentName),
      allContexts: allNames,
      allContextsInfo: allContexts,
      windowHandles,
      cachedMainContext: this.mainAppContext,
      cachedMainAppId: this.mainAppId,
      platform: this.getPlatform(),
    };
  }
}
