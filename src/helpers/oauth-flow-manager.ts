/**
 * OAuth Flow Manager - Unified Handler for All OAuth Complexity
 * 
 * =============================================================================
 * PURPOSE
 * =============================================================================
 * 
 * This class encapsulates ALL the complexity of OAuth flows in mobile apps:
 * - Permission dialog handling (iOS "wants to sign in" dialogs)
 * - Auto-login vs manual-login detection
 * - Context/webview switching (finding Safari, Chrome, InAppBrowser, etc.)
 * - OAuth provider login execution
 * - Return to app and wdi5 re-injection
 * 
 * Supports TWO modes:
 * 1. **Native Browser Mode** (default): Safari/Chrome opens externally
 *    - iOS uses ASWebAuthenticationSession (shows "App wants to sign in" dialog)
 *    - Android uses Chrome Custom Tabs
 * 
 * 2. **InAppBrowser Mode**: Cordova InAppBrowser opens within the app
 *    - No native dialog, opens as a webview inside the app
 *    - Uses `browserMode: "inappbrowser"` option
 * 
 * =============================================================================
 * USAGE
 * =============================================================================
 * 
 * ```typescript
 * const oauthManager = OAuthFlowManager.getInstance();
 * 
 * // Native browser OAuth (Safari/Chrome)
 * await oauthManager.performLogin({
 *   provider: "azure",
 *   credentials: { email: "user@example.com", password: "secret" },
 * });
 * 
 * // InAppBrowser OAuth (Cordova)
 * await oauthManager.performLogin({
 *   provider: "azure",
 *   browserMode: "inappbrowser",
 *   credentials: { email: "user@example.com", password: "secret" },
 * });
 * 
 * // Custom OAuth provider URL detection
 * await oauthManager.performLogin({
 *   provider: "azure",
 *   credentials: { email: "user@example.com", password: "secret" },
 *   customOAuthUrlPatterns: ["my-custom-idp.com", "corp-login.example.com"],
 *   isOAuthPageCallback: async (url) => {
 *     // Custom logic to detect if we're on the OAuth page
 *     return url.includes("my-custom-idp.com");
 *   },
 * });
 * ```
 * 
 * =============================================================================
 */

/// <reference types="webdriverio" />
/// <reference types="@wdio/globals/types" />

import type { Context } from "@wdio/protocols";
import { AzureLogin, AzureLoginOptions } from "../oauth/azure-login.js";
import { OktaLogin, OktaLoginOptions } from "../oauth/okta-login.js";
import { BtpIasLogin, BtpIasLoginOptions } from "../oauth/btp-ias-login.js";
import { ToolboxFactory } from "../core/toolbox-factory.js";

/**
 * Extended browser interface with wdi5 commands
 */
interface BrowserWithWdi5 extends WebdriverIO.Browser {
  injectUI5(): Promise<void>;
}

/**
 * Supported OAuth providers
 */
export type OAuthProvider = "azure" | "okta" | "btp-ias" | "sap-basic" | "custom";

/**
 * Browser mode for OAuth
 * - "native": Safari (iOS) or Chrome Custom Tabs (Android) - external browser
 * - "inappbrowser": Cordova InAppBrowser - opens within the app
 */
export type OAuthBrowserMode = "native" | "inappbrowser";

/**
 * Credentials for different OAuth providers
 */
export interface OAuthCredentials {
  email: string;
  password: string;
  /** Azure-specific: stay signed in */
  staySignedIn?: boolean;
  /** Okta-specific: remember me */
  rememberMe?: boolean;
  /** BTP-specific: keep me signed in */
  keepMeSignedIn?: boolean;
}

/**
 * Callback function to check if we're on the OAuth/authorize page.
 * Use this for custom OAuth providers not built into the manager.
 * 
 * @param url - The current page URL
 * @returns true if this URL is an OAuth/authorization page
 * 
 * @example
 * ```typescript
 * isOAuthPageCallback: async (url) => {
 *   return url.includes("my-custom-idp.com/authorize");
 * }
 * ```
 */
export type IsOAuthPageCallback = (url: string) => boolean | Promise<boolean>;

/**
 * Custom login handler for OAuth providers not built into the manager.
 * 
 * @example
 * ```typescript
 * customLoginHandler: async () => {
 *   // Perform custom login steps
 *   await browser.$('#username').setValue('user');
 *   await browser.$('#password').setValue('pass');
 *   await browser.$('#submit').click();
 * }
 * ```
 */
