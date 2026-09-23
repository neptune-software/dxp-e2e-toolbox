/**
 * Base Launchpad class with fluent API for common launchpad operations.
 * This is the main class that SAP Edition and Open Edition launchpads extend.
 */

import { Page } from "./page.js";
import { BaseTile, TileData, TileOptions } from "./tile.js";
import { Environment } from "../core/environment.js";
import {
  AppCacheNavScreens,
  CloseTileConfig,
  GetTileDataOptions,
  LaunchpadOptions,
  PincodeOptions,
} from "../core/types.js";
import {
  ScreenNotFoundError,
  TileNotFoundError,
  UserOperationError,
} from "../core/errors.js";
import {
  waitForLaunchpadScreen,
  waitForNeptuneReady,
  DEFAULT_TIMEOUTS,
} from "../helpers/wait-utils.js";
import type { wdi5ControlSelector } from "wdio-ui5-service";

/** Selector shape used by asControl (controlType from OPA5/ControlsBaseSelector). */
type ListItemSelector = wdi5ControlSelector & { controlType?: string };

/**
 * Selector IDs for SAP Edition launchpad.
 * Override these in edition-specific subclasses.
 */
export interface LaunchpadSelectors {
  // Login screen
  inputUsername: string;
  inputPassword: string;
  buttonLogin: string;
  messageLogon: string;

  // Password change screen
  messagePassword: string;

  // Pincode setup screen
  inputPasscode1: string;
  inputPasscode2: string;
  buttonSetPasscode: string;
  messagePasscode: string;

  // Pincode entry (numpad) screen
  numpadButtonPrefix: string;
  buttonNumpadUserNew: string;

  // User menu
  buttonUserMenu: string;
  buttonCloseUserMenu: string;
  buttonAddUser: string;
  buttonLock: string;
  buttonSwitchUser: string;
  buttonSwitchUserAlt: string;
  textUsername: string;
  textUsernameLegacy: string;

  // User list
  userListAncestorId: string;
}

/**
 * Default selectors for SAP Edition.
 * Open Edition may override these.
 */
export const DEFAULT_SAP_SELECTORS: LaunchpadSelectors = {
  // Login screen
  inputUsername: "AppCache_inUsername",
  inputPassword: "AppCache_inPassword",
  buttonLogin: "AppCache_butLogon",
  messageLogon: "messageLogon",

  // Password change screen
  messagePassword: "messagePassword",

  // Pincode setup screen
  inputPasscode1: "AppCache_inPasscode1",
  inputPasscode2: "AppCache_inPasscode2",
  buttonSetPasscode: "AppCache_butPasscode",
  messagePasscode: "messagePasscode",

  // Pincode entry (numpad) screen
  numpadButtonPrefix: "butNumpad",
  buttonNumpadUserNew: "butNumpadUserNew",

  // User menu
  buttonUserMenu: "AppCacheShellUser",
  buttonCloseUserMenu: "launchpadSettingsBtn",
  buttonAddUser: "butAddUser",
  buttonLock: "AppCacheUserActionLock",
  buttonSwitchUser: "AppCacheUserActionSwitch",
  buttonSwitchUserAlt: "AppCacheUserActionXSwitch",
  textUsername: "launchpadSettingsHeaderText",
  textUsernameLegacy: "AppCacheUserActionText",

  // User list
  userListAncestorId: "AppCacheUsers",
};

/**
 * Base Launchpad class providing common functionality for all editions.
 * Implements fluent API pattern - most methods return `Promise<this>`.
 */
export class BaseLaunchpad extends Page {
  /**
   * Name of the launchpad.
   */
  public launchpadName: string = "";

  /**
   * Whether this is a PWA launchpad.
   */
  public isPwa: boolean = false;

  /**
   * SAP client number (SAP Edition only).
   */
  public sapClient?: string;

  /**
   * Base URL for the launchpad.
   */
  public baseUrl?: string;

  /**
   * Pincode configuration.
   */
  public pincodeOptions?: PincodeOptions;

  /**
   * Selector IDs - can be overridden by subclasses.
   */
  protected selectors: LaunchpadSelectors = DEFAULT_SAP_SELECTORS;

