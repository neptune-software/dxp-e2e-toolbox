/**
 * Wait utilities for reliable test execution.
 * Prefer these over browser.pause() for faster and more reliable tests.
 */

import { Environment } from "../core/environment.js";
import { AppCacheNavScreens } from "../core/types.js";
import { TimeoutError } from "../core/errors.js";

/**
 * Default timeout values in milliseconds.
 */
export const DEFAULT_TIMEOUTS = {
  /** Short operations like button clicks */
  short: 5000,
  /** Medium operations like page transitions */
  medium: 15000,
  /** Long operations like app loading */
  long: 30000,
  /** Very long operations like initial app load on slow networks */
  veryLong: 60000,
  /** Default polling interval */
  interval: 200,
} as const;

/**
 * Options for wait operations.
 */
export interface WaitOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Polling interval in milliseconds */
  interval?: number;
  /** Custom timeout message */
  timeoutMsg?: string;
  /** Whether to throw on timeout (default: true) */
  throwOnTimeout?: boolean;
}

/**
 * Get the browser instance from Environment.
 */
function getBrowser(): WebdriverIO.Browser {
  return Environment.getInstance().browser;
}

/**
 * Wait until Neptune is fully ready (neptune.ui5Ready && neptune.deviceReady).
 */
export async function waitForNeptuneReady(options: WaitOptions = {}): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.long,
    interval = DEFAULT_TIMEOUTS.interval,
    timeoutMsg = "Neptune page did not become ready",
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    await browser.waitUntil(
      async () => {
        try {
          const script = "return !!(typeof neptune !== 'undefined' && neptune.ui5Ready && neptune.deviceReady)";
          return await browser.execute(script);
        } catch {
          return false;
        }
      },
      { timeout, interval, timeoutMsg }
    );
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError("waitForNeptuneReady", timeout);
    }
    return false;
  }
}

/**
 * Wait until UI5 is ready.
 */
export async function waitForUI5Ready(options: WaitOptions = {}): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.medium,
    interval = DEFAULT_TIMEOUTS.interval,
    timeoutMsg = "UI5 did not become ready",
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    await browser.waitUntil(
      async () => {
        try {
          const script = "return !!(typeof sap !== 'undefined' && sap.ui && sap.ui.getCore && sap.ui.getCore().isInitialized())";
          return await browser.execute(script);
        } catch {
          return false;
        }
      },
      { timeout, interval, timeoutMsg }
    );
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError("waitForUI5Ready", timeout);
    }
    return false;
  }
}

/**
 * Wait for a specific screen to be displayed.
 */
export async function waitForScreen(
  screenId: AppCacheNavScreens | string,
  options: WaitOptions = {}
): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.medium,
    interval = DEFAULT_TIMEOUTS.interval,
    timeoutMsg = `Screen "${screenId}" did not appear`,
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    await browser.waitUntil(
      async () => {
        try {
          const script = `
            return (function() {
              var el = document.querySelector('.sapMNavContainer [id="${screenId}"]');
              if (!el) return false;
              var style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            })();
          `;
          return await browser.execute(script);
        } catch {
          return false;
        }
      },
      { timeout, interval, timeoutMsg }
    );
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError(`waitForScreen(${screenId})`, timeout);
    }
    return false;
  }
}

/**
 * Wait for an element to be displayed.
 */
export async function waitForElement(
  selector: string,
  options: WaitOptions = {}
): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.medium,
    interval = DEFAULT_TIMEOUTS.interval,
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    const element = await browser.$(selector);
    await element.waitForDisplayed({ timeout, interval });
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError(`waitForElement(${selector})`, timeout);
    }
    return false;
  }
}

/**
 * Wait for an element to be clickable.
 */
export async function waitForElementClickable(
  selector: string,
  options: WaitOptions = {}
): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.medium,
    interval = DEFAULT_TIMEOUTS.interval,
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    const element = await browser.$(selector);
    await element.waitForClickable({ timeout, interval });
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError(`waitForElementClickable(${selector})`, timeout);
    }
    return false;
  }
}

