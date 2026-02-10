/**
 * Selector registry for SAP Edition launchpad.
 * Contains all UI5 control IDs used in the SAP Edition.
 */

import { LaunchpadSelectors, DEFAULT_SAP_SELECTORS } from "../base/launchpad.js";

/**
 * SAP Edition selectors - uses the defaults since SAP Edition is the baseline.
 */
export const SAP_EDITION_SELECTORS: LaunchpadSelectors = {
  ...DEFAULT_SAP_SELECTORS,
};

/**
 * Version-specific selector overrides.
 * Keys are version patterns (e.g., "22", "22.10", "23").
 */
export const SAP_EDITION_VERSION_SELECTORS: Record<string, Partial<LaunchpadSelectors>> = {
  // Version 22.10.0009 and later use new username text selector
  "22.10": {
    textUsername: "launchpadSettingsHeaderText",
  },
  
  // Version 22 base (before 22.10.0009) uses legacy username text
  "22": {
    textUsername: "AppCacheUserActionText",
    textUsernameLegacy: "AppCacheUserActionText",
  },
};

/**
 * Get selectors for a specific version.
 */
export function getSelectorsForVersion(version: string): LaunchpadSelectors {
  const selectors = { ...SAP_EDITION_SELECTORS };
  
  // Parse version
  const parts = version.split(".");
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10) || 0;

  // Apply version-specific overrides
  // Check from most specific to least specific
  const versionKey = `${major}.${minor}`;
  const majorKey = `${major}`;

  if (SAP_EDITION_VERSION_SELECTORS[versionKey]) {
    Object.assign(selectors, SAP_EDITION_VERSION_SELECTORS[versionKey]);
  } else if (SAP_EDITION_VERSION_SELECTORS[majorKey]) {
    Object.assign(selectors, SAP_EDITION_VERSION_SELECTORS[majorKey]);
  }

  return selectors;
}

/**
 * AppCacheTile interface - full tile data structure from Neptune.
 */
export interface AppCacheTile {
  GUID: string;
  NAME: string;
  APPLID: string;
  ACTIVATED: boolean;
  TILE_ICON: string;
  TILE_INFO: string;
  TILE_TITLE: string;
  TILE_TYPE: string;
  TILE_NUMBER: string;
  TILE_UNIT: string;
  VISIBLE_ALL: boolean;
  URL_EXTERNAL: string;
  PARENT: string;
  SUB_MENU: boolean;
  CATEGORY: string;
  MOBILE_CLIENT: string;
  [key: string]: unknown;
}