  /**
   * Whether the user menu is currently open.
   */
  private userMenuOpened: boolean = false;

  /**
   * Initialize the launchpad with options.
   * Called by the factory after creation.
   */
  public async initialize(options: LaunchpadOptions): Promise<this> {
    this.launchpadName = options.launchpadName;
    this.isPwa = options.isPwa ?? false;
    this.sapClient = options.sapClient;
    this.baseUrl = options.baseUrl;
    this.pincodeOptions = options.pincodeOptions;
    return this;
  }

  // ============================================
  // UI5 Control Getters
  // ============================================

  /**
   * Get a UI5 control by selector ID.
   * Uses wdio-ui5-service's asControl method.
   */
  protected async getControl<T>(id: string, forceSelect = false): Promise<T> {
    return this.browser.asControl({
      forceSelect,
      selector: { id },
    }) as Promise<T>;
  }

  /**
   * iOS: press a UI5 control with a sync execute. wdi5 firePress runs
   * waitForUI5 inside an async execute; Neptune ios-xhr never goes idle,
   * so the call hangs 60s and leaves waitAsync locked.
   */
  protected async pressByIdSync(controlId: string): Promise<void> {
    const how = await this.browser.execute(function (id: string) {
      // Cordova / ASWeb plugins bind to a real DOM click, not UI5 firePress.
      let ui5 = false;
      try {
        const sap = (window as any).sap;
        const ctl = sap?.ui?.getCore?.().byId(id);
        if (ctl && typeof ctl.firePress === "function") {
          ctl.firePress();
          ui5 = true;
          const ref = typeof ctl.getDomRef === "function" ? ctl.getDomRef() : null;
          if (ref && typeof ref.click === "function") {
            ref.click();
            return "ui5+dom";
          }
        }
      } catch {
        /* DOM fallback */
      }
      const el = document.getElementById(id);
      if (el) {
        el.click();
        return ui5 ? "ui5+dom" : "dom";
      }
      return ui5 ? "ui5" : "";
    }, controlId);
    if (!how) {
      throw new Error(`iOS sync press: control not found: ${controlId}`);
    }
    console.log(`[Launchpad] iOS sync press ${controlId} via ${how}`);
  }

