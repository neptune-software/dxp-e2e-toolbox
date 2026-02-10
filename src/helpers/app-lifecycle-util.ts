/**
 * App Lifecycle Utilities
 * 
 * Provides consistent, cross-platform utilities for managing mobile app lifecycle:
 * - Terminate (kill) app - clears ALL data
 * - Close app - closes activity but preserves localStorage/cache
 * - Background app - minimize without closing
 * - Activate (bring to foreground) app
 * - Restart app - close and reopen (preserves data, shows initial screen like pincode)
 * 
 * Works consistently across iOS and Android.
 */

/// <reference types="webdriverio" />
/// <reference path="../types/webdriverio-augmentation.d.ts" />

import { Environment } from "../core/environment.js";
import { ContextUtil } from "./context-util.js";

/** Context from getContexts(): id string or detailed context object. */
type ContextItem = string | { id: string };
function getContextId(ctx: ContextItem): string {
  return typeof ctx === "string" ? ctx : ctx.id;
}

import { ToolboxError } from "../core/errors.js";

/**
 * Options for app lifecycle operations.
 */
export interface AppLifecycleOptions {
  /**
   * App package/bundle identifier.
   * Auto-detected if not provided.
   */
  appId?: string;

  /**
   * Timeout for operations (ms).
   */
  timeout?: number;
}

/**
 * Options for restarting an app.
 */
export interface RestartAppOptions extends AppLifecycleOptions {
  /**
   * Restart mode:
   * - 'fresh': Close app activity and reopen - preserves localStorage/cache but restarts fresh (default)
   *            This will show the initial screen (e.g., pincode entry) not resume where you were
   * - 'resume': Background and reactivate - resumes exactly where you left off
   * - 'clean': Terminate and reactivate - clears ALL data including localStorage
   * @default 'fresh'
   */
  mode?: "fresh" | "resume" | "clean";

  /**
   * Wait time (ms) between close and activate.
   * @default 1000
   */
  pauseBetween?: number;

  /**
   * Wait time (ms) after activation for app to stabilize.
   * @default 3000
   */
  pauseAfter?: number;
}

/**
 * Error thrown when app lifecycle operations fail.
 */
export class AppLifecycleError extends ToolboxError {
  public readonly operation: string;

  constructor(operation: string, message: string) {
    super(`App lifecycle operation "${operation}" failed: ${message}`, "APP_LIFECYCLE_ERROR");
    this.name = "AppLifecycleError";
    this.operation = operation;
  }
}

/**
 * Singleton utility for managing mobile app lifecycle.
 * 
 * @example
 * ```typescript
 * const lifecycle = AppLifecycleUtil.getInstance();
 * 
 * // Fresh restart (preserves localStorage, shows initial screen)
 * await lifecycle.restartApp({ mode: 'fresh' });
 * 
 * // Clean restart (clears everything)
 * await lifecycle.restartApp({ mode: 'clean' });
 * 
 * // Just background the app
 * await lifecycle.backgroundApp();
 * 
 * // Bring app back to foreground
 * await lifecycle.activateApp();
 * ```
 */
export class AppLifecycleUtil {
  private static instance: AppLifecycleUtil;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  public static getInstance(): AppLifecycleUtil {
    if (!AppLifecycleUtil.instance) {
      AppLifecycleUtil.instance = new AppLifecycleUtil();
    }
    return AppLifecycleUtil.instance;
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
   * Get the current app's package/bundle ID.
   */
  public async getAppId(): Promise<string> {
    // return "com.neptune.ref_basic_pin";
     try {
      if (this.isAndroid()) {
        // Use new mobile: command to avoid deprecation warning
        try {
          return await this.browser.execute("mobile: getCurrentPackage") as string;
        } catch {
          // Fallback to old method
          return await this.browser.getCurrentPackage();
        }
      } else if (this.isIOS()) {
        const caps = this.browser.capabilities;
        return caps?.bundleId || caps?.["appium:bundleId"] || "";
      }
      throw new AppLifecycleError("getAppId", "Unknown platform");
    } catch (error) {
      throw new AppLifecycleError(
        "getAppId",
        error instanceof Error ? error.message : String(error)
      );
    }  
  }

  /**
   * Terminate (kill) the app completely.
   * This clears all local storage and app state.
   */
  public async terminateApp(options: AppLifecycleOptions = {}): Promise<void> {
    const appId = options.appId || (await this.getAppId());

    try {
      if (this.isAndroid()) {
        try {
          await this.browser.execute("mobile: terminateApp", { appId });
        } catch {
          await this.browser.terminateApp(appId);
        }
      } else if (this.isIOS()) {
        try {
          await this.browser.execute("mobile: terminateApp", { bundleId: appId });
        } catch {
          await this.browser.terminateApp(appId);
        }
      } else {
        throw new AppLifecycleError("terminateApp", "Unknown platform");
      }
    } catch (error) {
      // Some errors are expected if app is already terminated
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("not running") && !msg.includes("not found")) {
        throw new AppLifecycleError("terminateApp", msg);
      }
    }
  }

