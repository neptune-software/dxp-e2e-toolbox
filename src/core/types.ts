/**
 * Core types for the DXP E2E Toolbox.
 */

/**
 * DXP Edition type - SAP Edition or Open Edition.
 */
export enum DxpEditionType {
  sapEdition = "sap-edition",
  openEdition = "open-edition",
}

/**
 * DXP Version string in format "major.minor.patch" (e.g., "23.10.0005").
 */
export type DxpVersion = string;

/**
 * Error handling mode for the toolbox.
 * - "exceptions": Throw typed exceptions that callers can catch and handle
 * - "assertions": Use expect() assertions that fail tests immediately
 */
export type ErrorMode = "exceptions" | "assertions";

/**
 * Configuration for the toolbox factory.
 */
export interface ToolboxConfig {
  /**
   * The DXP edition type (SAP Edition or Open Edition).
   */
  edition: DxpEditionType | "sap-edition" | "open-edition";

  /**
   * The DXP version string (e.g., "23.10.0005").
   */
  version: DxpVersion;

  /**
   * Error handling mode. Defaults to "exceptions".
   */
  errorMode?: ErrorMode;

  /**
   * WebDriverIO browser instance.
   */
  browser?: WebdriverIO.Browser;

  /**
   * wdi5 service instance.
   */
  wdi5?: unknown;
}

/**
 * Options for creating a launchpad instance.
 */
export interface LaunchpadOptions {
  /**
   * Name of the launchpad to open.
   */
  launchpadName: string;

  /**
   * Whether the launchpad is a PWA.
   */
  isPwa?: boolean;

  /**
   * SAP client number (SAP Edition only).
   */
  sapClient?: string;

  /**
   * Base URL for the launchpad.
   */
  baseUrl?: string;

  /**
   * Pincode configuration.
   */
  pincodeOptions?: PincodeOptions;
}

/**
 * Pincode configuration options.
 */
export interface PincodeOptions {
  /**
   * Whether pincode is enabled for this launchpad.
   */
  enabled?: boolean;

  /**
   * Length of the pincode (default: 4).
   */
  length?: number;
}

/**
 * Parsed version for comparison.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Screen identifiers for Neptune launchpad navigation.
 */
export enum AppCacheNavScreens {
  /** Basic logon screen */
  AppCache_boxLogon = "AppCache_boxLogon",
  /** Password change screen */
  AppCache_boxPassword = "AppCache_boxPassword",
  /** Pincode definition screen */
  AppCache_boxPasscode = "AppCache_boxPasscode",
  /** Pincode entry screen (numpad) */
  AppCache_boxPasscodeEntry = "AppCache_boxPasscodeEntry",
  /** User overview/selection screen */
  AppCache_boxUsers = "AppCache_boxUsers",
  /** Captcha screen */
  AppCache_boxCaptcha = "AppCache_boxCaptcha",
  /** Launchpad main menu */
  AppCachePageMenu = "AppCachePageMenu",
  /** JSView (app opened) */
  AppCache_JSVIEW = "AppCache_JSVIEW",
  /** Launchpad screen with tiles */
  AppCache_LAUNCHPADSCREEN = "AppCache_LAUNCHPADSCREEN",
}

/**
 * Options for getting tile data.
 */
export interface GetTileDataOptions {
  GUID?: string;
  NAME?: string;
  APPLID?: string;
}

/**
 * Options for closing a tile.
 */
export interface CloseTileConfig {
  forceClose?: boolean;
  restrictedEnable?: boolean;
  restrictedType?: string;
}

/**
 * OAuth provider types.
 */
export type OAuthProvider = "azure" | "okta" | "btp-ias";

/**
 * OAuth login options.
 */
export interface OAuthLoginOptions {
  email: string;
  password: string;
  staySignedIn?: boolean;
  rememberMe?: boolean;
}

/**
 * Window handle classification for OAuth flows.
 */
export interface WindowHandleInfo {
  mainApp?: string;
  azure?: string;
  okta?: string;
  btpIas?: string;
  unknown?: string[];
}
