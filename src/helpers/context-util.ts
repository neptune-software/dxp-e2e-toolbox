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

import { Environment } from "../core/environment.js";
import { ToolboxError } from "../core/errors.js";
import { OAuthProvider } from "../core/types.js";
import { DEFAULT_TIMEOUTS } from "./wait-utils.js";
import { WindowHandleUtil } from "./window-handle-util.js";

/**
 * Types of contexts we can be in.
 */
export type ContextType = 
  | "native"       // Native app context (NATIVE_APP)
  | "webview"      // Main app webview (WEBVIEW_*)
  | "oauth"        // OAuth browser window
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
    super(`Context operation "${operation}" failed: ${message}`, "CONTEXT_ERROR");
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
    return await this.browser.getContext() as string;
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
    return names.map(name => this.classifyContext(name));
  }

  /**
   * Check if a context is the main app webview.
   */
  private isMainAppContext(contextName: string, appId?: string): boolean {
    // If we have a cached main app context, use that
    if (this.mainAppContext) {
      return contextName === this.mainAppContext;
    }

    // If we have a cached main app ID, check against it
    if (this.mainAppId && appId) {
      return appId === this.mainAppId || appId.includes(this.mainAppId);
    }

    // Heuristics for Neptune apps (Android uses package names like com.neptune.xxx)
    const neptunePatterns = [
      /com\.neptune\./i,
      /neptune/i,
    ];

    if (appId) {
      if (neptunePatterns.some(p => p.test(appId))) {
        return true;
      }
      
      // iOS uses numeric webview IDs like "3113.2" - these are valid main app candidates
      // We can't distinguish them by name alone, so we'll let the fallback logic handle it
      // For now, return false and rely on the single-webview fallback or explicit selection
    }

    return false;
  }
  
  /**
   * Check if an appId looks like an iOS numeric webview ID.
   */
  private isIOSNumericWebviewId(appId: string): boolean {
    // iOS webview IDs are numeric like "3113.2", "3113.4"
    return /^\d+(\.\d+)?$/.test(appId);
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
      okta: [
        /\.okta\.com/i,
        /oktapreview\.com/i,
      ],
      "btp-ias": [
        /accounts\.sap\.com/i,
        /\.authentication\./i,
        /ondemand\.com/i,
      ],
    };

    for (const [provider, regexes] of Object.entries(patterns)) {
      if (regexes.some(r => r.test(contextOrUrl))) {
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
        `Could not switch to context "${contextName}": ${error}`
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
   */
  public async switchToMainWebview(options: ContextSwitchOptions = {}): Promise<void> {
    const { timeout = DEFAULT_TIMEOUTS.medium, interval = 500 } = options;

    // If we have a cached main context, try it first
    if (this.mainAppContext) {
      try {
        await this.switchToContext(this.mainAppContext);
        return;
      } catch {
        // Cache is stale, clear and retry
        this.mainAppContext = undefined;
      }
    }

    // Wait for main webview to be available
    await this.browser.waitUntil(
      async () => {
        const contexts = await this.getAllContexts();
        const mainWebview = contexts.find(c => c.type === "webview" && c.isMainApp);
        
        if (mainWebview) {
          this.mainAppContext = mainWebview.name;
          this.mainAppId = mainWebview.appId;
          return true;
        }

        // Get all webviews
        const webviews = contexts.filter(c => c.type === "webview");
        
        // Fallback 1: if only one webview exists, assume it's the main app
        if (webviews.length === 1) {
          this.mainAppContext = webviews[0].name;
          this.mainAppId = webviews[0].appId;
          return true;
        }
        
        // Fallback 2: iOS uses numeric webview IDs (e.g., WEBVIEW_3113.2)
        // When there are multiple numeric webviews, pick the first non-Chrome one
        if (webviews.length > 0) {
          // Filter out Chrome/browser webviews
          const appWebviews = webviews.filter(w => 
            w.appId && 
            !w.appId.toLowerCase().includes("chrome") &&
            !w.appId.toLowerCase().includes("browser")
          );
          
          // If all remaining webviews have numeric IDs (iOS), pick the first one
          // iOS webview IDs are like "3113.2", "3113.4"
          const iosWebviews = appWebviews.filter(w => 
            w.appId && this.isIOSNumericWebviewId(w.appId)
          );
          
          if (iosWebviews.length > 0) {
            // On iOS, the first numeric webview is typically the main app
            this.mainAppContext = iosWebviews[0].name;
            this.mainAppId = iosWebviews[0].appId;
            console.log(`[ContextUtil] iOS: Selected webview ${this.mainAppContext} as main app`);
            return true;
          }
          
          // If we have webviews but none match our patterns, just take the first one
          if (appWebviews.length > 0) {
            this.mainAppContext = appWebviews[0].name;
            this.mainAppId = appWebviews[0].appId;
            console.log(`[ContextUtil] Fallback: Selected webview ${this.mainAppContext} as main app`);
            return true;
          }
        }

        return false;
      },
      {
        timeout,
        interval,
        timeoutMsg: "Could not find main app webview",
      }
    );

    await this.switchToContext(this.mainAppContext!);
  }

  /**
   * Ensure we're in the main app webview.
   * Switches if necessary.
   */
  public async ensureInWebview(options: ContextSwitchOptions = {}): Promise<void> {
    const current = await this.getCurrentContext();
    
    if (current.type === "webview" && current.isMainApp && !options.forceInject) {
      // Already in main webview and not forcing reinjection
      if (options.injectUI5) {
        await this.injectUI5(false);
      }
      return;
    }

    if (current.type !== "webview" || !current.isMainApp) {
      await this.switchToMainWebview(options);
    }

    // Optionally inject UI5 bridge
    if (options.injectUI5 || options.forceInject) {
      await this.injectUI5(options.forceInject ?? false);
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
  public async waitForOAuthWindow(options: OAuthWindowOptions = {}): Promise<void> {
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
        const newContexts = currentContexts.filter(c => !initialContexts.includes(c));
        
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
          const newHandles = currentHandles.filter(h => !initialHandles.includes(h));
          
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
      }
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
        '~Continue',
        '~Allow',
        '~OK',
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
  public async returnToMainApp(options: ContextSwitchOptions = {}): Promise<void> {
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

      if (typeof this.browser.injectUI5 === "function") {
        console.log("[ContextUtil] Injecting UI5/wdi5 bridge");
        await this.browser.injectUI5();
      }
    } catch (error) {
      console.warn(`[ContextUtil] UI5 injection: ${error}`);
    }
  }

  /**
   * Wait for UI5 to be ready in current context.
   */
  public async waitForUI5Ready(timeout: number = DEFAULT_TIMEOUTS.medium): Promise<void> {
    await this.browser.waitUntil(
      async () => {
        try {
          const ready = await this.browser.execute(() => {
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
      }
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Execute a function in the main webview context.
   * Switches contexts if needed and returns afterward.
   */
  public async executeInWebview<T>(fn: () => Promise<T>, options: ContextSwitchOptions = {}): Promise<T> {
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