export type CustomLoginHandler = () => Promise<void>;

/**
 * Options for performing an OAuth login flow
 */
export interface PerformOAuthLoginOptions {
  /** 
   * The OAuth provider to use.
   * Use "custom" with customLoginHandler for unsupported providers.
   */
  provider: OAuthProvider;
  
  /** Login credentials */
  credentials: OAuthCredentials;
  
  /** 
   * Name of the launchpad (used for manual login button click).
   * Required when OAuth is not auto-triggered.
   */
  launchpadName?: string;
  
  /**
   * Browser mode: "native" (Safari/Chrome) or "inappbrowser" (Cordova).
   * Defaults to "native".
   */
  browserMode?: OAuthBrowserMode;
  
  /** 
   * Custom SAP basic login handler.
   * Required when provider is "sap-basic".
   */
  sapBasicLoginHandler?: CustomLoginHandler;
  
  /**
   * Custom login handler for unsupported OAuth providers.
   * Required when provider is "custom".
   * 
   * @example
   * ```typescript
   * customLoginHandler: async () => {
   *   await browser.$('#email').setValue('user@example.com');
   *   await browser.$('#password').setValue('secret');
   *   await browser.$('#login-btn').click();
   * }
   * ```
   */
  customLoginHandler?: CustomLoginHandler;
  
  /** 
   * Timeout for finding OAuth context (default: 30000ms).
   */
  timeout?: number;
  
  /**
   * Additional URL patterns to recognize as OAuth pages.
   * Add patterns for custom/internal OAuth providers.
   * 
   * @example
   * ```typescript
   * customOAuthUrlPatterns: ["my-corp-idp.com", "internal-sso.example.com"]
   * ```
   */
  customOAuthUrlPatterns?: string[];
  
  /**
   * Custom callback to determine if a URL is an OAuth page.
   * Called for each URL during context detection.
   * If provided, this is checked IN ADDITION to built-in patterns.
   * 
   * @example
   * ```typescript
   * isOAuthPageCallback: (url) => url.includes("my-idp.com/authorize")
   * ```
   */
  isOAuthPageCallback?: IsOAuthPageCallback;
}

/**
 * Result of an OAuth login flow
 */
export interface OAuthLoginResult {
  success: boolean;
  /** Whether OAuth was auto-triggered or manually triggered */
  autoTriggered: boolean;
  /** The OAuth context used for login */
  loginContext?: Context;
  /** Browser mode used */
  browserMode?: OAuthBrowserMode;
  /** Error message if failed */
  error?: string;
}

/**
 * Internal timeout configuration
 */
const TIMEOUTS = {
  /** Wait for OAuth context to appear */
  contextWait: 30000,
  /** Initial stabilization after app launch */
  appStabilization: { ios: 3000, android: 2000 },
  /** Wait after dialog acceptance */
  postDialog: { ios: 3000, android: 1500 },
  /** Pause between polling attempts */
  pollInterval: 2000,
  /** Stabilization after OAuth context switch */
  oauthStabilization: { ios: 1500, android: 800 },
  /** Wait for OAuth to complete and return to app */
  returnToApp: { ios: 3000, android: 2000 },
  /** Pause after wdi5 injection */
  postInjection: 1000,
} as const;

/**
 * Built-in OAuth URL patterns for common providers
 */
const BUILTIN_OAUTH_URL_PATTERNS = [
  // Microsoft / Azure AD
  "login.microsoftonline.com",
  "microsoftonline.com",
  "login.windows.net",
  "login.microsoft.com",
  // Okta (any subdomain)
  ".okta.com",
  "okta.com/",
  "oktapreview.com",
  // SAP BTP IAS
  "accounts.sap.com",
  "accounts.cloud.sap",
  ".authentication.",
  // Generic OAuth/SSO patterns
  "oauth",
  "authorize",
  "/auth/",
  "login",
  "signin",
  "identity",
  "/sso/",
  "saml",
  "idp/",
] as const;

/**
 * OAuth Flow Manager - Singleton for managing OAuth flows
 * 
 * Handles all the complexity of OAuth in mobile apps so test specs
 * don't have to deal with it. Supports both native browser (Safari/Chrome)
 * and Cordova InAppBrowser modes.
 */