  /**
   * Background the app (preserves state).
   * @param duration Time in seconds to background. Use -1 for indefinite.
   */
  public async backgroundApp(duration: number = -1): Promise<void> {
    try {
      try {
        await this.browser.execute("mobile: backgroundApp", { seconds: duration });
      } catch {
        await this.browser.background(duration);
      }
    } catch (error) {
      throw new AppLifecycleError(
        "backgroundApp",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Activate (bring to foreground) the app.
   */
  public async activateApp(options: AppLifecycleOptions = {}): Promise<void> {
    const appId = options.appId || (await this.getAppId());

    try {
      await this.browser.activateApp(appId);
    } catch (error) {
      throw new AppLifecycleError(
        "activateApp",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Close the app for a fresh restart (preserves localStorage/cache).
   *
   * On Android: Uses closeApp() which closes the app activity but preserves
   * the app data/localStorage. This is the key to getting the pincode screen on restart.
   *
   * On iOS: Uses mobile: terminateApp (localStorage is preserved in WebKit storage).
   */
  public async closeApp(options: AppLifecycleOptions = {}): Promise<void> {
    const appId = options.appId || (await this.getAppId());

    try {
      if (this.isAndroid()) {
        // closeApp() closes the activity but preserves localStorage (no mobile: equivalent)
        await this.browser.execute("mobile: terminateApp",{appId:appId});
        console.log(`[AppLifecycleUtil] closeApp: App closed (Android)`);
      } else if (this.isIOS()) {
        try {
          await this.browser.execute("mobile: terminateApp",{ appId :appId});
        } catch {
          await this.browser.terminateApp(appId);
        }
        console.log(`[AppLifecycleUtil] closeApp: App ${appId} closed (iOS)`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`[AppLifecycleUtil] closeApp error: ${msg}`);
    }
  }

  /**
   * Wait for Neptune splash screen to disappear.
   * Safely checks if neptune.Splash exists before using it.
   */
  public async waitForSplashScreenGone(timeout: number = 30000): Promise<void> {
    try {
      await this.browser.waitUntil(
        async () => {
          const isSplashActive = await this.browser.execute(() => {
            if (window.neptune?.Splash?.isActive) {
              return window.neptune.Splash!.isActive();
            }
            return false;
          });
          return !isSplashActive;
        },
        {
          timeout,
          timeoutMsg: "Neptune splash screen did not disappear",
          interval: 500,
        }
      );
    } catch {
      // Non-critical - splash screen might not exist or already gone
      console.log("[AppLifecycleUtil] Splash screen check completed (may not exist)");
    }
  }

  /**
   * Wait for app to be ready after restart.
   * Ensures WebView context is available and switches to it.
   */
  public async waitForAppReady(timeout: number = 20000): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;
    let lastError: string = "";
    let webviewContext: string | null = null;
    
    console.log(`[AppLifecycleUtil] waitForAppReady: Waiting for WebView context...`);
    
    // Wait for WebView context to be available
    while (Date.now() - startTime < timeout) {
      try {
        const contexts = await this.browser.getContexts();
        console.log(`[AppLifecycleUtil] waitForAppReady: Available contexts: ${JSON.stringify(contexts)}`);
        
        // Find the WebView context
        for (const ctx of contexts) {
          const id = getContextId(ctx as ContextItem);
          if (id && id.includes("WEBVIEW")) {
            webviewContext = id;
            break;
          }
        }
        
        if (webviewContext) {
          console.log(`[AppLifecycleUtil] waitForAppReady: Found WebView context: ${webviewContext}`);
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.log(`[AppLifecycleUtil] waitForAppReady: Error getting contexts: ${lastError}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    if (!webviewContext) {
      throw new AppLifecycleError(
        "waitForAppReady",
        `WebView context not available after ${timeout}ms. Last error: ${lastError}`
      );
    }
    
    // Switch to the WebView context
    console.log(`[AppLifecycleUtil] waitForAppReady: Switching to WebView context...`);
    try {
      await this.browser.switchContext(webviewContext);
      console.log(`[AppLifecycleUtil] waitForAppReady: Successfully switched to WebView`);
    } catch (error) {
      console.log(`[AppLifecycleUtil] waitForAppReady: Error switching context: ${error}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        await this.browser.switchContext(webviewContext);
      } catch (retryError) {
        console.log(`[AppLifecycleUtil] waitForAppReady: Retry failed: ${retryError}`);
      }
    }
    
    // Wait for WebView to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Reinject UI5/wdi5 bridge after app restart.
   * This is necessary because the app context is lost on restart.
   */
  public async reinjectUI5(): Promise<void> {
    try {
      console.log("[AppLifecycleUtil] Attempting to reinject UI5/wdi5 bridge...");
      
      // Check if injectUI5 command exists (added by wdio-wdi5-cordova-service)
      // Note: injectUI5() now internally clears the __wdi5CordovaDomIdPatchApplied flag
      // so the iOS domId fix gets reapplied after app restart
      if (typeof this.browser.injectUI5 === "function") {
        console.log("[AppLifecycleUtil] browser.injectUI5() command found, calling it...");
        await this.browser.injectUI5();
        console.log("[AppLifecycleUtil] UI5/wdi5 bridge reinjected successfully");
        
        // Verify injection worked
        const isInjected = await this.browser.execute(() => {
          return !!(window as any).wdi5 && !!(window as any).bridge;
        });
        
        if (isInjected) {
          console.log("[AppLifecycleUtil] Verified: wdi5 bridge is active");
        } else {
          console.warn("[AppLifecycleUtil] Warning: wdi5 bridge may not be fully initialized");
        }
      } else {
        console.warn("[AppLifecycleUtil] browser.injectUI5() command not available - this is required for reinjection after app restart");
      }
    } catch (error) {
      console.warn(`[AppLifecycleUtil] Could not reinject UI5: ${error}`);
    }
  }

  /**
   * Restore WebView context and reinject UI5 bridge after app restart.
   * This handles all the technical details so the caller can just continue with business logic.
   * 
   * After relaunchActiveApp(), the ChromeDriver session to the old WebView is invalidated.
   * With autoWebview: true, Appium should automatically reconnect to the WebView.
   * We use the switchToWebContext command from wdi5-cordova-service if available.
   */
  public async restoreContextAfterRestart(): Promise<void> {
    try {
      // CRITICAL: Clear cached context info since after restart the context IDs change
      // On iOS, webview IDs are numeric and change on each restart (e.g., WEBVIEW_2075.2 -> WEBVIEW_2090.2)
      console.log("[AppLifecycleUtil] Clearing cached context information...");
      ContextUtil.getInstance().clearCache();
      
      // Step 1: First, switch to NATIVE_APP context and wait for session to stabilize
      // This is important because after relaunchActiveApp(), the ChromeDriver session is in flux
      console.log("[AppLifecycleUtil] Switching to NATIVE_APP context to stabilize session...");
      try {
        await this.browser.switchContext("NATIVE_APP");
        console.log("[AppLifecycleUtil] Switched to NATIVE_APP context");
      } catch (e) {
        console.log("[AppLifecycleUtil] switchContext NATIVE_APP: " + e);
      }
      
      // Step 2: Wait for app to fully initialize and WebView to be ready
      // Use getContexts() in a loop to wait for the WebView context to appear
      console.log("[AppLifecycleUtil] Waiting for WebView context to become available...");
      let webviewContextFound = false;
      
      for (let i = 0; i < 20; i++) { // Max 20 seconds wait
        try {
          const contexts = await this.browser.getContexts();
          console.log(`[AppLifecycleUtil] Available contexts: ${JSON.stringify(contexts)}`);
          
          const contextIds = (contexts as unknown[]).map((ctx) => getContextId(ctx as ContextItem));
          const hasWebview = contextIds.some(id => id && id.toUpperCase().includes("WEBVIEW"));
          
          if (hasWebview) {
            webviewContextFound = true;
            console.log("[AppLifecycleUtil] WebView context is available");
            break;
          }
        } catch (error) {
          console.log(`[AppLifecycleUtil] Waiting for contexts... (${i + 1}/20): ${error}`);
        }
        await this.browser.pause(1000);
      }
      
      if (!webviewContextFound) {
        console.warn("[AppLifecycleUtil] WebView context not available after waiting");
        return;
      }
      
      // Step 3: Now switch to WebView context
      const browserAny = this.browser as any;
      
      if (typeof browserAny.switchToWebContext === "function") {
        console.log("[AppLifecycleUtil] Using switchToWebContext from wdi5-cordova-service...");
        
        let switchSuccess = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await browserAny.switchToWebContext();
            
            // Short pause to let the switch take effect
            await this.browser.pause(1000);
            
            // Verify the switch worked by executing a simple script
            await this.browser.execute(() => true);
            
            console.log(`[AppLifecycleUtil] Successfully switched to WebView context (attempt ${attempt})`);
            switchSuccess = true;
            break;
          } catch (error) {
            console.log(`[AppLifecycleUtil] Attempt ${attempt}: switchToWebContext failed: ${error}`);
            // Wait longer between retries
            await this.browser.pause(3000);
          }
        }
        
        if (!switchSuccess) {
          console.warn("[AppLifecycleUtil] Could not switch to WebView context after multiple attempts");
          return;
        }
      } else {
        // Fallback to manual context switching
        console.log("[AppLifecycleUtil] switchToWebContext not available, using manual context switch...");
        await this.manualContextSwitch();
      }
      
      // Step 4: Wait for UI5 to be ready
      await this.waitForUI5Ready();
      
      // Step 5: Reinject UI5/wdi5 bridge
      await this.reinjectUI5();
      
      // Step 6: iOS needs extra stabilization time after restart
      // The appium-remote-debugger connection needs time to fully initialize
      if (!this.isAndroid()) {
        console.log("[AppLifecycleUtil] iOS: Additional stabilization pause after reinjection...");
        await this.browser.pause(3000);
        
        // On iOS, we also need to verify execute works with a more complex script
        try {
          const testResult = await this.browser.execute(() => {
            // Test that wdi5 bridge is truly functional
            const w = window as any;
            if (!w.wdi5 || !w.bridge) {
              return { ready: false, reason: "wdi5/bridge not found" };
            }
            // Try to access sap.ui.core if available
            if (typeof w.sap !== "undefined" && w.sap.ui && w.sap.ui.getCore) {
              return { ready: true, hasUI5: true };
            }
            return { ready: true, hasUI5: false };
          });
          console.log(`[AppLifecycleUtil] iOS verification: ${JSON.stringify(testResult)}`);
        } catch (e) {
          console.log(`[AppLifecycleUtil] iOS verification failed: ${e}`);
        }
      }
      
    } catch (error) {
      console.warn(`[AppLifecycleUtil] Error restoring context: ${error}`);
    }
  }

  /**
   * Manual context switching fallback when wdi5-cordova-service commands aren't available.
   */
  private async manualContextSwitch(): Promise<void> {
    // Wait for WebView context to become available
    let webviewContext: string | null = null;
    const maxAttempts = 10;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const contexts = await this.browser.getContexts();
        console.log(`[AppLifecycleUtil] Attempt ${attempt}: Available contexts: ${JSON.stringify(contexts)}`);
        
        // Find the app's WebView context (not Terrace or other system webviews)
        for (const ctx of contexts) {
          const id = getContextId(ctx as ContextItem);
          if (id && id.toUpperCase().includes("WEBVIEW") && !id.includes("Terrace")) {
            webviewContext = id;
            break;
          }
        }
        
        if (webviewContext) {
          console.log(`[AppLifecycleUtil] Found WebView context: ${webviewContext}`);
          break;
        }
      } catch (error) {
        console.log(`[AppLifecycleUtil] Attempt ${attempt}: Error getting contexts: ${error}`);
      }
      
      await this.browser.pause(1000);
    }
    
    if (!webviewContext) {
      console.warn("[AppLifecycleUtil] Could not find WebView context");
      return;
    }
    
    // Switch to WebView context with retry and verify
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.browser.switchContext(webviewContext);
        await this.browser.pause(1000);
        
        // Verify the switch worked
        await this.browser.execute(() => true);
        console.log(`[AppLifecycleUtil] Successfully switched to WebView (attempt ${attempt})`);
        return;
      } catch (error) {
        console.log(`[AppLifecycleUtil] Attempt ${attempt}: WebView switch failed: ${error}`);
        await this.browser.pause(2000 * attempt);
      }
    }
    
    console.warn("[AppLifecycleUtil] Could not establish stable WebView connection");
  }

  /**
   * Wait for UI5/sap to be available in the current context.
   */
  private async waitForUI5Ready(timeout: number = 30000): Promise<void> {
    console.log("[AppLifecycleUtil] Waiting for UI5 to be ready...");
    try {
      await this.browser.waitUntil(
        async () => {
          const result = await this.browser.execute(() => {
            return typeof (window as any).sap !== "undefined" &&
                   typeof (window as any).sap.ui !== "undefined";
          });
          return result === true;
        },
        {
          timeout,
          timeoutMsg: "UI5 not ready after restart",
          interval: 500,
        }
      );
      console.log("[AppLifecycleUtil] UI5 is ready");
    } catch (error) {
      console.warn(`[AppLifecycleUtil] UI5 readiness check: ${error}`);
      // Non-fatal - continue anyway
    }
  }

  /**
   * Restart the app.
   * 
   * @param options Restart options
   * - mode: 
   *   - 'fresh' (default): closeApp + activateApp - preserves localStorage, shows pincode screen
   *   - 'resume': Background and activate - resumes exactly where you were
   *   - 'clean': Clear app data then activate - clears ALL data including localStorage
   */
  public async restartApp(options: RestartAppOptions = {}): Promise<void> {
    const {
      mode = "fresh",
      pauseBetween = 1000,
      appId,
    } = options;

    const resolvedAppId = appId || (await this.getAppId());

    // Store original orientation (Android changes it sometimes after restart)
    let originalOrientation = "";
    if (this.isAndroid()) {
      try {
        originalOrientation = await this.getOrientation();
      } catch {
        // Ignore
      }
    }

    try {
      switch (mode) {
        case "clean":
          // Clean restart: clear app data (clears ALL state including localStorage)
          if (this.isAndroid()) {
            try {
              await this.browser.execute("mobile: clearApp", { appId: resolvedAppId });
            } catch {
              await this.terminateApp({ appId: resolvedAppId });
            }
          } else {
            await this.terminateApp({ appId: resolvedAppId });
          }
          await this.browser.pause(pauseBetween);
          await this.activateApp({ appId: resolvedAppId });
          break;

        case "resume":
          // Resume restart: background and reactivate (keeps everything, resumes where you were)
          await this.backgroundApp(-1);
          await this.browser.pause(pauseBetween);
          await this.activateApp({ appId: resolvedAppId });
          break;

        case "fresh":
        default:
          // Fresh restart using relaunchActiveApp() - this terminates and relaunches the app
          // Works correctly on BrowserStack, preserves localStorage, shows initial screen (pincode)
          console.log(`[AppLifecycleUtil] restartApp: Starting fresh restart for ${resolvedAppId}`);
          await this.browser.relaunchActiveApp();
          console.log(`[AppLifecycleUtil] restartApp: App relaunched`);
          
          // CRITICAL: After relaunchActiveApp(), the ChromeDriver session to the WebView is invalidated.
          // We need to wait for Appium to re-establish the ChromeDriver connection to the new WebView.
          // The autoWebview capability should handle this automatically, but we need to wait.
          console.log(`[AppLifecycleUtil] restartApp: Waiting for WebView to be ready...`);
          await this.browser.pause(5000); // Give Appium time to reconnect to WebView
          
          // Restore WebView context and reinject UI5 bridge
          await this.restoreContextAfterRestart();
          console.log(`[AppLifecycleUtil] restartApp: Context restored and UI5 bridge reinjected`);
          break;
      }

      // Wait for app to stabilize (matching old implementation timing)
      await this.browser.pause(3000);

      // Restore orientation if it changed (Android bug)
      if (this.isAndroid() && originalOrientation) {
        try {
          const newOrientation = await this.getOrientation();
          if (newOrientation !== originalOrientation) {
            await this.setOrientation(originalOrientation as "PORTRAIT" | "LANDSCAPE");
          }
        } catch {
          // Ignore orientation errors
        }
      }

      // Additional stabilization pause (matching old implementation)
      await this.browser.pause(3000);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`[AppLifecycleUtil] restartApp error: ${msg}`);
      throw new AppLifecycleError("restartApp", msg);
    }
  }

  /**
   * Get the current device orientation.
   */
  public async getOrientation(): Promise<string> {
    try {
      return await this.browser.getOrientation();
    } catch {
      return "PORTRAIT"; // Default fallback
    }
  }

  /**
   * Set the device orientation.
   */
  public async setOrientation(orientation: "PORTRAIT" | "LANDSCAPE"): Promise<void> {
    try {
      await this.browser.setOrientation(orientation);
    } catch (error) {
      // Non-critical, log but don't throw
      console.warn(`[AppLifecycleUtil] Could not set orientation: ${error}`);
    }
  }

  /**
   * Restart app and restore orientation if it changed.
   * Some devices change orientation after restart.
   */
  public async restartAppWithOrientation(options: RestartAppOptions = {}): Promise<void> {
    const originalOrientation = await this.getOrientation();

    await this.restartApp(options);

    // Check and restore orientation
    const newOrientation = await this.getOrientation();
    if (newOrientation !== originalOrientation) {
      await this.setOrientation(originalOrientation as "PORTRAIT" | "LANDSCAPE");
      await this.browser.pause(500); // Brief pause for orientation change
    }
  }
}
