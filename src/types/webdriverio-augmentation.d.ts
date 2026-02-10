/**
 * Minimal augmentation for WebdriverIO when using Appium + wdi5.
 *
 * Official types come from:
 * - webdriverio → Appium protocol (terminateApp, activateApp, getCurrentPackage, etc.) + SessionFlags (isAndroid, isIOS)
 * - @wdio/types → Capabilities (Appium, BrowserStack, etc.)
 * - wdio-ui5-service → add to tsconfig "types" so the service augments WebdriverIO.Browser with asControl, getUI5Version, goTo, fe, etc. (see wdio-ui5-service/dist/esm/types/browser-commands.d.ts)
 *
 * This file only adds what the above do not declare:
 * - Capabilities.bundleId (resolved session sometimes has unprefixed bundleId)
 * - Browser.injectUI5 (wdio-ui5-service adds it at runtime but does not declare it in their Browser augmentation; we add it here for type safety)
 */

/// <reference types="webdriverio" />

declare global {
  namespace WebdriverIO {
    interface Capabilities {
      /** iOS bundle id (sometimes present on resolved capabilities without appium: prefix). */
      bundleId?: string;
    }
    interface Browser {
      /** Reinject UI5/wdi5 bridge (provided by wdio-ui5-service at runtime). */
      injectUI5?(): Promise<void>;
    }
  }

  /** Augmentation for browser execute() context (Neptune, wdi5, UI5). */
  interface Window {
    neptune?: { Splash?: { isActive(): boolean } };
    //@ts-ignore
    wdi5?: unknown;
    sap?: {
      ui?: {
        version?: string;
        getCore?(): { isInitialized(): boolean };
      };
    };
  }
}

export {};