export class OAuthFlowManager {
  private static instance: OAuthFlowManager;
  private browser: BrowserWithWdi5;
  
  // State tracking
  private appContext: Context | null = null;
  private contextsBeforeLogin: string[] = [];
  
  // Current options (stored for use across methods)
  private currentOptions: PerformOAuthLoginOptions | null = null;
  
  private constructor() {
    this.browser = globalThis.browser as BrowserWithWdi5;
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): OAuthFlowManager {
    if (!OAuthFlowManager.instance) {
      OAuthFlowManager.instance = new OAuthFlowManager();
    }
    return OAuthFlowManager.instance;
  }
  
  /**
   * Reset instance (useful for testing)
   */
  public static resetInstance(): void {
    OAuthFlowManager.instance = undefined as unknown as OAuthFlowManager;
  }
  
  /**
   * Check if running on iOS
   */
  private isIOS(): boolean {
    // Use driver.isIOS if available, otherwise check capabilities
    const driver = globalThis.driver;
    if (driver && typeof driver.isIOS === "boolean") {
      return driver.isIOS;
    }
    // Fallback: check browser capabilities
    try {
      const caps = this.browser.capabilities || {};
      const platformName = (caps.platformName || "").toLowerCase();
      return platformName === "ios";
    } catch {
      return false;
    }
  }
  