/**
 * Wait for a tile to exist in the launchpad.
 */
export async function waitForTileToExist(
  guid: string,
  options: WaitOptions = {}
): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.medium,
    interval = DEFAULT_TIMEOUTS.interval,
    timeoutMsg = `Tile "${guid}" did not appear`,
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    await browser.waitUntil(
      async () => {
        try {
          const script = `
            return (function() {
              if (typeof ModelData === 'undefined') return false;
              var tilesControl = sap.ui.getCore().byId("AppCacheTiles");
              if (!tilesControl) return false;
              var tile = ModelData.FindFirst(tilesControl, "GUID", "${guid}");
              return !!tile;
            })();
          `;
          return await browser.execute(script);
        } catch {
          return false;
        }
      },
      { timeout, interval, timeoutMsg }
    );
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError(`waitForTileToExist(${guid})`, timeout);
    }
    return false;
  }
}

/**
 * Wait for a condition with custom check function.
 */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<boolean> {
  const {
    timeout = DEFAULT_TIMEOUTS.medium,
    interval = DEFAULT_TIMEOUTS.interval,
    timeoutMsg = "Condition was not met",
    throwOnTimeout = true,
  } = options;

  const browser = getBrowser();

  try {
    await browser.waitUntil(condition, { timeout, interval, timeoutMsg });
    return true;
  } catch (error) {
    if (throwOnTimeout) {
      throw new TimeoutError("waitUntil", timeout);
    }
    return false;
  }
}

/**
 * Wait for the launchpad screen to be displayed (with tiles).
 */
export async function waitForLaunchpadScreen(options: WaitOptions = {}): Promise<boolean> {
  return waitForScreen(AppCacheNavScreens.AppCache_LAUNCHPADSCREEN, {
    timeoutMsg: "Launchpad screen did not appear",
    ...options,
  });
}

/**
 * Wait for the login screen to be displayed.
 */
export async function waitForLoginScreen(options: WaitOptions = {}): Promise<boolean> {
  return waitForScreen(AppCacheNavScreens.AppCache_boxLogon, {
    timeoutMsg: "Login screen did not appear",
    ...options,
  });
}

/**
 * Wait for the pincode entry screen to be displayed.
 */
export async function waitForPincodeEntryScreen(options: WaitOptions = {}): Promise<boolean> {
  return waitForScreen(AppCacheNavScreens.AppCache_boxPasscodeEntry, {
    timeoutMsg: "Pincode entry screen did not appear",
    ...options,
  });
}

/**
 * Wait for the pincode setup screen to be displayed.
 */
export async function waitForPincodeSetupScreen(options: WaitOptions = {}): Promise<boolean> {
  return waitForScreen(AppCacheNavScreens.AppCache_boxPasscode, {
    timeoutMsg: "Pincode setup screen did not appear",
    ...options,
  });
}

/**
 * Wait for the user selection screen to be displayed.
 */
export async function waitForUserSelectionScreen(options: WaitOptions = {}): Promise<boolean> {
  return waitForScreen(AppCacheNavScreens.AppCache_boxUsers, {
    timeoutMsg: "User selection screen did not appear",
    ...options,
  });
}

/**
 * Smart wait that tries to detect the current screen state.
 * Returns the detected screen or null if unable to determine.
 */
export async function detectCurrentScreen(
  _options: WaitOptions = {}
): Promise<AppCacheNavScreens | null> {
  const browser = getBrowser();

  const screens = Object.values(AppCacheNavScreens);
  
  for (const screen of screens) {
    try {
      const script = `
        return (function() {
          var el = document.querySelector('[id="${screen}"]');
          if (!el) return false;
          var style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })();
      `;
      const isVisible = await browser.execute(script);
      if (isVisible) {
        return screen;
      }
    } catch {
      // Continue checking other screens
    }
  }

  return null;
}