  /** iOS: set an Input value without wdi5 enterText / waitForUI5. */
  protected async setByIdSync(controlId: string, value: string): Promise<void> {
    const how = await this.browser.execute(
      function (id: string, val: string) {
        try {
          const sap = (window as any).sap;
          const ctl = sap?.ui?.getCore?.().byId(id);
          if (ctl && typeof ctl.setValue === "function") {
            ctl.setValue(val);
            if (typeof ctl.fireChange === "function") {
              ctl.fireChange({ value: val });
            }
            return "ui5";
          }
        } catch {
          /* DOM fallback */
        }
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return "dom";
        }
        return "";
      },
      controlId,
      value,
    );
    if (!how) {
      throw new Error(`iOS sync setValue: control not found: ${controlId}`);
    }
    console.log(`[Launchpad] iOS sync setValue ${controlId} via ${how}`);
  }

  /** iOS: read control text without wdi5 getText / waitForUI5. */
  protected async getTextByIdSync(controlId: string): Promise<string | null> {
    const text = await this.browser.execute(function (id: string) {
      try {
        const sap = (window as any).sap;
        const ctl = sap?.ui?.getCore?.().byId(id);
        if (ctl && typeof ctl.getText === "function") {
          return ctl.getText();
        }
      } catch {
        /* DOM fallback */
      }
      const el = document.getElementById(id);
      return el?.textContent ?? "";
    }, controlId);
    const s = text ? String(text).trim() : "";
    return s || null;
  }

  /**
   * Resilient button press that works across platforms.
   * iOS uses sync firePress/click. Android uses wdi5 firePress then native click.
   */
  protected async pressControl(control: any): Promise<void> {
    if (this.browser.isIOS) {
      const cachedId = control?._controlInfo?.id;
      if (cachedId) {
        await this.pressByIdSync(cachedId);
        return;
      }
    }

    // First, try the standard wdi5 firePress
    try {
      if (typeof control.firePress === "function") {
        await control.firePress();
        return;
      }
    } catch (firePressError: any) {
      console.log(`[Launchpad] firePress failed: ${firePressError.message}, trying native click fallback...`);
    }

    // Fallback: Use the underlying WebElement's click
    try {
      // wdi5 controls have a getWebElement() method or _webElement property
      let webElement: WebdriverIO.Element | null = null;
      
      if (typeof control.getWebElement === "function") {
        webElement = await control.getWebElement();
      } else if (control._webElement) {
        webElement = control._webElement;
      }
      
      if (webElement && typeof webElement.click === "function") {
        console.log("[Launchpad] Using native WebElement click fallback");
        await webElement.click();
        return;
      }
    } catch (webElementError: any) {
      console.log(`[Launchpad] WebElement click failed: ${webElementError.message}`);
    }

    // Final fallback: Try to press using browser.asControl with forceSelect and press
    try {
      // If control has an ID, re-fetch and try press
      const controlId = control._controlInfo?.id || control.getId?.();
      if (controlId) {
        console.log(`[Launchpad] Re-fetching control ${controlId} with forceSelect for press`);
        const freshControl = await this.browser.asControl({
          forceSelect: true,
          selector: { id: controlId },
        });
        if (typeof freshControl.press === "function") {
          await freshControl.press();
          return;
        }
        if (typeof freshControl.firePress === "function") {
          await freshControl.firePress();
          return;
        }
      }
    } catch (refetchError: any) {
      console.log(`[Launchpad] Re-fetch press failed: ${refetchError.message}`);
    }

    throw new Error("Could not press control: all methods failed (firePress, native click, re-fetch press)");
  }

  /**
   * Get the username input control.
   */
  public async getInputUsername(forceSelect = false): Promise<unknown> {
    return this.getControl(this.selectors.inputUsername, forceSelect);
  }

  /**
   * Get the password input control.
   */
  public async getInputPassword(forceSelect = false): Promise<unknown> {
    return this.getControl(this.selectors.inputPassword, forceSelect);
  }

  /**
   * Get the login button control.
   */
  public async getButtonLogin(forceSelect = false): Promise<unknown> {
    return this.getControl(this.selectors.buttonLogin, forceSelect);
  }

  /**
   * Get the login error message control.
   */
  public async getMessageLogon(forceSelect = false): Promise<unknown> {
    return this.getControl(this.selectors.messageLogon, forceSelect);
  }

  /**
   * Get a numpad button by digit.
   */
  public async getNumpadButton(digit: number, forceSelect = false): Promise<unknown> {
    const id = `${this.selectors.numpadButtonPrefix}${digit}`;
    return this.getControl(id, forceSelect);
  }

  // ============================================
  // Screen Detection
  // ============================================

  /**
   * Get the current screen/page ID.
   */
  public async getCurrentScreen(): Promise<AppCacheNavScreens | undefined> {
    try {
      let screenId = await this.browser.execute(`
        if (typeof AppCacheNav !== "undefined" && AppCacheNav.getCurrentPage()) {
          return AppCacheNav.getCurrentPage().sId;
        }
        return '';
      `) as string;

      if (screenId) {
        // Normalize screen IDs
        if (
          screenId.indexOf("__nepScreen") > -1 ||
          screenId.indexOf("page") === 0 ||
          screenId === AppCacheNavScreens.AppCachePageMenu
        ) {
          return AppCacheNavScreens.AppCache_LAUNCHPADSCREEN;
        } else if (screenId.indexOf("__jsview") > -1) {
          return AppCacheNavScreens.AppCache_JSVIEW;
        }
        return screenId as AppCacheNavScreens;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Wait for a specific screen to be displayed.
   */
  public async waitForScreen(
    screen: AppCacheNavScreens,
    timeout = DEFAULT_TIMEOUTS.medium
  ): Promise<this> {
    try {
      await this.browser.waitUntil(
        async () => {
          const current = await this.getCurrentScreen();
          return current === screen;
        },
        {
          timeout,
          interval: 200,
          timeoutMsg: `Expected screen "${screen}" but it did not appear`,
        }
      );
    } catch {
      const current = await this.getCurrentScreen().catch(() => undefined);
      throw new Error(
        `Expected screen "${screen}" but it did not appear (current: ${current ?? "undefined"})`,
      );
    }
    return this;
  }

  /**
   * Assert we're on a specific screen, throwing or using expect based on error mode.
   */
  protected async assertScreen(expected: AppCacheNavScreens): Promise<void> {
    const actual = await this.getCurrentScreen();
    
    if (Environment.getInstance().useAssertions()) {
      expect(actual).toBe(expected);
    } else if (actual !== expected) {
      throw new ScreenNotFoundError(expected, actual ?? "unknown");
    }
  }

  // ============================================
  // Authentication (Fluent API)
  // ============================================

  /**
   * Perform login with username and password.
   * Expects to be on the login screen (AppCache_boxLogon).
   * 
   * @example
   * ```typescript
   * await launchpad.login("USER", "PASSWORD");
   * ```
   */
  public async login(username: string, password: string): Promise<this> {
    await this.assertScreen(AppCacheNavScreens.AppCache_boxLogon);

    if (this.browser.isIOS) {
      await this.setByIdSync(this.selectors.inputUsername, username);
      await this.setByIdSync(this.selectors.inputPassword, password);
      await this.clickLogin();
      return this;
    }

    const usernameInput = await this.getInputUsername(true) as { enterText: (text: string) => Promise<void> };
    await usernameInput.enterText(username);

    const passwordInput = await this.getInputPassword(true) as { enterText: (text: string) => Promise<void> };
    await passwordInput.enterText(password);

    await this.clickLogin();
    return this;
  }

  /**
   * Click the login button.
   */
  public async clickLogin(): Promise<this> {
    if (this.browser.isIOS) {
      await this.pressByIdSync(this.selectors.buttonLogin);
      return this;
    }
    const loginButton = await this.getButtonLogin(true);
    await this.browser.pause(500);
    await this.pressControl(loginButton);
    return this;
  }

  /**
   * Get the login error message text.
   */
  public async getLoginErrorMessage(): Promise<string | null> {
    if (this.browser.isIOS) {
      for (let i = 0; i < 8; i++) {
        const text = await this.getTextByIdSync(this.selectors.messageLogon);
        if (text) return text;
        const visible = await this.browser.execute(function () {
          const body = document.body?.innerText || "";
          return body.slice(0, 500);
        }).catch(() => "");
        if (i === 3) {
          console.log(`[Launchpad] iOS logon visible text while waiting for error: ${visible}`);
        }
        await this.browser.pause(500);
      }
      return await this.getTextByIdSync(this.selectors.messageLogon);
    }
    try {
      const messageControl = await this.getMessageLogon(true) as { getText: () => Promise<string> };
      return await messageControl.getText();
    } catch {
      return null;
    }
  }

  // ============================================
  // Pincode Operations (Fluent API)
  // ============================================

  /**
   * Set the pincode after initial login.
   * Expects to be on the pincode setup screen (AppCache_boxPasscode).
   * 
   * @example
   * ```typescript
   * await launchpad.login(user, pass).setPincode("1111");
   * ```
   */
  public async setPincode(pincode: string, confirmPincode?: string): Promise<this> {
    await this.waitForScreen(AppCacheNavScreens.AppCache_boxPasscode);

    const confirm = confirmPincode ?? pincode;
    if (this.browser.isIOS) {
      await this.setByIdSync(this.selectors.inputPasscode1, pincode);
      await this.setByIdSync(this.selectors.inputPasscode2, confirm);
      await this.pressByIdSync(this.selectors.buttonSetPasscode);
      return this;
    }

    const passcode1 = await this.getControl(this.selectors.inputPasscode1, true) as { enterText: (text: string) => Promise<void> };
    await passcode1.enterText(pincode);

    const passcode2 = await this.getControl(this.selectors.inputPasscode2, true) as { enterText: (text: string) => Promise<void> };
    await passcode2.enterText(confirm);

    const setButton = await this.getControl(this.selectors.buttonSetPasscode, true);
    await this.pressControl(setButton);

    return this;
  }

  /**
   * Enter pincode on the numpad screen.
   * Expects to be on the pincode entry screen (AppCache_boxPasscodeEntry).
   * 
   * @example
   * ```typescript
   * await launchpad.enterPincode("1111");
   * ```
   */
  public async enterPincode(pincode: string): Promise<this> {
    await this.waitForScreen(AppCacheNavScreens.AppCache_boxPasscodeEntry);

    const digits = Array.from(String(pincode), Number);
    for (const digit of digits) {
      if (this.browser.isIOS) {
        await this.pressByIdSync(`${this.selectors.numpadButtonPrefix}${digit}`);
      } else {
        const button = await this.getNumpadButton(digit, true);
        await this.pressControl(button);
      }
      await this.browser.pause(50);
    }

    return this;
  }

  /**
   * Get the pincode error message.
   */
  public async getPincodeErrorMessage(): Promise<string | null> {
    try {
      const messageControl = await this.getControl(this.selectors.messagePasscode, true) as { getText: () => Promise<string> };
      return await messageControl.getText();
    } catch {
      return null;
    }
  }

  // ============================================
  // Tile Operations
  // ============================================

  /**
   * Get tile data by GUID, NAME, or APPLID.
   */
  public async getTileData(options: GetTileDataOptions): Promise<TileData> {
    let script: string;
    let identifier: string;
    let identifierType: "GUID" | "NAME" | "APPLID";

    if (options.GUID) {
      script = `return ModelData.FindFirst(AppCacheTiles, "GUID", '${options.GUID}');`;
      identifier = options.GUID;
      identifierType = "GUID";
    } else if (options.NAME) {
      script = `return ModelData.FindFirst(AppCacheTiles, "NAME", '${options.NAME}');`;
      identifier = options.NAME;
      identifierType = "NAME";
    } else if (options.APPLID) {
      script = `return ModelData.FindFirst(AppCacheTiles, "APPLID", '${options.APPLID}');`;
      identifier = options.APPLID!;
      identifierType = "APPLID";
    } else {
      throw new Error("Must provide GUID, NAME, or APPLID");
    }

    const tileData = await this.browser.execute(script) as TileData | null;

    if (!tileData || !tileData.GUID) {
      if (Environment.getInstance().useAssertions()) {
        expect(tileData).toBeDefined();
        expect(tileData?.GUID).toBeDefined();
      }
      throw new TileNotFoundError(identifier, identifierType);
    }

    return tileData;
  }

  /**
   * Check if a tile exists.
   */
  public async tileExists(options: GetTileDataOptions): Promise<boolean> {
    try {
      await this.getTileData(options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open a tile by GUID.
   * Returns a Tile instance for further operations.
   * 
   * @example
   * ```typescript
   * const tile = await launchpad.openTile("MY_TILE_GUID");
   * // ... do something with the tile
   * await tile.close();
   * ```
   */
  public async openTile(guidOrOptions: string | GetTileDataOptions): Promise<BaseTile> {
    const options: GetTileDataOptions = typeof guidOrOptions === "string"
      ? { GUID: guidOrOptions }
      : guidOrOptions;

    // Wait for launchpad screen
    await waitForLaunchpadScreen({ timeout: DEFAULT_TIMEOUTS.medium, throwOnTimeout: false });

    const tileData = await this.getTileData(options);
    
    // Open the tile
    const openScript = `sap.n.Launchpad.HandleTilePress(arguments[0]);`;
    await this.browser.execute(openScript, tileData);

    // Create and return tile instance
    const tile = await this.createTileInstance({ launchpad: this, tileData });
    tile.isOpened = true;

    return tile;
  }

  /**
   * Close a tile by GUID.
   */
  public async closeTile(guidOrOptions: string | GetTileDataOptions): Promise<this> {
    const options: GetTileDataOptions = typeof guidOrOptions === "string"
      ? { GUID: guidOrOptions }
      : guidOrOptions;

    const tileData = await this.getTileData(options);
    await this.closeTileByData(tileData);
    return this;
  }

  /**
   * Close a tile using its data.
   */
  public async closeTileByData(tileData: TileData, config?: CloseTileConfig): Promise<this> {
    const closeScript = `sap.n.Shell.closeTile(arguments[0], arguments[1]);`;
    await this.browser.execute(closeScript, tileData, config ?? {});
    return this;
  }

  /**
   * Create a Tile instance. Can be overridden by subclasses for edition-specific tiles.
   */
  protected async createTileInstance(options: TileOptions): Promise<BaseTile> {
    return new BaseTile(options);
  }

  // ============================================
  // User Menu Operations (Fluent API)
  // ============================================

  /**
   * Open the user menu.
   */
  public async openUserMenu(): Promise<this> {
    if (!this.userMenuOpened) {
      if (this.browser.isIOS) {
        await this.pressByIdSync(this.selectors.buttonUserMenu);
      } else {
        const userButton = await this.getControl(this.selectors.buttonUserMenu, true);
        await this.pressControl(userButton);
      }
      this.userMenuOpened = true;
      await this.browser.pause(300);
    }
    return this;
  }

  /**
   * Close the user menu.
   */
  public async closeUserMenu(): Promise<this> {
    if (this.userMenuOpened) {
      if (this.browser.isIOS) {
        await this.pressByIdSync(this.selectors.buttonCloseUserMenu);
      } else {
        const closeButton = await this.getControl(this.selectors.buttonCloseUserMenu, true);
        await this.pressControl(closeButton);
      }
      this.userMenuOpened = false;
    }
    return this;
  }

  /**
   * Toggle the user menu.
   */
  public async toggleUserMenu(): Promise<this> {
    if (this.userMenuOpened) {
      await this.closeUserMenu();
    } else {
      await this.openUserMenu();
    }
    return this;
  }

  /**
   * Get the current username from the user menu.
   */
  public async getCurrentUsername(): Promise<string | null> {
    await this.openUserMenu();

    try {
      // Try new selector first (22.10.0009+)
      const usernameText = await this.getControl(this.selectors.textUsername, true) as { getText: () => Promise<string> };
      return await usernameText.getText();
    } catch {
      try {
        // Fall back to legacy selector
        const usernameText = await this.getControl(this.selectors.textUsernameLegacy, true) as { getText: () => Promise<string> };
        return await usernameText.getText();
      } catch {
        return null;
      }
    }
  }

  /**
   * Lock the screen (returns to pincode entry).
   */
  public async lock(): Promise<this> {
    await this.openUserMenu();
    const lockButton = await this.getControl(this.selectors.buttonLock, true);
    await this.pressControl(lockButton);
    this.userMenuOpened = false;
    return this;
  }

  /**
   * Add another user.
   * 
   * This method handles different scenarios:
   * - From pincode entry screen (after app restart): Uses butNumpadUserNew button
   * - From users list screen: Uses butAddUser button
   * - From launchpad screen: Opens user menu and navigates to add user
   */
  public async addAnotherUser(): Promise<this> {
    const currentScreen = await this.getCurrentScreen();
    console.log(`[Launchpad] addAnotherUser: current screen = ${currentScreen}`);
    
    // Don't try to add user from login screen
    if (currentScreen === AppCacheNavScreens.AppCache_boxLogon) {
      throw new UserOperationError("addAnotherUser", "Cannot add user from login screen");
    }

    let addUserButton: { firePress: () => Promise<void> } | null = null;

    // If on pincode entry screen (after app restart), the numpad "new user" button is available
    if (currentScreen === AppCacheNavScreens.AppCache_boxPasscodeEntry) {
      console.log(`[Launchpad] addAnotherUser: On pincode entry screen, looking for ${this.selectors.buttonNumpadUserNew}`);
      try {
        addUserButton = await this.getControl(this.selectors.buttonNumpadUserNew, true) as { firePress: () => Promise<void> };
        console.log(`[Launchpad] addAnotherUser: Found numpad user new button`);
      } catch (e) {
        console.log(`[Launchpad] addAnotherUser: Could not find numpad user new button: ${e}`);
      }
    }

    // If on users list screen, the add user button is directly available
    if (!addUserButton && currentScreen === AppCacheNavScreens.AppCache_boxUsers) {
      console.log(`[Launchpad] addAnotherUser: On users screen, looking for ${this.selectors.buttonAddUser}`);
      try {
        addUserButton = await this.getControl(this.selectors.buttonAddUser, true) as { firePress: () => Promise<void> };
        console.log(`[Launchpad] addAnotherUser: Found add user button on users screen`);
      } catch {
        // Not found
      }
    }

    // Try direct add user button (might be on screen already)
    if (!addUserButton) {
      try {
        addUserButton = await this.getControl(this.selectors.buttonAddUser, true) as { firePress: () => Promise<void> };
        console.log(`[Launchpad] addAnotherUser: Found direct add user button`);
      } catch {
        // Not found, try other methods
      }
    }

    // Try numpad user new button (fallback if not on pincode screen but button exists)
    if (!addUserButton) {
      try {
        addUserButton = await this.getControl(this.selectors.buttonNumpadUserNew, true) as { firePress: () => Promise<void> };
        console.log(`[Launchpad] addAnotherUser: Found numpad user new button (fallback)`);
      } catch {
        // Not found
      }
    }

    // Try via lock action
    if (!addUserButton) {
      try {
        console.log(`[Launchpad] addAnotherUser: Trying via lock action`);
        await this.openUserMenu();
        const lockButton = await this.getControl(this.selectors.buttonLock, true);
        await this.pressControl(lockButton);
        this.userMenuOpened = false;
        await this.browser.pause(500);
        addUserButton = await this.getControl(this.selectors.buttonAddUser, true);
      } catch {
        // Not found
      }
    }

    // Try via switch user action
    if (!addUserButton) {
      try {
        console.log(`[Launchpad] addAnotherUser: Trying via switch user action`);
        await this.openUserMenu();
        const switchButton = await this.getControl(this.selectors.buttonSwitchUser, true);
        await this.pressControl(switchButton);
        this.userMenuOpened = false;
        await this.browser.pause(500);
        addUserButton = await this.getControl(this.selectors.buttonAddUser, true);
      } catch {
        // Try alternative switch button
        try {
          await this.openUserMenu();
          const switchButton = await this.getControl(this.selectors.buttonSwitchUserAlt, true);
          await this.pressControl(switchButton);
          this.userMenuOpened = false;
          await this.browser.pause(500);
          addUserButton = await this.getControl(this.selectors.buttonAddUser, true);
        } catch {
          // Not found
        }
      }
    }

    if (!addUserButton) {
      console.error(`[Launchpad] addAnotherUser: Could not find any add user button. Current screen: ${currentScreen}`);
      if (Environment.getInstance().useAssertions()) {
        expect(addUserButton).not.toBeNull();
      }
      throw new UserOperationError("addAnotherUser", `Could not find add user button. Current screen: ${currentScreen}`);
    }

    // Use resilient press that falls back to native click on iOS after restart
    await this.pressControl(addUserButton);
    this.userMenuOpened = false;

    return this;
  }

  /**
   * Select a user from the user list.
   */
  public async selectUser(row: number): Promise<this> {
    await this.waitForScreen(AppCacheNavScreens.AppCache_boxUsers);

    const selector: ListItemSelector = {
      controlType: "sap.m.CustomListItem",
      bindingPath: { path: `/${row}` },
      ancestor: { id: this.selectors.userListAncestorId },
    };
    const userItem = await this.browser.asControl({
      forceSelect: true,
      selector,
    });

    await this.pressControl(userItem);
    return this;
  }

  // ============================================
  // Navigation
  // ============================================

  /**
   * Wait for the launchpad to be ready with tiles visible.
   */
  public async waitForLaunchpadReady(): Promise<this> {
    await waitForNeptuneReady();
    await waitForLaunchpadScreen();
    return this;
  }

  /**
   * Navigate to the launchpad URL.
   * Override in subclasses for edition-specific URL building.
   */
  public async navigateToLaunchpad(): Promise<this> {
    // This should be overridden by edition-specific implementations
    throw new Error("navigateToLaunchpad must be implemented by subclass");
  }
}