  /**
   * Check if a URL is an OAuth/authorization page.
   * Checks built-in patterns, custom patterns, and custom callback.
   */
  private async isOAuthUrl(url: string): Promise<boolean> {
    if (!url) return false;
    
    // file:// URLs are always the app, never OAuth
    if (url.startsWith("file://")) return false;
    
    const lowerUrl = url.toLowerCase();
    
    // Check built-in patterns
    for (const pattern of BUILTIN_OAUTH_URL_PATTERNS) {
      if (lowerUrl.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    
    // Check custom patterns from options
    if (this.currentOptions?.customOAuthUrlPatterns) {
      for (const pattern of this.currentOptions.customOAuthUrlPatterns) {
        if (lowerUrl.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }
    
    // Check custom callback from options
    if (this.currentOptions?.isOAuthPageCallback) {
      try {
        const result = await this.currentOptions.isOAuthPageCallback(url);
        if (result) return true;
      } catch (error) {
        console.log(`[OAuthFlowManager] isOAuthPageCallback error: ${error}`);
      }
    }
    
    return false;
  }
  
  /**
   * Perform a complete OAuth login flow.
   * 
   * This is the main entry point that hides all OAuth complexity.
   * It handles:
   * 1. App stabilization
   * 2. Auto-login vs manual-login detection
   * 3. Permission dialog handling (for native browser mode)
   * 4. Context switching to OAuth browser/InAppBrowser
   * 5. Executing the OAuth provider login
   * 6. Returning to app and re-injecting wdi5
   * 
   * @param options - Configuration for the OAuth flow
   * @returns Result indicating success/failure and details
   */
  public async performLogin(options: PerformOAuthLoginOptions): Promise<OAuthLoginResult> {
    const { 
      provider, 
      credentials, 
      launchpadName, 
      sapBasicLoginHandler, 
      customLoginHandler,
      timeout = TIMEOUTS.contextWait,
      browserMode = "native",
    } = options;
    
    // Store options for use in helper methods
    this.currentOptions = options;
    
    console.log(`[OAuthFlowManager] ========================================`);
    console.log(`[OAuthFlowManager] Starting ${provider} OAuth login flow`);
    console.log(`[OAuthFlowManager] Platform: ${this.isIOS() ? 'iOS' : 'Android'}`);
    console.log(`[OAuthFlowManager] Browser mode: ${browserMode}`);
    console.log(`[OAuthFlowManager] ========================================`);
    
    try {
      // Step 1: Capture initial state
      await this.captureInitialState();
      
      // Step 2: Detect and handle OAuth trigger (auto vs manual)
      const autoTriggered = await this.handleOAuthTrigger(launchpadName, browserMode);
      
      // Step 3: Switch to OAuth context
      const loginContext = await this.switchToOAuthContext(timeout, browserMode);
      
      // Step 4: Perform the actual OAuth login
      await this.executeOAuthLogin(provider, credentials, sapBasicLoginHandler, customLoginHandler);
      
      // Step 5: Return to app and restore state
      await this.returnToAppAndRestore(browserMode);
      
      console.log(`[OAuthFlowManager] ========================================`);
      console.log(`[OAuthFlowManager] OAuth login completed successfully`);
      console.log(`[OAuthFlowManager] ========================================`);
      
      return {
        success: true,
        autoTriggered,
        loginContext,
        browserMode,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[OAuthFlowManager] OAuth login failed: ${errorMessage}`);
      
      return {
        success: false,
        autoTriggered: false,
        browserMode,
        error: errorMessage,
      };
    } finally {
      // Clear stored options
      this.currentOptions = null;
    }
  }
  
  /**
   * Prepare for OAuth without performing login.
   * Useful when you need custom login handling.
   * 
   * Returns the OAuth context ready for login.
   * 
   * @param options - Preparation options
   */
  public async prepareForLogin(options: {
    launchpadName?: string;
    timeout?: number;
    browserMode?: OAuthBrowserMode;
    customOAuthUrlPatterns?: string[];
    isOAuthPageCallback?: IsOAuthPageCallback;
  } = {}): Promise<Context> {
    const { 
      launchpadName, 
      timeout = TIMEOUTS.contextWait,
      browserMode = "native",
    } = options;
    
    // Store options for helper methods
    this.currentOptions = options as PerformOAuthLoginOptions;
    
    console.log(`[OAuthFlowManager] Preparing for OAuth login...`);
    
    await this.captureInitialState();
    await this.handleOAuthTrigger(launchpadName, browserMode);
    return await this.switchToOAuthContext(timeout, browserMode);
  }
  
  /**
   * Complete the OAuth flow after login.
   * Call this after you've performed custom login handling.
   * 
   * @param browserMode - The browser mode used (native or inappbrowser)
   */
  public async completeLogin(browserMode: OAuthBrowserMode = "native"): Promise<void> {
    console.log(`[OAuthFlowManager] Completing OAuth login...`);
    await this.returnToAppAndRestore(browserMode);
    this.currentOptions = null;
  }
  
  /**
   * Capture the initial app state before OAuth
   */
  private async captureInitialState(): Promise<void> {
    // Stabilization pause
    const stabilizationWait = this.isIOS() 
      ? TIMEOUTS.appStabilization.ios 
      : TIMEOUTS.appStabilization.android;
    await this.browser.pause(stabilizationWait);
    
    this.appContext = await this.browser.getContext();
    this.contextsBeforeLogin = await this.browser.getContexts() as string[];
    
    console.log(`[OAuthFlowManager] App context: ${this.appContext}`);
    console.log(`[OAuthFlowManager] Contexts at start: ${JSON.stringify(this.contextsBeforeLogin)}`);
  }
  
  /**
   * Detect and handle OAuth trigger (auto vs manual)
   * Returns true if OAuth was auto-triggered
   */
  private async handleOAuthTrigger(
    launchpadName?: string,
    browserMode: OAuthBrowserMode = "native"
  ): Promise<boolean> {
    let autoTriggered = false;
    
    if (browserMode === "native") {
      // Native browser mode - check for dialogs/auto-trigger
      if (this.isIOS()) {
        autoTriggered = await this.handleIOSNativeOAuthTrigger();
      } else {
        autoTriggered = await this.handleAndroidNativeOAuthTrigger();
      }
    } else {
      // InAppBrowser mode - check for new webview context
      autoTriggered = await this.handleInAppBrowserTrigger();
    }
    
    // If not auto-triggered, we need to manually trigger OAuth
    if (!autoTriggered && launchpadName) {
      console.log(`[OAuthFlowManager] Manual login mode - triggering OAuth...`);
      await this.triggerManualLogin(launchpadName);
    }
    
    return autoTriggered;
  }
  
  /**
   * Handle iOS native OAuth trigger detection (Safari)
   */
  private async handleIOSNativeOAuthTrigger(): Promise<boolean> {
    console.log(`[OAuthFlowManager] iOS: Checking for permission dialog...`);
    
    // Try to accept permission dialog (indicates auto-login)
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.browser.acceptAlert();
        console.log(`[OAuthFlowManager] iOS: Accepted permission dialog - OAuth auto-triggered!`);
        await this.browser.pause(1000);
        return true;
      } catch {
        if (attempt < 4) {
          await this.browser.pause(500);
        }
      }
    }
    
    console.log(`[OAuthFlowManager] iOS: No permission dialog - manual login mode`);
    return false;
  }
  
  /**
   * Handle Android native OAuth trigger detection (Chrome)
   */
  private async handleAndroidNativeOAuthTrigger(): Promise<boolean> {
    console.log(`[OAuthFlowManager] Android: Checking for Chrome webview...`);
    await this.browser.pause(2000);
    
    const contextsNow = await this.browser.getContexts() as string[];
    const newContexts = contextsNow.filter(c => 
      !this.contextsBeforeLogin.includes(String(c))
    );
    
    console.log(`[OAuthFlowManager] Android: New contexts: ${JSON.stringify(newContexts)}`);
    
    const chromeContext = newContexts.find(c => 
      String(c).toUpperCase().includes("CHROME") || 
      (String(c).includes("WEBVIEW") && !String(c).includes(String(this.appContext)))
    );
    
    if (chromeContext) {
      console.log(`[OAuthFlowManager] Android: Chrome webview found - OAuth auto-triggered!`);
      return true;
    }
    
    console.log(`[OAuthFlowManager] Android: No Chrome webview - manual login mode`);
    return false;
  }
  
  /**
   * Handle InAppBrowser OAuth trigger detection
   */
  private async handleInAppBrowserTrigger(): Promise<boolean> {
    console.log(`[OAuthFlowManager] InAppBrowser: Checking for new webview...`);
    await this.browser.pause(1500);
    
    const contextsNow = await this.browser.getContexts() as string[];
    const newContexts = contextsNow.filter(c => 
      !this.contextsBeforeLogin.includes(String(c)) && String(c).includes("WEBVIEW")
    );
    
    console.log(`[OAuthFlowManager] InAppBrowser: New contexts: ${JSON.stringify(newContexts)}`);
    
    if (newContexts.length > 0) {
      console.log(`[OAuthFlowManager] InAppBrowser: New webview found - OAuth auto-triggered!`);
      return true;
    }
    
    console.log(`[OAuthFlowManager] InAppBrowser: No new webview - manual login mode`);
    return false;
  }
  
  /**
   * Trigger manual OAuth login by clicking the login button
   */
  private async triggerManualLogin(launchpadName: string): Promise<void> {
    // Switch to app webview if needed
    const contexts = await this.browser.getContexts() as string[];
    const appWebview = contexts.find(c => String(c).includes("WEBVIEW"));
    
    if (appWebview) {
      await this.browser.switchContext(appWebview as string);
      console.log(`[OAuthFlowManager] Switched to app webview: ${appWebview}`);
      await this.browser.pause(1000);
    }
    
    // Inject wdi5 (it was skipped at startup for OAuth flows)
    console.log(`[OAuthFlowManager] Injecting wdi5 for login button...`);
    await this.browser.injectUI5();
    await this.browser.pause(1000);
    
    // Click the login button
    const launchpad = await ToolboxFactory.createLaunchpad({ launchpadName });
    await launchpad.clickLogin();
    console.log(`[OAuthFlowManager] Login button clicked`);
  }
  
  /**
   * Switch to the OAuth context (Safari/Chrome/InAppBrowser webview)
   */
  private async switchToOAuthContext(
    timeout: number,
    browserMode: OAuthBrowserMode
  ): Promise<Context> {
    console.log(`[OAuthFlowManager] Finding OAuth context (${browserMode} mode)...`);
    
    const postDialogWait = this.isIOS() 
      ? TIMEOUTS.postDialog.ios 
      : TIMEOUTS.postDialog.android;
    await this.browser.pause(postDialogWait);
    
    const startTime = Date.now();
    
    // Helper to get numeric webview ID for sorting
    const getWebviewId = (ctx: string): number => {
      const match = String(ctx).match(/WEBVIEW_(\d+)\.?(\d*)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2] || "0", 10);
        return major * 100 + minor;
      }
      return 0;
    };
    
    while (Date.now() - startTime < timeout) {
      const currentContexts = await this.browser.getContexts() as string[];
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      console.log(`[OAuthFlowManager] [${elapsedSec}s] Contexts: ${JSON.stringify(currentContexts)}`);
      
      if (browserMode === "native" && this.isIOS()) {
        // iOS Native: Detect Safari sheet via native elements
        const context = await this.findIOSNativeBrowserContext(currentContexts, getWebviewId);
        if (context) return context;
      } else {
        // Android Native or InAppBrowser: Check webview contexts directly
        const context = await this.findWebviewContext(currentContexts, getWebviewId, browserMode);
        if (context) return context;
      }
      
      await this.browser.pause(TIMEOUTS.pollInterval);
    }
    
    throw new Error(`[OAuthFlowManager] No OAuth context found after ${timeout}ms`);
  }
  
  /**
   * Find iOS native browser (Safari) context
   */
  private async findIOSNativeBrowserContext(
    currentContexts: string[],
    getWebviewId: (ctx: string) => number
  ): Promise<Context | null> {
    try {
      await this.browser.switchContext("NATIVE_APP");
      
      // Look for Safari sheet elements
      const safariSelectors = [
        '//XCUIElementTypeButton[@name="Cancel"]',
        '//XCUIElementTypeWebView',
      ];
      
      for (const selector of safariSelectors) {
        try {
          const elem = await this.browser.$(selector);
          if (await elem.isExisting()) {
            console.log(`[OAuthFlowManager] iOS: Safari detected via ${selector}`);
            
            // Get webview contexts, sorted by newness and ID
            const webviewContexts = currentContexts.filter(
              ctx => String(ctx).includes("WEBVIEW") && ctx !== this.appContext
            );
            
            const sortedContexts = this.sortContextsByPriority(webviewContexts, getWebviewId);
            
            for (const ctx of sortedContexts) {
              const result = await this.checkContextForOAuth(ctx);
              if (result) return result;
            }
            break;
          }
        } catch {
          // Element not found, continue
        }
      }
    } catch {
      // Native element search failed
    }
    
    return null;
  }
  
  /**
   * Find webview context (Android or InAppBrowser)
   */
  private async findWebviewContext(
    currentContexts: string[],
    getWebviewId: (ctx: string) => number,
    browserMode: OAuthBrowserMode
  ): Promise<Context | null> {
    const webviewContexts = currentContexts.filter(
      ctx => String(ctx).includes("WEBVIEW") && ctx !== this.appContext
    );
    
    const sortedContexts = this.sortContextsByPriority(webviewContexts, getWebviewId);
    
    if (sortedContexts.length > 0) {
      const modeLabel = browserMode === "inappbrowser" ? "InAppBrowser" : "Android";
      console.log(`[OAuthFlowManager] ${modeLabel}: Checking ${sortedContexts.length} context(s)`);
      
      for (const ctx of sortedContexts) {
        const result = await this.checkContextForOAuth(ctx);
        if (result) return result;
      }
    }
    
    return null;
  }
  
  /**
   * Sort contexts by priority: NEW contexts first, then by ID descending
   */
  private sortContextsByPriority(
    contexts: string[],
    getWebviewId: (ctx: string) => number
  ): string[] {
    return [...contexts].sort((a, b) => {
      const aIsNew = !this.contextsBeforeLogin.includes(String(a));
      const bIsNew = !this.contextsBeforeLogin.includes(String(b));
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      return getWebviewId(String(b)) - getWebviewId(String(a));
    });
  }
  
  /**
   * Check if a context contains an OAuth page
   */
  private async checkContextForOAuth(ctx: string): Promise<Context | null> {
    try {
      await this.browser.switchContext(ctx);
      await this.browser.pause(300);
      const ctxUrl = await this.browser.getUrl();
      console.log(`[OAuthFlowManager] Context ${ctx} URL: ${ctxUrl}`);
      
      if (await this.isOAuthUrl(ctxUrl)) {
        console.log(`[OAuthFlowManager] Found OAuth context: ${ctx}`);
        await this.stabilizeOAuthContext();
        return ctx as Context;
      }
    } catch (error) {
      console.log(`[OAuthFlowManager] Context ${ctx} not accessible: ${error}`);
    }
    
    return null;
  }
  
  /**
   * Stabilize after switching to OAuth context
   */
  private async stabilizeOAuthContext(): Promise<void> {
    const stabilizationWait = this.isIOS() 
      ? TIMEOUTS.oauthStabilization.ios 
      : TIMEOUTS.oauthStabilization.android;
    
    console.log(`[OAuthFlowManager] Stabilizing OAuth context (${stabilizationWait}ms)...`);
    await this.browser.pause(stabilizationWait);
    
    try {
      const url = await this.browser.getUrl();
      console.log(`[OAuthFlowManager] OAuth URL: ${url}`);
    } catch {
      // URL check failed, continue anyway
    }
  }
  
  /**
   * Execute the OAuth provider login
   */
  private async executeOAuthLogin(
    provider: OAuthProvider, 
    credentials: OAuthCredentials,
    sapBasicLoginHandler?: CustomLoginHandler,
    customLoginHandler?: CustomLoginHandler
  ): Promise<void> {
    console.log(`[OAuthFlowManager] Executing ${provider} login...`);
    
    switch (provider) {
      case "azure": {
        const azureLogin = new AzureLogin();
        await azureLogin.login({
          email: credentials.email,
          password: credentials.password,
          staySignedIn: credentials.staySignedIn ?? false,
        } as AzureLoginOptions);
        break;
      }
      
      case "okta": {
        const oktaLogin = new OktaLogin();
        await oktaLogin.login({
          email: credentials.email,
          password: credentials.password,
          rememberMe: credentials.rememberMe ?? false,
        } as OktaLoginOptions);
        break;
      }
      
      case "btp-ias": {
        const btpLogin = new BtpIasLogin();
        await btpLogin.login({
          email: credentials.email,
          password: credentials.password,
          keepMeSignedIn: credentials.keepMeSignedIn ?? false,
        } as BtpIasLoginOptions);
        break;
      }
      
      case "sap-basic": {
        if (sapBasicLoginHandler) {
          await sapBasicLoginHandler();
        } else {
          throw new Error(`[OAuthFlowManager] SAP basic login requires sapBasicLoginHandler`);
        }
        break;
      }
      
      case "custom": {
        if (customLoginHandler) {
          await customLoginHandler();
        } else {
          throw new Error(`[OAuthFlowManager] Custom provider requires customLoginHandler`);
        }
        break;
      }
      
      default:
        throw new Error(`[OAuthFlowManager] Unknown provider: ${provider}`);
    }
    
    console.log(`[OAuthFlowManager] ${provider} login completed`);
  }
  
  /**
   * Return to the app and restore wdi5
   */
  private async returnToAppAndRestore(browserMode: OAuthBrowserMode): Promise<void> {
    console.log(`[OAuthFlowManager] Returning to app (${browserMode} mode)...`);
    
    const waitTime = this.isIOS() 
      ? TIMEOUTS.returnToApp.ios 
      : TIMEOUTS.returnToApp.android;
    await this.browser.pause(waitTime);
    
    // iOS Native: Switch to first window handle
    if (browserMode === "native" && this.isIOS()) {
      try {
        const windowHandles = await this.browser.getWindowHandles();
        if (windowHandles.length > 0) {
          await this.browser.switchToWindow(windowHandles[0]);
          console.log(`[OAuthFlowManager] iOS: Switched to first window handle`);
          await this.browser.pause(500);
        }
      } catch (e) {
        console.log(`[OAuthFlowManager] iOS: Window switch: ${e}`);
      }
    }
    
    // Switch to app context
    if (this.appContext) {
      try {
        await this.browser.switchContext(this.appContext as string);
        console.log(`[OAuthFlowManager] Switched to app context: ${this.appContext}`);
      } catch {
        // Fallback: find any webview
        const contexts = await this.browser.getContexts() as string[];
        const webview = contexts.find(c => String(c).includes("WEBVIEW"));
        if (webview) {
          await this.browser.switchContext(webview);
          console.log(`[OAuthFlowManager] Fallback: Switched to ${webview}`);
        }
      }
    }
    
    await this.browser.pause(1000);
    
    // Re-inject wdi5 - CRITICAL for UI5 interactions after OAuth
    console.log(`[OAuthFlowManager] Re-injecting wdi5...`);
    await this.browser.injectUI5();
    await this.browser.pause(TIMEOUTS.postInjection);
    
    console.log(`[OAuthFlowManager] Back in app with wdi5 ready`);
  }
  
  /**
   * Get the saved app context
   */
  public getAppContext(): Context | null {
    return this.appContext;
  }
  
  /**
   * Get contexts that were present before login
   */
  public getContextsBeforeLogin(): string[] {
    return this.contextsBeforeLogin;
  }
}
