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
import { ContextUtil } from "./context-util.js";

/** Appium iOS with fullContextList returns {id, title, url} instead of a string. */
function contextId(ctx: unknown): string {
  if (typeof ctx === "string") return ctx;
  if (ctx && typeof ctx === "object" && "id" in (ctx as object)) {
    return String((ctx as { id: string }).id);
  }
  return String(ctx);
}

function contextIds(contexts: unknown[]): string[] {
  return contexts.map(contextId);
}

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
  /** Wait after clicking login button for OAuth to open */
  postLoginClick: { ios: 2000, android: 1500 },
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
   * 1. Capture initial state (contexts before OAuth)
   * 2. Click the login button (wdi5 is already injected at startup)
   * 3. Handle iOS permission dialog (appears after clicking login)
   * 4. Switch to OAuth browser context (Safari/Chrome/InAppBrowser)
   * 5. Execute the OAuth provider login
   * 6. Return to app and re-inject wdi5
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
      // Step 1: Capture initial state (contexts before OAuth)
      await this.captureInitialState();
      
      // Step 2: Click the login button to trigger OAuth
      if (launchpadName) {
        await this.clickLoginButton(launchpadName);
      } else {
        console.log(`[OAuthFlowManager] No launchpadName provided - assuming OAuth already triggered`);
      }
      
      // Step 3: iOS Continue/Allow is tapped from the wait loop.
      // A XCUI dump here snapshots the WKWebView and kills the OAuth XHR.
      
      // Step 4: Switch to OAuth context
      const loginContext = await this.switchToOAuthContext(timeout, browserMode);
      
      // Step 5: Perform the actual OAuth login (unless auto-completed)
      if (String(loginContext) === "OAUTH_AUTO_COMPLETED") {
        console.log(`[OAuthFlowManager] OAuth auto-completed (SSO/cached credentials)`);
      } else {
        await this.executeOAuthLogin(provider, credentials, sapBasicLoginHandler, customLoginHandler);
      }
      
      // Step 6: Return to app and restore state
      await this.returnToAppAndRestore(browserMode);
      
      console.log(`[OAuthFlowManager] ========================================`);
      console.log(`[OAuthFlowManager] OAuth login completed successfully`);
      console.log(`[OAuthFlowManager] ========================================`);
      
      return {
        success: true,
        autoTriggered: false,
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
    
    // Click the login button to trigger OAuth
    if (launchpadName) {
      await this.clickLoginButton(launchpadName);
    }
    
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
   * Capture the initial app state before OAuth.
   * Just saves the current contexts so we can identify new ones after OAuth opens.
   */
  private async captureInitialState(): Promise<void> {
    try {
      if (this.isIOS()) {
        const detailed = await this.browser.execute("mobile: getContexts") as any[];
        this.contextsBeforeLogin = Array.isArray(detailed)
          ? detailed.map((c) => contextId(c?.id ?? c))
          : [];
        try { await this.browser.switchContext("NATIVE_APP"); } catch { /* already native */ }
      } else {
        this.contextsBeforeLogin = contextIds(await this.browser.getContexts() as unknown[]);
      }
      console.log(`[OAuthFlowManager] Initial contexts: ${JSON.stringify(this.contextsBeforeLogin)}`);
    } catch (e) {
      console.log(`[OAuthFlowManager] Could not get initial contexts: ${e}`);
      this.contextsBeforeLogin = [];
    }
    
    // Find app webview - Android has package name, iOS has numeric ID
    const appWebview = this.contextsBeforeLogin.find(c => {
      const ctxStr = String(c).toLowerCase();
      if (!ctxStr.includes("webview")) return false;
      if (ctxStr.includes("chrome")) return false;
      if (ctxStr.includes("safari")) return false;
      if (ctxStr.includes("terrace")) return false;
      return true;
    });
    
    if (appWebview) {
      this.appContext = appWebview as Context;
      console.log(`[OAuthFlowManager] App webview: ${this.appContext}`);
    } else {
      try {
        this.appContext = contextId(await this.browser.getContext()) as Context;
        console.log(`[OAuthFlowManager] Current context: ${this.appContext}`);
      } catch (e) {
        console.log(`[OAuthFlowManager] Could not get current context: ${e}`);
        this.appContext = null;
      }
    }

    // Share the app context with ContextUtil so it never has to probe for it
    if (this.appContext && String(this.appContext).includes("WEBVIEW")) {
      const contextUtil = ContextUtil.getInstance();
      contextUtil.setMainAppContext(String(this.appContext));
    }
  }
  
  /**
   * Click the login button to trigger OAuth.
   * Ensures wdi5 is injected before attempting to click.
   */
  private async clickLoginButton(launchpadName: string): Promise<void> {
    console.log(`[OAuthFlowManager] Clicking login button for: ${launchpadName}`);

    if (this.isIOS()) {
      await this.clickLoginButtonIosNative();
      return;
    }

    // Ensure we're in the app webview and wdi5 is available
    // This is critical after app restart or navigation
    if (this.appContext) {
      console.log(`[OAuthFlowManager] Ensuring we're in app webview: ${this.appContext}`);
      try {
        await this.browser.switchContext(this.appContext as string);
      } catch (e) {
        console.log(`[OAuthFlowManager] Could not switch to app context: ${e}`);
      }
    }
    
    // Ensure wdi5 is injected - critical after app restart/navigation
    console.log(`[OAuthFlowManager] Ensuring wdi5 is injected before clicking login...`);
    try {
      // Check if wdi5 is available
      const hasWdi5 = await this.browser.execute(() => typeof window.wdi5 !== "undefined");
      if (!hasWdi5) {
        console.log(`[OAuthFlowManager] wdi5 not available, injecting...`);
        if (typeof this.browser.injectUI5 === "function") {
          await this.browser.injectUI5();
          console.log(`[OAuthFlowManager] wdi5 injected successfully`);
        }
      } else {
        console.log(`[OAuthFlowManager] wdi5 already available`);
      }
    } catch (e) {
      console.log(`[OAuthFlowManager] Error checking/injecting wdi5: ${e}`);
      // Try to inject anyway
      if (typeof this.browser.injectUI5 === "function") {
        try {
          await this.browser.injectUI5();
          console.log(`[OAuthFlowManager] wdi5 injected after error`);
        } catch (injectError) {
          console.log(`[OAuthFlowManager] Failed to inject wdi5: ${injectError}`);
        }
      }
    }
    
    // Click the login button
    const launchpad = await ToolboxFactory.createLaunchpad({ launchpadName });
    await launchpad.clickLogin();
    console.log(`[OAuthFlowManager] Login button clicked - OAuth should open now`);

    await this.browser.pause(TIMEOUTS.postLoginClick.android);
  }

  /**
   * iOS: tap logon via XCUI only. switchContext/execute on the app WKWebView
   * attaches Safari Remote Inspector and blocks the OAuth XHR (No Connection).
   */
  private async clickLoginButtonIosNative(): Promise<void> {
    console.log(`[OAuthFlowManager] iOS: native logon tap (inspector stays off the app webview)`);
    try { await this.browser.switchContext("NATIVE_APP"); } catch { /* already native */ }
    const tapped = await this.waitAndTapIosLogon(15000);
    if (!tapped) {
      console.log(`[OAuthFlowManager] iOS: logon.logon never appeared in XCUI`);
    }
    await this.browser.pause(TIMEOUTS.postLoginClick.ios);
  }

  private async waitAndTapIosLogon(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    let attempt = 0;
    while (Date.now() - start < timeoutMs) {
      attempt++;
      const tapped = await this.tapIosAny(["logon.logon", "Log On", "Logon"]);
      if (tapped) {
        console.log(`[OAuthFlowManager] iOS: tapped logon on attempt ${attempt}`);
        return true;
      }
      await this.browser.pause(500);
    }
    return false;
  }
  
  /**
   * Handle iOS permission dialog ("App wants to use example.com to sign in").
   * Do NOT call acceptAlert — WDIO waits the full waitforTimeout per attempt
   * (~2 min total) and the ASWeb session dies while we sit there.
   */
  private async handleIOSPermissionDialog(): Promise<void> {
    console.log(`[OAuthFlowManager] iOS: Checking for 'wants to sign in' dialog...`);

    try {
      await this.browser.switchContext("NATIVE_APP");
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS: Could not switch to NATIVE_APP: ${e}`);
    }

    const maxAttempts = 4;
    let handled = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const tapped = await this.tapIosAny([
        "Continue",
        "Allow",
        "OK",
        "Open",
        "Fortfahren",
        "Erlauben",
        "Sign In",
      ]);
      if (tapped) {
        handled = true;
        break;
      }
      if (await this.iosAuthInProgress()) {
        console.log(
          `[OAuthFlowManager] iOS: auth already in progress (attempt ${attempt}) — skipping dialog wait`,
        );
        return;
      }
      if (attempt < maxAttempts) {
        await this.browser.pause(400);
      }
    }

    if (!handled) {
      await this.dumpNativeButtons("no permission dialog");
      const safariOpen = await this.iosSafariSheetOpen();
      console.log(
        `[OAuthFlowManager] iOS: No dialog found (sheet open=${safariOpen}) — continuing`,
      );
    }

    await this.browser.pause(1500);
  }

  private async iosNativeButtonNameLabels(): Promise<string[]> {
    const buttons = await this.browser.$$("XCUIElementTypeButton");
    const count = await buttons.length;
    const names: string[] = [];
    const limit = Math.min(count, 40);
    for (let i = 0; i < limit; i++) {
      const name = await buttons[i].getAttribute("name").catch(() => "");
      const label = await buttons[i].getAttribute("label").catch(() => "");
      names.push(`${name}|${label}`);
    }
    return names;
  }

  private async iosAuthInProgress(): Promise<boolean> {
    const names = await this.iosNativeButtonNameLabels();
    return names.some((n) =>
      /cancelAuthentication|Decline|AuthenticationProgress/i.test(n),
    );
  }

  private async iosSafariSheetOpen(): Promise<boolean> {
    const names = await this.iosNativeButtonNameLabels();
    return names.some((n) =>
      /cancelAuthentication|Decline|AuthenticationProgress|^Cancel\|/i.test(n),
    );
  }

  private async tapIosAny(names: string[]): Promise<boolean> {
    const want = new Set(names);
    try {
      const buttons = await this.browser.$$("XCUIElementTypeButton");
      const count = await buttons.length;
      const limit = Math.min(count, 40);
      for (let i = 0; i < limit; i++) {
        const name = (await buttons[i].getAttribute("name").catch(() => "")) || "";
        const label = (await buttons[i].getAttribute("label").catch(() => "")) || "";
        if (want.has(name) || want.has(label)) {
          console.log(`[OAuthFlowManager] iOS: tapping native name="${name}" label="${label}"`);
          try {
            const loc = await buttons[i].getLocation();
            const size = await buttons[i].getSize();
            const x = Math.round(loc.x + size.width / 2);
            const y = Math.round(loc.y + size.height / 2);
            await this.browser.execute("mobile: tap", { x, y });
          } catch (e) {
            const msg = String(e);
            if (msg.includes("stale") || msg.includes("no such element")) {
              console.log(`[OAuthFlowManager] iOS: tap stale on ${name} — treating as dismissed`);
              return true;
            }
            throw e;
          }
          return true;
        }
      }
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS tapIosAny failed: ${e}`);
    }
    return false;
  }

  /** Tap a native iOS system button by name/label. Must already be in NATIVE_APP. */
  private async tapIosSystemButton(names: string[]): Promise<boolean> {
    return this.tapIosAny(names);
  }

  private async dumpNativePageHints(reason: string): Promise<void> {
    try {
      const xml = await this.browser.getPageSource();
      const names = [...xml.matchAll(/\b(?:name|label)="([^"]+)"/g)].map((m) => m[1]);
      const unique = [...new Set(names)].filter(Boolean).slice(0, 80);
      console.log(
        `[OAuthFlowManager] iOS page names (${reason}): ${JSON.stringify(unique)}`,
      );
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS page source dump failed: ${e}`);
    }
  }

  private async dumpNativeButtons(reason: string): Promise<void> {
    try {
      const buttons = await this.browser.$$("XCUIElementTypeButton");
      const count = await buttons.length;
      const names: string[] = [];
      const limit = Math.min(count, 40);
      for (let i = 0; i < limit; i++) {
        const name = await buttons[i].getAttribute("name").catch(() => "");
        const label = await buttons[i].getAttribute("label").catch(() => "");
        names.push(`${name}|${label}`);
      }
      console.log(
        `[OAuthFlowManager] iOS native buttons (${reason}, ${count}): ${JSON.stringify(names)}`,
      );
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS native button dump failed: ${e}`);
    }
  }
  
  /**
   * Switch to the OAuth context (Safari/Chrome/InAppBrowser webview)
   */
  private async switchToOAuthContext(
    timeout: number,
    browserMode: OAuthBrowserMode
  ): Promise<Context> {
    console.log(`[OAuthFlowManager] Finding OAuth context (${browserMode} mode)...`);
    
    const startTime = Date.now();
    
    const iosInAppBrowser = this.isIOS() && browserMode === "inappbrowser";
    
    // On iOS with InAppBrowser mode, all WKWebViews share one WebKit
    // WebContent process. Attaching the Safari Remote Inspector to ANY
    // webview (via switchContext) blocks the shared JS thread AND
    // persists even after switching back to NATIVE_APP, preventing the
    // InAppBrowser from navigating to its target URL.
    //
    // Fix: use Appium's `mobile: getContexts` to read webview URLs
    // through the Remote Debugger's listing protocol — this enumerates
    // targets WITHOUT attaching the inspector. Only switch to the
    // InAppBrowser AFTER its page has fully loaded.
    if (iosInAppBrowser) {
      console.log(`[OAuthFlowManager] iOS InAppBrowser: Staying in NATIVE_APP — using inspector-free URL detection...`);
      try { await this.browser.switchContext("NATIVE_APP"); } catch { /* already native */ }
      await this.browser.pause(3000);
      
      let phantomRetried = false;
      
      while (Date.now() - startTime < timeout) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        
        const oauthCtxId = await this.findOAuthContextViaListing(elapsedSec);
        if (oauthCtxId) {
          console.log(`[OAuthFlowManager] iOS InAppBrowser: OAuth page loaded in ${oauthCtxId}, switching...`);
          await this.browser.switchContext(oauthCtxId);
          await this.stabilizeOAuthContext();
          return oauthCtxId as Context;
        }
        
        // After 10s without an OAuth URL, a phantom InAppBrowser (from prior
        // app navigation) is likely blocking. Close it via the native "Done"
        // button, then re-click login to open a fresh InAppBrowser.
        if (!phantomRetried && elapsedSec >= 10) {
          const closed = await this.closeInAppBrowserViaDoneButton();
          if (closed && this.currentOptions?.launchpadName) {
            console.log(`[OAuthFlowManager] iOS: Re-clicking login after phantom cleanup...`);
            await this.clickLoginButton(this.currentOptions.launchpadName);
            try { await this.browser.switchContext("NATIVE_APP"); } catch { /* already native */ }
            await this.browser.pause(3000);
            phantomRetried = true;
            continue;
          }
        }
        
        await this.browser.pause(TIMEOUTS.pollInterval);
      }
      
      throw new Error(`[OAuthFlowManager] No OAuth context found after ${timeout}ms`);
    }
    
    // On Android, Cordova InAppBrowser opens as a new WINDOW within the
    // existing app webview context — not as a new context. The context list
    // stays the same (e.g., ["NATIVE_APP", "WEBVIEW_com.neptune.azure"]).
    // We need to switch into the webview context and poll getWindowHandles()
    // for a new window handle to appear, then switch to it.
    const androidInAppBrowser = !this.isIOS() && browserMode === "inappbrowser";
    
    if (androidInAppBrowser) {
      console.log(`[OAuthFlowManager] Android InAppBrowser: Detecting via window handles...`);
      return this.findAndroidInAppBrowserWindow(timeout);
    }
    
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
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      if (browserMode === "native" && this.isIOS()) {
        // Do not call getContexts() — that attaches Safari Remote Inspector
        // and kills the in-flight OAuth XHR (No Connection after ~10s).
        const safariCtx = await this.findAndSwitchToSafariOAuth(elapsedSec);
        if (safariCtx) return safariCtx;
        if (elapsedSec >= 20) {
          const detailed = await this.browser.execute("mobile: getContexts") as any[];
          const ids = (Array.isArray(detailed) ? detailed : []).map((c) =>
            contextId(c?.id ?? c),
          );
          const context = await this.findIOSNativeBrowserContext(ids, getWebviewId);
          if (context) return context;
        }
        await this.browser.pause(TIMEOUTS.pollInterval);
        continue;
      }

      const currentContexts = contextIds(await this.browser.getContexts() as unknown[]);
      console.log(`[OAuthFlowManager] [${elapsedSec}s] Contexts: ${JSON.stringify(currentContexts)}`);
      const context = await this.findWebviewContext(currentContexts, getWebviewId, browserMode);
      if (context) return context;
      
      await this.browser.pause(TIMEOUTS.pollInterval);
    }
    
    throw new Error(`[OAuthFlowManager] No OAuth context found after ${timeout}ms`);
  }
  
  /**
   * Find and switch to the Safari/ASWebAuthenticationSession OAuth page.
   *
   * Safari runs in a separate process (different PID than the app).
   * It may expose multiple webview pages (.1, .2, .3, ...) — service workers,
   * iframes, extensions, and the actual visible content page.
   *
   * Strategy:
   * 1. Use `mobile: getContexts` to list all webviews with URLs (inspector-free)
   * 2. Identify Safari webviews by their process PID (different from app's PID)
   * 3. Find pages with OAuth URLs
   * 4. Wait for Safari's Remote Inspector endpoint to be ready
   * 5. Try switching, highest page number first (most likely the visible page)
   */
  private async findAndSwitchToSafariOAuth(elapsedSec: number): Promise<Context | null> {
    try {
      const detailed = await this.browser.execute('mobile: getContexts') as any[];
      if (!Array.isArray(detailed)) return null;

      // Determine the app's process prefix (e.g., "WEBVIEW_41648")
      const appProcessPrefix = this.appContext
        ? String(this.appContext).replace(/\.\d+$/, '')
        : null;

      const safariOAuthPages: string[] = [];
      const samePidHttpPages: string[] = [];

      for (const ctx of detailed) {
        if (!ctx?.id || !String(ctx.id).includes("WEBVIEW")) continue;

        const ctxId = String(ctx.id);
        const url = ctx.url || "(no url)";
        const title = ctx.title || "";
        const samePid = !!(appProcessPrefix && ctxId.startsWith(appProcessPrefix + "."));
        console.log(
          `[OAuthFlowManager] [${elapsedSec}s] webview ${ctxId} samePid=${samePid} ${url} (${title})`,
        );

        if (ctxId === String(this.appContext)) continue;

        if (samePid) {
          if (ctx.url && /^https?:\/\//i.test(ctx.url) && ctx.url !== "about:blank") {
            samePidHttpPages.push(ctxId);
          }
          continue;
        }

        if (ctx.url && await this.isOAuthUrl(ctx.url)) {
          safariOAuthPages.push(ctxId);
        }
      }

      const candidates = safariOAuthPages.length > 0 ? safariOAuthPages : samePidHttpPages;
      if (candidates.length === 0) {
        if (elapsedSec > 0 && elapsedSec % 5 === 0) {
          const tappedContinue = await this.tapIosAny([
            "Continue",
            "Allow",
            "Fortfahren",
            "Erlauben",
          ]);
          if (tappedContinue) {
            await this.browser.pause(1500);
            return null;
          }
        }
        if (elapsedSec > 0 && elapsedSec % 10 === 0) {
          await this.handleIOSPermissionDialog();
          if (!(await this.iosSafariSheetOpen())) {
            const retried = await this.tapIosSystemButton([
              "logon.logon",
              "Log On",
              "Logon",
            ]);
            if (retried) {
              console.log(`[OAuthFlowManager] iOS: retry native logon tap at ${elapsedSec}s`);
            }
          }
        }
        return null;
      }

      // Try highest page number first — the main content page in Safari is
      // typically the highest-numbered one; lower numbers may be service
      // workers or background pages that can't be switched to.
      candidates.sort((a, b) => {
        const aPage = parseInt(a.split('.').pop() || '0');
        const bPage = parseInt(b.split('.').pop() || '0');
        return bPage - aPage;
      });

      console.log(`[OAuthFlowManager] iOS Safari: OAuth page(s): ${JSON.stringify(candidates)}`);

      // Give Safari's Remote Inspector time to set up its debugging endpoint.
      // mobile: getContexts finds pages very fast via the listing protocol,
      // but the actual debugging connection needs more time.
      if (elapsedSec < 3) {
        console.log(`[OAuthFlowManager] iOS Safari: Waiting for inspector endpoint to be ready...`);
        await this.browser.pause(3000);
      }

      for (const ctxId of candidates) {
        try {
          console.log(`[OAuthFlowManager] iOS Safari: Switching to ${ctxId}...`);
          await this.browser.switchContext(ctxId);
          console.log(`[OAuthFlowManager] iOS Safari: Connected to ${ctxId}`);
          await this.stabilizeOAuthContext();
          return ctxId as Context;
        } catch (e) {
          console.log(`[OAuthFlowManager] iOS Safari: ${ctxId} switch failed: ${e}`);
          try { await this.browser.switchContext("NATIVE_APP"); } catch { /* already native */ }
        }
      }

      console.log(`[OAuthFlowManager] iOS Safari: All switch attempts failed, will retry...`);
    } catch (e) {
      console.log(`[OAuthFlowManager] [${elapsedSec}s] Safari detection error: ${e}`);
    }
    return null;
  }

  /**
   * Find iOS native browser (Safari) context (legacy fallback)
   * 
   * iOS with ASWebAuthenticationSession:
   * - Opens Safari as a modal sheet (not a new app)
   * - Shows "Cancel" button in native layer
   * - WebView context MAY be accessible (numbered like WEBVIEW_1234.1)
   * - We need to find any NEW webview context that appeared after our initial capture
   */
  private async findIOSNativeBrowserContext(
    currentContexts: string[],
    getWebviewId: (ctx: string) => number
  ): Promise<Context | null> {
    // Check if Safari is open via native element detection
    try {
      await this.browser.switchContext("NATIVE_APP");
      const names = await this.iosNativeButtonNameLabels();
      const isSafariOpen = names.some((n) =>
        /cancelAuthentication|^Cancel\|/i.test(n),
      );
      
      if (!isSafariOpen) {
        console.log(`[OAuthFlowManager] iOS: Safari not detected (no Cancel button)`);
        return null;
      }
      
      console.log(`[OAuthFlowManager] iOS: Safari is open (Cancel button visible)`);
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS: Native check error: ${e}`);
    }
    
    // Safari is open - find the OAuth webview
    // NEW webviews (not in contextsBeforeLogin) are most likely Safari
    const newWebviews = currentContexts.filter(ctx => {
      const ctxStr = String(ctx);
      if (!ctxStr.includes("WEBVIEW")) return false;
      // Must be NEW (not present before OAuth)
      return !this.contextsBeforeLogin.some(initial => String(initial) === ctxStr);
    });
    
    console.log(`[OAuthFlowManager] iOS: New webviews since start: ${JSON.stringify(newWebviews)}`);
    
    // Sort by priority (highest ID first - newest webview)
    const sortedNewWebviews = [...newWebviews].sort((a, b) => 
      getWebviewId(String(b)) - getWebviewId(String(a))
    );
    
    // Try each new webview
    for (const ctx of sortedNewWebviews) {
      console.log(`[OAuthFlowManager] iOS: Trying new webview: ${ctx}`);
      const result = await this.checkContextForOAuth(String(ctx));
      if (result) {
        console.log(`[OAuthFlowManager] iOS: Found Safari OAuth context: ${ctx}`);
        return result;
      }
    }
    
    // Also check any webview that's NOT our app (fallback)
    const otherWebviews = currentContexts.filter(ctx => {
      const ctxStr = String(ctx);
      if (!ctxStr.includes("WEBVIEW")) return false;
      if (ctxStr === String(this.appContext)) return false;
      // Skip ones we already tried
      if (newWebviews.includes(ctxStr)) return false;
      return true;
    });
    
    for (const ctx of otherWebviews) {
      console.log(`[OAuthFlowManager] iOS: Trying other webview: ${ctx}`);
      const result = await this.checkContextForOAuth(String(ctx));
      if (result) return result;
    }
    
    // Safari is open but no accessible OAuth webview found
    // This can happen with ASWebAuthenticationSession - Safari is visible but not switchable
    console.log(`[OAuthFlowManager] iOS: Safari open but no accessible OAuth webview`);
    console.log(`[OAuthFlowManager] iOS: Checking if OAuth auto-completed...`);
    
    await this.browser.pause(3000);
    
    try {
      await this.browser.switchContext("NATIVE_APP");
      const cancelButton = await this.browser.$('//XCUIElementTypeButton[@name="Cancel"]');
      const stillOpen = await cancelButton.isExisting().catch(() => false);
      
      if (!stillOpen) {
        console.log(`[OAuthFlowManager] iOS: Safari closed - OAuth auto-completed!`);
        return "OAUTH_AUTO_COMPLETED" as unknown as Context;
      }
    } catch {
      // Ignore
    }
    
    console.log(`[OAuthFlowManager] iOS: Waiting for Safari OAuth to become accessible...`);
    return null;
  }
  
  /**
   * Close a phantom InAppBrowser by pressing the native "Done" button.
   *
   * After certain app navigations (e.g., addAnotherUser), the Cordova app
   * may open an InAppBrowser to file:///index.html. This blocks the OAuth
   * InAppBrowser from opening (Cordova allows only one active window).
   * Pressing "Done" via native UI closes the phantom without touching the
   * Safari Remote Inspector.
   */
  private async closeInAppBrowserViaDoneButton(): Promise<boolean> {
    try {
      try { await this.browser.switchContext("NATIVE_APP"); } catch { /* already native */ }
      
      // The Cordova InAppBrowser close button defaults to "Done"
      let doneButton = await this.browser.$('//XCUIElementTypeButton[@name="Done"]');
      let exists = await doneButton.isExisting().catch(() => false);
      
      if (!exists) {
        // Try German localization
        doneButton = await this.browser.$('//XCUIElementTypeButton[@name="Fertig"]');
        exists = await doneButton.isExisting().catch(() => false);
      }
      
      if (!exists) {
        console.log(`[OAuthFlowManager] iOS: No InAppBrowser "Done" button found`);
        return false;
      }
      
      console.log(`[OAuthFlowManager] iOS: Pressing "Done" to close phantom InAppBrowser...`);
      await doneButton.click();
      await this.browser.pause(2000);
      console.log(`[OAuthFlowManager] iOS: Phantom InAppBrowser closed`);
      return true;
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS: Could not close phantom InAppBrowser: ${e}`);
      return false;
    }
  }
  
  /**
   * Find OAuth context via Appium's `mobile: getContexts` (iOS only).
   *
   * This uses the Remote Debugger's listing protocol to enumerate webview
   * targets and read their URLs WITHOUT attaching the Safari inspector.
   * This is critical on iOS because attaching the inspector to a WKWebView
   * blocks the shared WebKit process and prevents InAppBrowser navigation.
   */
  private async findOAuthContextViaListing(elapsedSec: number): Promise<string | null> {
    try {
      const detailed = await this.browser.execute('mobile: getContexts') as any[];
      if (!Array.isArray(detailed)) {
        console.log(`[OAuthFlowManager] [${elapsedSec}s] mobile: getContexts returned non-array`);
        return null;
      }
      
      const webviews = detailed.filter(
        (c: any) => c && c.id && String(c.id).includes("WEBVIEW") && String(c.id) !== String(this.appContext)
      );
      
      for (const ctx of webviews) {
        const url = ctx.url || "(no url)";
        const title = ctx.title || "";
        console.log(`[OAuthFlowManager] [${elapsedSec}s] ${ctx.id}: ${url} (${title})`);
        
        if (ctx.url && await this.isOAuthUrl(ctx.url)) {
          return String(ctx.id);
        }
      }
      
      if (webviews.length === 0) {
        console.log(`[OAuthFlowManager] [${elapsedSec}s] No non-app webviews found`);
      }
    } catch (e) {
      console.log(`[OAuthFlowManager] [${elapsedSec}s] mobile: getContexts failed: ${e}`);
      console.log(`[OAuthFlowManager] Falling back to standard context check...`);
      return null;
    }
    return null;
  }
  
  /**
   * Find the Android InAppBrowser via window handles and URL inspection.
   *
   * On Android, Cordova InAppBrowser runs inside the app's WebView process.
   * It shares the same context (e.g., WEBVIEW_com.neptune.azure) but opens
   * as a new window handle within that context.
   *
   * The InAppBrowser may already be open by the time we start looking
   * (the login click + postLoginClick pause gives it time to open), so we
   * can't rely on detecting "new" handles. Instead we check the URL of
   * ALL non-app window handles on every poll cycle.
   *
   * Strategy:
   * 1. Switch to the app's webview context
   * 2. Identify the current app window handle (our main page)
   * 3. Poll all window handles — check each non-app handle's URL for OAuth
   * 4. Also check for new handles appearing (InAppBrowser may open later)
   */
  private async findAndroidInAppBrowserWindow(timeout: number): Promise<Context> {
    const startTime = Date.now();
    
    // Switch to the app's webview context to access window handles
    if (this.appContext) {
      console.log(`[OAuthFlowManager] Android: Switching to app context: ${this.appContext}`);
      await this.browser.switchContext(String(this.appContext));
    } else {
      const contexts = contextIds(await this.browser.getContexts() as unknown[]);
      const webview = contexts.find(c =>
        c.includes("WEBVIEW") && !c.toLowerCase().includes("terrace")
      );
      if (webview) {
        console.log(`[OAuthFlowManager] Android: Switching to webview: ${webview}`);
        await this.browser.switchContext(webview);
      }
    }
    
    // Store the current (app) window handle so we can switch back later
    let appWindowHandle: string | undefined;
    try {
      appWindowHandle = await this.browser.getWindowHandle();
      console.log(`[OAuthFlowManager] Android: App window handle: ${appWindowHandle}`);
    } catch { /* ignore */ }
    
    while (Date.now() - startTime < timeout) {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      
      try {
        const currentHandles = await this.browser.getWindowHandles();
        console.log(`[OAuthFlowManager] [${elapsedSec}s] Android: ${currentHandles.length} window handle(s)`);
        
        // Check each handle's URL — skip the app window
        for (const handle of currentHandles) {
          if (handle === appWindowHandle) continue;
          
          try {
            await this.browser.switchToWindow(handle);
            await this.browser.pause(300);
            
            const url = await this.browser.getUrl();
            console.log(`[OAuthFlowManager] [${elapsedSec}s] Android: Window ${handle.substring(0, 8)}… URL: ${url}`);
            
            if (await this.isOAuthUrl(url)) {
              console.log(`[OAuthFlowManager] Android: Found OAuth in window ${handle}`);
              await this.stabilizeOAuthContext();
              this._androidAppWindowHandle = appWindowHandle;
              this._androidOAuthWindowHandle = handle;
              return String(this.appContext || "WEBVIEW") as Context;
            }
          } catch (e) {
            console.log(`[OAuthFlowManager] [${elapsedSec}s] Android: Window ${handle.substring(0, 8)}… check failed: ${e}`);
          }
        }
        
        // No OAuth found yet — switch back to app window before next poll
        if (appWindowHandle) {
          try { await this.browser.switchToWindow(appWindowHandle); } catch { /* ignore */ }
        }
      } catch (e) {
        console.log(`[OAuthFlowManager] [${elapsedSec}s] Android: Window handle poll error: ${e}`);
      }
      
      await this.browser.pause(TIMEOUTS.pollInterval);
    }
    
    throw new Error(`[OAuthFlowManager] Android: No InAppBrowser OAuth window found after ${timeout}ms`);
  }
  
  // Android InAppBrowser state — saved during detection so returnToAppAndRestore
  // can switch back to the correct window
  private _androidAppWindowHandle?: string;
  private _androidOAuthWindowHandle?: string;
  
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
   * Return to the app after OAuth completes.
   * 
   * IMPORTANT: Keep this minimal! The app needs its own event loop free to
   * handle post-OAuth lifecycle (cookie sync InAppBrowser, session setup, etc.).
   * Every execute() call via the Remote Inspector occupies the main webview's
   * JS event loop and can delay/prevent the app's own handlers from firing.
   * 
   * For InAppBrowser mode on iOS, the page was never reloaded — the wdi5 bridge
   * is still present from initial injection. We just need to switch to the right
   * context and confirm.
   */
  private async returnToAppAndRestore(browserMode: OAuthBrowserMode): Promise<void> {
    console.log(`[OAuthFlowManager] Returning to app (${browserMode} mode)...`);
    
    // Android InAppBrowser: the OAuth page was a window inside the app's
    // webview context. After login, the OAuth provider redirects, and the
    // InAppBrowser either closes or navigates away from the OAuth URL.
    // The window handle often persists as a stale reference even after
    // the InAppBrowser visually closes — so instead of waiting for the
    // handle to disappear (which can take forever), we check the URL of
    // the OAuth window: once it's no longer an OAuth URL, we're done.
    if (!this.isIOS() && browserMode === "inappbrowser" && this._androidAppWindowHandle) {
      console.log(`[OAuthFlowManager] Android: Waiting for InAppBrowser redirect/close...`);
      
      await this.browser.pause(TIMEOUTS.returnToApp.android);
      
      // Quick check: did the OAuth window close or redirect?
      if (this._androidOAuthWindowHandle) {
        for (let i = 0; i < 10; i++) {
          try {
            const handles = await this.browser.getWindowHandles();
            
            // Handle disappeared — InAppBrowser closed cleanly
            if (!handles.includes(this._androidOAuthWindowHandle)) {
              console.log(`[OAuthFlowManager] Android: InAppBrowser window closed after ${i}s`);
              break;
            }
            
            if (handles.length <= 1) {
              console.log(`[OAuthFlowManager] Android: Single window remaining`);
              break;
            }
            
            // Handle still exists — check its URL to see if OAuth completed
            await this.browser.switchToWindow(this._androidOAuthWindowHandle);
            const url = await this.browser.getUrl();
            if (!await this.isOAuthUrl(url)) {
              console.log(`[OAuthFlowManager] Android: InAppBrowser redirected away from OAuth (${url.substring(0, 60)}…)`);
              break;
            }
            
            console.log(`[OAuthFlowManager] Android: Still on OAuth URL, waiting... (${i}s)`);
          } catch {
            // Window became inaccessible — it's closed
            console.log(`[OAuthFlowManager] Android: InAppBrowser window no longer accessible`);
            break;
          }
          await this.browser.pause(1000);
        }
      }
      
      // Switch back to the app's window
      try {
        await this.browser.switchToWindow(this._androidAppWindowHandle);
        console.log(`[OAuthFlowManager] Android: Switched back to app window: ${this._androidAppWindowHandle}`);
      } catch (e) {
        console.log(`[OAuthFlowManager] Android: Could not switch to app window: ${e}`);
        try {
          const handles = await this.browser.getWindowHandles();
          if (handles.length > 0) {
            await this.browser.switchToWindow(handles[0]);
            console.log(`[OAuthFlowManager] Android: Fallback to first window: ${handles[0]}`);
          }
        } catch { /* ignore */ }
      }
      
      this._androidAppWindowHandle = undefined;
      this._androidOAuthWindowHandle = undefined;
      
      // Re-inject wdi5
      console.log(`[OAuthFlowManager] Re-injecting wdi5 bridge...`);
      try {
        await this.browser.injectUI5();
        console.log(`[OAuthFlowManager] wdi5 bridge re-injected successfully`);
      } catch (e) {
        console.error(`[OAuthFlowManager] wdi5 injection failed: ${e}`);
        await this.browser.pause(1500);
        try {
          await this.browser.injectUI5();
          console.log(`[OAuthFlowManager] wdi5 bridge re-injected on retry`);
        } catch (e2) {
          console.error(`[OAuthFlowManager] wdi5 injection retry also failed: ${e2}`);
        }
      }
      
      console.log(`[OAuthFlowManager] Back in app`);
      return;
    }
    
    const waitTime = this.isIOS() ? 3000 : TIMEOUTS.returnToApp.android;
    console.log(`[OAuthFlowManager] Waiting ${waitTime}ms for OAuth browser to close...`);
    await this.browser.pause(waitTime);
    
    // Switch to NATIVE_APP first — this is a clean "reset" point
    console.log(`[OAuthFlowManager] Switching to NATIVE_APP...`);
    try {
      await this.browser.switchContext("NATIVE_APP");
    } catch (e) {
      console.log(`[OAuthFlowManager] NATIVE_APP switch: ${e}`);
    }
    
    // Get fresh context list
    const contexts = contextIds(await this.browser.getContexts() as unknown[]);
    console.log(`[OAuthFlowManager] Contexts after OAuth: ${JSON.stringify(contexts)}`);
    
    // Find the correct app webview
    let targetWebview: string | null = null;
    
    if (this.appContext && String(this.appContext).includes("WEBVIEW")) {
      const stillExists = contexts.some(c => String(c) === String(this.appContext));
      if (stillExists) {
        targetWebview = String(this.appContext);
        console.log(`[OAuthFlowManager] Using original app webview: ${targetWebview}`);
      }
    }
    
    if (!targetWebview) {
      for (const ctx of contexts) {
        const ctxStr = String(ctx);
        if (!ctxStr.includes("WEBVIEW")) continue;
        if (ctxStr.toLowerCase().includes("chrome")) continue;
        
        const wasOriginal = this.contextsBeforeLogin.some(orig => String(orig) === ctxStr);
        if (wasOriginal) {
          targetWebview = ctxStr;
          console.log(`[OAuthFlowManager] Found original webview: ${targetWebview}`);
          break;
        }
      }
    }
    
    if (!targetWebview) {
      // Fallback: use lowest-numbered webview on iOS (main app)
      const webviews = contexts.map(String).filter(c => c.includes("WEBVIEW") && !c.toLowerCase().includes("chrome"));
      if (webviews.length > 0) {
        webviews.sort();
        targetWebview = webviews[0];
        console.log(`[OAuthFlowManager] Fallback to first webview: ${targetWebview}`);
      }
    }
    
    if (!targetWebview) {
      console.error(`[OAuthFlowManager] ERROR: No app webview found! Contexts: ${JSON.stringify(contexts)}`);
      throw new Error("No app webview found after OAuth");
    }
    
    // Share the app context with ContextUtil BEFORE switching
    const contextUtil = ContextUtil.getInstance();
    contextUtil.setMainAppContext(targetWebview);
    
    // On iOS, the app may open a cookie-sync InAppBrowser shortly after OAuth.
    // All WKWebViews in a Cordova app share one WebKit WebContent process.
    // Connecting the Safari Remote Inspector to ANY webview (via switchContext)
    // imposes overhead on the shared JS thread and blocks the InAppBrowser
    // from loading its page — causing the blank white screen.
    //
    // FIX: Stay in NATIVE_APP (no inspector connection) while the cookie-sync
    // InAppBrowser loads. Only switch to the app webview AFTER cookie sync
    // has had a clean window to complete. getContexts() is safe because it
    // uses the XCUITest driver, not the Remote Inspector.
    //
    // IMPORTANT: Use the current webview count as the baseline, NOT a
    // hardcoded "1". The app may have multiple webviews at rest (e.g.,
    // the main webview + a helper webview). A cookie-sync InAppBrowser
    // causes the count to INCREASE beyond the baseline.
    if (this.isIOS()) {
      const baselineWebviews = contexts.filter(c => c.includes("WEBVIEW"));
      const baselineCount = baselineWebviews.length;
      const baselineSet = new Set(baselineWebviews);
      console.log(`[OAuthFlowManager] iOS: Monitoring for cookie-sync (baseline: ${baselineCount} webviews)...`);
      let cookieSyncDetected = false;
      
      for (let i = 0; i < 15; i++) {
        await this.browser.pause(1000);
        const ctxs = contextIds(await this.browser.getContexts() as unknown[]);
        const wvs = ctxs.filter(c => c.includes("WEBVIEW"));
        if (wvs.length > baselineCount) {
          cookieSyncDetected = true;
          console.log(`[OAuthFlowManager] iOS: Cookie-sync InAppBrowser appeared after ${i + 1}s (${wvs.length} vs baseline ${baselineCount})`);
          break;
        }
        // Cookie-sync sometimes replaces a helper webview instead of adding one,
        // so the count stays the same but the ids change. Stay in NATIVE_APP.
        const identityChanged = wvs.some((id) => !baselineSet.has(id));
        if (identityChanged) {
          cookieSyncDetected = true;
          console.log(`[OAuthFlowManager] iOS: Cookie-sync webview identity changed after ${i + 1}s (count still ${wvs.length})`);
          break;
        }
      }
      
      if (cookieSyncDetected) {
        const loadPause = 5;
        console.log(`[OAuthFlowManager] iOS: Waiting ${loadPause}s for cookie-sync to load (NATIVE_APP, no inspector)...`);
        await this.browser.pause(loadPause * 1000);
        console.log(`[OAuthFlowManager] iOS: Cookie-sync window complete`);
      } else {
        // Sync may have finished during the IdP window. A short NATIVE_APP
        // grace wait still avoids attaching the inspector too early (NAD iOS
        // Azure/Okta: "No cookie-sync" then login assertion false).
        const gracePause = 3;
        console.log(`[OAuthFlowManager] iOS: No cookie-sync InAppBrowser detected, waiting ${gracePause}s in NATIVE_APP before attaching inspector`);
        await this.browser.pause(gracePause * 1000);
      }
    }
    
    // NOW connect the inspector by switching to the app webview
    console.log(`[OAuthFlowManager] Switching to app webview: ${targetWebview}`);
    await this.browser.switchContext(targetWebview);
    
    // Now it's safe to inject wdi5 — cookie sync is done (or didn't happen)
    console.log(`[OAuthFlowManager] Re-injecting wdi5 bridge...`);
    try {
      await this.browser.injectUI5();
      console.log(`[OAuthFlowManager] wdi5 bridge re-injected successfully`);
    } catch (e) {
      console.error(`[OAuthFlowManager] wdi5 injection failed: ${e}`);
      await this.browser.pause(1500);
      try {
        await this.browser.injectUI5();
        console.log(`[OAuthFlowManager] wdi5 bridge re-injected on retry`);
      } catch (e2) {
        console.error(`[OAuthFlowManager] wdi5 injection retry also failed: ${e2}`);
      }
    }
    
    console.log(`[OAuthFlowManager] Back in app`);
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
