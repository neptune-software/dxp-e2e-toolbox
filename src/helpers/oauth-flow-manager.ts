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
  
  // Track if OAuth was auto-triggered (dialog cleared = auto-triggered on iOS)
  private oauthAutoTriggered: boolean = false;
  
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
      
      // Step 4: Perform the actual OAuth login (unless auto-completed)
      if (String(loginContext) === "OAUTH_AUTO_COMPLETED") {
        console.log(`[OAuthFlowManager] OAuth auto-completed (SSO/cached credentials)`);
      } else {
        await this.executeOAuthLogin(provider, credentials, sapBasicLoginHandler, customLoginHandler);
      }
      
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
   * 
   * CRITICAL: For iOS, if we clear a permission dialog here, it means
   * OAuth was auto-triggered by the app and Safari is now opening.
   * We MUST NOT try to inject wdi5 and click login button in this case!
   */
  private async captureInitialState(): Promise<void> {
    // Reset auto-triggered flag at the START
    this.oauthAutoTriggered = false;
    
    // Get contexts BEFORE any dialog handling - this is the original app state
    try {
      this.contextsBeforeLogin = await this.browser.getContexts() as string[];
      console.log(`[OAuthFlowManager] Initial contexts (before dialog check): ${JSON.stringify(this.contextsBeforeLogin)}`);
    } catch (e) {
      console.log(`[OAuthFlowManager] Could not get initial contexts: ${e}`);
      this.contextsBeforeLogin = [];
    }
    
    // Find app webview BEFORE dialog handling - Android has package name, iOS has numeric ID
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
      console.log(`[OAuthFlowManager] App webview (before OAuth): ${this.appContext}`);
    } else {
      try {
        this.appContext = await this.browser.getContext();
        console.log(`[OAuthFlowManager] Current context: ${this.appContext}`);
      } catch (e) {
        console.log(`[OAuthFlowManager] Could not get current context: ${e}`);
        this.appContext = null;
      }
    }
    
    // Stabilization pause
    const stabilizationWait = this.isIOS() 
      ? TIMEOUTS.appStabilization.ios 
      : TIMEOUTS.appStabilization.android;
    await this.browser.pause(stabilizationWait);
    
    // iOS: Clear permission dialog - if successful, OAuth was AUTO-TRIGGERED!
    // This dialog appears when iOS asks "App wants to use example.com to sign in"
    if (this.isIOS()) {
      console.log(`[OAuthFlowManager] iOS: Checking for 'wants to sign in' dialog...`);
      try {
        await this.browser.acceptAlert();
        console.log(`[OAuthFlowManager] iOS: *** DIALOG ACCEPTED - OAuth AUTO-TRIGGERED! ***`);
        this.oauthAutoTriggered = true;
        // Give Safari time to open
        await this.browser.pause(2000);
      } catch {
        console.log(`[OAuthFlowManager] iOS: No permission dialog found`);
      }
    }
    
    // For Android, check if Chrome webview is already present (means OAuth auto-triggered)
    if (!this.isIOS()) {
      const chromePresent = this.contextsBeforeLogin.some(c => 
        String(c).toUpperCase().includes("CHROME")
      );
      if (chromePresent) {
        console.log(`[OAuthFlowManager] Android: Chrome already present - OAuth AUTO-TRIGGERED!`);
        this.oauthAutoTriggered = true;
      }
    }
  }
  
  /**
   * Detect and handle OAuth trigger (auto vs manual)
   * Returns true if OAuth was auto-triggered
   * 
   * IMPORTANT: If oauthAutoTriggered is already true (set in captureInitialState),
   * we skip all detection and manual login - OAuth browser is already open!
   */
  private async handleOAuthTrigger(
    launchpadName?: string,
    browserMode: OAuthBrowserMode = "native"
  ): Promise<boolean> {
    // If already detected as auto-triggered in captureInitialState, skip detection
    if (this.oauthAutoTriggered) {
      console.log(`[OAuthFlowManager] OAuth was auto-triggered (detected in initial state)`);
      return true;
    }
    
    let autoTriggered = false;
    
    if (browserMode === "native") {
      // Native browser mode - do a final check for dialogs/new browser
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
      console.log(`[OAuthFlowManager] Manual login mode - triggering OAuth via login button...`);
      await this.triggerManualLogin(launchpadName);
    } else if (!autoTriggered && !launchpadName) {
      console.log(`[OAuthFlowManager] WARNING: Not auto-triggered but no launchpadName provided for manual login`);
    }
    
    return autoTriggered;
  }
  
  /**
   * Handle iOS native OAuth trigger detection (Safari)
   * 
   * Returns true if OAuth was auto-triggered (Safari opened automatically).
   * Note: This is called AFTER captureInitialState, which already checks for dialog.
   */
  private async handleIOSNativeOAuthTrigger(): Promise<boolean> {
    // Already checked in captureInitialState, but flag not set means no dialog was found
    console.log(`[OAuthFlowManager] iOS: Final check for Safari dialog...`);
    
    // One quick attempt - if there's a late dialog, clear it
    try {
      await this.browser.acceptAlert();
      console.log(`[OAuthFlowManager] iOS: Late dialog cleared - OAuth auto-triggered!`);
      this.oauthAutoTriggered = true;
      await this.browser.pause(2000);
      return true;
    } catch {
      // No dialog
    }
    
    // Also check if Safari is already open (Cancel button visible)
    try {
      await this.browser.switchContext("NATIVE_APP");
      const cancelButton = await this.browser.$('//XCUIElementTypeButton[@name="Cancel"]');
      const safariOpen = await cancelButton.isExisting().catch(() => false);
      
      if (safariOpen) {
        console.log(`[OAuthFlowManager] iOS: Safari already open (Cancel visible) - OAuth auto-triggered!`);
        this.oauthAutoTriggered = true;
        return true;
      }
    } catch (e) {
      console.log(`[OAuthFlowManager] iOS: Safari check failed: ${e}`);
    }
    
    console.log(`[OAuthFlowManager] iOS: No auto-trigger detected - manual login required`);
    return false;
  }
  
  /**
   * Handle Android native OAuth trigger detection (Chrome)
   * 
   * Returns true if OAuth was auto-triggered (Chrome opened automatically).
   * Note: captureInitialState already checks if Chrome was present at start.
   */
  private async handleAndroidNativeOAuthTrigger(): Promise<boolean> {
    console.log(`[OAuthFlowManager] Android: Checking for Chrome webview...`);
    
    // Wait briefly for Chrome to potentially appear
    await this.browser.pause(1500);
    
    const contextsNow = await this.browser.getContexts() as string[];
    console.log(`[OAuthFlowManager] Android: Current contexts: ${JSON.stringify(contextsNow)}`);
    
    // Check if Chrome is now present
    const chromeContext = contextsNow.find(c => 
      String(c).toUpperCase().includes("CHROME")
    );
    
    if (chromeContext) {
      console.log(`[OAuthFlowManager] Android: Chrome found - OAuth auto-triggered!`);
      this.oauthAutoTriggered = true;
      return true;
    }
    
    console.log(`[OAuthFlowManager] Android: No Chrome - manual login required`);
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
   * 
   * CRITICAL: We must switch to the ORIGINAL app webview (captured before any OAuth),
   * not any new webviews that may have appeared (those could be Safari/Chrome).
   */
  private async triggerManualLogin(launchpadName: string): Promise<void> {
    console.log(`[OAuthFlowManager] Triggering manual login for: ${launchpadName}`);
    console.log(`[OAuthFlowManager] Original app context: ${this.appContext}`);
    console.log(`[OAuthFlowManager] Original contexts: ${JSON.stringify(this.contextsBeforeLogin)}`);
    
    // We MUST use the original app context - don't fetch new contexts!
    // New contexts may include Safari/Chrome which would break wdi5 injection.
    
    let targetContext: string | null = null;
    
    // Priority 1: Use saved appContext if it's a webview
    if (this.appContext && String(this.appContext).includes("WEBVIEW")) {
      targetContext = String(this.appContext);
      console.log(`[OAuthFlowManager] Using saved app webview: ${targetContext}`);
    }
    
    // Priority 2: Find Android app webview from original contexts
    if (!targetContext) {
      targetContext = this.contextsBeforeLogin.find(c => {
        const ctxStr = String(c).toLowerCase();
        return ctxStr.includes("webview") && ctxStr.includes("com.neptune");
      }) || null;
      if (targetContext) {
        console.log(`[OAuthFlowManager] Using Android app webview from initial: ${targetContext}`);
      }
    }
    
    // Priority 3: Any non-browser webview from original contexts
    if (!targetContext) {
      targetContext = this.contextsBeforeLogin.find(c => {
        const ctxStr = String(c).toLowerCase();
        if (!ctxStr.includes("webview")) return false;
        if (ctxStr.includes("chrome")) return false;
        if (ctxStr.includes("terrace")) return false;
        return true;
      }) || null;
      if (targetContext) {
        console.log(`[OAuthFlowManager] Using webview from initial contexts: ${targetContext}`);
      }
    }
    
    if (!targetContext) {
      throw new Error(`[OAuthFlowManager] Cannot find app webview! Original contexts: ${JSON.stringify(this.contextsBeforeLogin)}`);
    }
    
    // Switch to the app webview
    await this.browser.switchContext(targetContext);
    console.log(`[OAuthFlowManager] Switched to: ${targetContext}`);
    await this.browser.pause(1000);
    
    // Verify we're in the app (not OAuth page)
    try {
      const url = await this.browser.getUrl();
      console.log(`[OAuthFlowManager] URL after switch: ${url}`);
      if (!url.startsWith("file://")) {
        console.log(`[OAuthFlowManager] WARNING: URL doesn't look like app (expected file://)`);
      }
    } catch (e) {
      console.log(`[OAuthFlowManager] Could not verify URL: ${e}`);
    }
    
    // Inject wdi5 (it was skipped at startup for OAuth flows)
    console.log(`[OAuthFlowManager] Injecting wdi5 for login button...`);
    await this.browser.injectUI5();
    await this.browser.pause(1000);
    
    // Click the login button
    const launchpad = await ToolboxFactory.createLaunchpad({ launchpadName });
    await launchpad.clickLogin();
    console.log(`[OAuthFlowManager] Login button clicked - OAuth should open now`);
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
      const cancelButton = await this.browser.$('//XCUIElementTypeButton[@name="Cancel"]');
      const isSafariOpen = await cancelButton.isExisting().catch(() => false);
      
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
   * 
   * This is critical for iOS where Safari opens externally. We need to:
   * 1. Wait for Safari to fully close
   * 2. Switch to NATIVE_APP first to stabilize
   * 3. Clear any dialogs
   * 4. Switch to the app webview
   * 5. Inject wdi5
   */
  private async returnToAppAndRestore(browserMode: OAuthBrowserMode): Promise<void> {
    console.log(`[OAuthFlowManager] Returning to app (${browserMode} mode)...`);
    
    // iOS needs longer wait for Safari to fully close
    const waitTime = this.isIOS() ? 4000 : TIMEOUTS.returnToApp.android;
    console.log(`[OAuthFlowManager] Waiting ${waitTime}ms for OAuth browser to close...`);
    await this.browser.pause(waitTime);
    
    // CRITICAL: Switch to NATIVE_APP first to stabilize the session
    // This helps clear any stale webview state from Safari
    console.log(`[OAuthFlowManager] Switching to NATIVE_APP to stabilize...`);
    try {
      await this.browser.switchContext("NATIVE_APP");
      await this.browser.pause(500);
    } catch (e) {
      console.log(`[OAuthFlowManager] NATIVE_APP switch: ${e}`);
    }
    
    // iOS: Clear any blocking dialogs AGGRESSIVELY
    if (this.isIOS()) {
      // console.log(`[OAuthFlowManager] iOS: Clearing dialogs before webview switch...`);
      // for (let attempt = 0; attempt < 5; attempt++) {
      //   try {
      //     await this.browser.acceptAlert();
      //     console.log(`[OAuthFlowManager] iOS: Cleared dialog ${attempt + 1}`);
      //     await this.browser.pause(500);
      //   } catch {
      //     // No more dialogs
      //     break;
      //   }
      // }
      // Additional wait for iOS after dialog handling
      await this.browser.pause(1000);
    }
    
    // Get fresh context list AFTER stabilization
    const contexts = await this.browser.getContexts() as string[];
    console.log(`[OAuthFlowManager] Available contexts after stabilization: ${JSON.stringify(contexts)}`);
    
    // Find the correct app webview to switch to
    let targetWebview: string | null = null;
    
    // Priority 1: Original app webview from before OAuth
    if (this.appContext && String(this.appContext).includes("WEBVIEW")) {
      const stillExists = contexts.some(c => String(c) === String(this.appContext));
      if (stillExists) {
        targetWebview = String(this.appContext);
        console.log(`[OAuthFlowManager] Using original app webview: ${targetWebview}`);
      }
    }
    
    // Priority 2: Find app webview from original contexts
    if (!targetWebview) {
      for (const ctx of contexts) {
        const ctxStr = String(ctx);
        if (!ctxStr.includes("WEBVIEW")) continue;
        if (ctxStr.toLowerCase().includes("chrome")) continue;
        
        // Check if this was in our original contexts
        const wasOriginal = this.contextsBeforeLogin.some(orig => String(orig) === ctxStr);
        if (wasOriginal) {
          targetWebview = ctxStr;
          console.log(`[OAuthFlowManager] Found original webview: ${targetWebview}`);
          break;
        }
      }
    }
    
    // Priority 3: Any non-browser webview
    if (!targetWebview) {
      for (const ctx of contexts) {
        const ctxStr = String(ctx);
        if (!ctxStr.includes("WEBVIEW")) continue;
        if (ctxStr.toLowerCase().includes("chrome")) continue;
        if (ctxStr.toLowerCase().includes("terrace")) continue;
        targetWebview = ctxStr;
        console.log(`[OAuthFlowManager] Fallback webview: ${targetWebview}`);
        break;
      }
    }
    
    if (!targetWebview) {
      console.error(`[OAuthFlowManager] ERROR: No app webview found! Contexts: ${JSON.stringify(contexts)}`);
      throw new Error("No app webview found after OAuth");
    }
    
    // Switch to the app webview
    console.log(`[OAuthFlowManager] Switching to app webview: ${targetWebview}`);
    await this.browser.switchContext(targetWebview);
    await this.browser.pause(1000);
    
    // Verify URL
    try {
      const currentUrl = await this.browser.getUrl();
      console.log(`[OAuthFlowManager] URL after switch: ${currentUrl}`);
      if (!currentUrl.startsWith("file://")) {
        console.log(`[OAuthFlowManager] WARNING: Unexpected URL (expected file://)`);
      }
    } catch (e) {
      console.log(`[OAuthFlowManager] Could not get URL: ${e}`);
    }
    
    // iOS: One more dialog check before wdi5 injection
    if (this.isIOS()) {
      try {
       // await this.browser.acceptAlert();
       // console.log(`[OAuthFlowManager] iOS: Cleared late dialog`);
        await this.browser.pause(500);
      } catch {
        // No dialog
      }
    }
    
    // iOS: Aggressive recovery to reset corrupted Safari Remote Debugger state
    // The Safari debugger connection gets corrupted after external Safari closes
    if (this.isIOS()) {
      console.log(`[OAuthFlowManager] iOS: Starting aggressive webview recovery...`);
      
      // Step 1: Multiple context switches to reset WebDriver state
      for (let i = 0; i < 2; i++) {
        try {
          await this.browser.switchContext("NATIVE_APP");
          await this.browser.pause(500);
          await this.browser.switchContext(targetWebview);
          await this.browser.pause(500);
        } catch (e) {
          console.log(`[OAuthFlowManager] iOS: Context reset ${i + 1}: ${e}`);
        }
      }
      
      // Step 2: Clear any lingering dialogs
      for (let i = 0; i < 3; i++) {
        try { await this.browser.acceptAlert(); await this.browser.pause(300); } catch { break; }
      }
      
      // Step 3: Multiple warmup execute calls to re-establish debugger connection
      console.log(`[OAuthFlowManager] iOS: Warming up Safari debugger connection...`);
      let warmupSuccess = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          // Use multiple simple sync execute calls to "prime" the connection
          await this.browser.execute(() => true);
          await this.browser.execute(() => document.readyState);
          await this.browser.execute(() => window.location.href);
          const hasSap = await this.browser.execute(() => typeof (window as any).sap !== "undefined");
          console.log(`[OAuthFlowManager] iOS: Warmup ${attempt + 1} succeeded, hasSap=${hasSap}`);
          warmupSuccess = true;
          break;
        } catch (e) {
          console.log(`[OAuthFlowManager] iOS: Warmup ${attempt + 1} failed: ${e}`);
          await this.browser.pause(1500);
          
          // Try context reset on failure
          try {
            await this.browser.switchContext("NATIVE_APP");
            await this.browser.pause(300);
            try { await this.browser.acceptAlert(); } catch { /* ignore */ }
            await this.browser.switchContext(targetWebview);
            await this.browser.pause(500);
          } catch { /* ignore */ }
        }
      }
      
      if (!warmupSuccess) {
        console.error(`[OAuthFlowManager] iOS: Warmup failed after all attempts!`);
      }
      
      // Step 4: Extra stabilization wait
      await this.browser.pause(1000);
    }
    
    // Re-inject wdi5 - CRITICAL for UI5 interactions after OAuth
    console.log(`[OAuthFlowManager] Re-injecting wdi5...`);
    let wdi5Injected = false;
    
    // iOS needs more attempts and longer delays due to Safari debugger instability
    const maxAttempts = this.isIOS() ? 5 : 3;
    const retryDelay = this.isIOS() ? 3000 : 2000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // iOS: One more warmup check before each injection attempt
        if (this.isIOS() && attempt > 0) {
          console.log(`[OAuthFlowManager] iOS: Pre-injection warmup for attempt ${attempt + 1}...`);
          try {
            await this.browser.execute(() => true);
            await this.browser.execute(() => document.readyState);
          } catch (warmupErr) {
            console.log(`[OAuthFlowManager] iOS: Pre-injection warmup failed: ${warmupErr}`);
            // Continue anyway, the actual injection might work
          }
        }
        
        await this.browser.injectUI5();
        await this.browser.pause(TIMEOUTS.postInjection);
        console.log(`[OAuthFlowManager] wdi5 injected successfully (attempt ${attempt + 1})`);
        wdi5Injected = true;
        break;
      } catch (e) {
        console.error(`[OAuthFlowManager] wdi5 injection attempt ${attempt + 1}/${maxAttempts} failed: ${e}`);
        
        if (attempt < maxAttempts - 1) {
          // Wait longer between retries
          console.log(`[OAuthFlowManager] Waiting ${retryDelay}ms before retry...`);
          await this.browser.pause(retryDelay);
          
          // iOS: Aggressive context reset between attempts
          if (this.isIOS() && targetWebview) {
            try {
              console.log(`[OAuthFlowManager] iOS: Full context reset before retry...`);
              
              // Switch to NATIVE_APP
              await this.browser.switchContext("NATIVE_APP");
              await this.browser.pause(500);
              
              // Clear any dialogs
              for (let d = 0; d < 3; d++) {
                try { await this.browser.acceptAlert(); await this.browser.pause(200); } catch { break; }
              }
              
              // Switch back to webview
              await this.browser.switchContext(targetWebview);
              await this.browser.pause(1000);
              
              // Try to verify we can execute in this context
              try {
                const ready = await this.browser.execute(() => document.readyState);
                console.log(`[OAuthFlowManager] iOS: Context reset successful, readyState=${ready}`);
              } catch (execErr) {
                console.log(`[OAuthFlowManager] iOS: Post-reset execute failed: ${execErr}`);
              }
            } catch (ctxErr) {
              console.log(`[OAuthFlowManager] iOS: Context reset failed: ${ctxErr}`);
            }
          }
        }
      }
    }
    
    if (!wdi5Injected) {
      console.error(`[OAuthFlowManager] WARNING: wdi5 injection failed after ${maxAttempts} attempts!`);
      console.error(`[OAuthFlowManager] UI5 controls may not work properly.`);
      
      // iOS: Last resort - try a simple fallback approach
      if (this.isIOS()) {
        console.log(`[OAuthFlowManager] iOS: Attempting fallback wdi5 setup...`);
        try {
          // Wait for page to be fully loaded
          await this.browser.pause(2000);
          
          // Check if UI5 is already available
          const hasUI5 = await this.browser.execute(() => {
            return typeof (window as any).sap !== "undefined" && 
                   typeof (window as any).sap.ui !== "undefined";
          });
          
          if (hasUI5) {
            console.log(`[OAuthFlowManager] iOS: UI5 is present, attempting direct bridge injection...`);
            // Try one more time after confirming UI5 is there
            try {
              await this.browser.injectUI5();
              console.log(`[OAuthFlowManager] iOS: Fallback injection succeeded!`);
              wdi5Injected = true;
            } catch (finalErr) {
              console.error(`[OAuthFlowManager] iOS: Fallback injection also failed: ${finalErr}`);
            }
          } else {
            console.error(`[OAuthFlowManager] iOS: UI5 not present in webview!`);
          }
        } catch (fallbackErr) {
          console.error(`[OAuthFlowManager] iOS: Fallback check failed: ${fallbackErr}`);
        }
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
