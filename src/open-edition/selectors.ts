/**
 * Selector registry for Open Edition launchpad.
 * Contains all UI5 control IDs used in the Open Edition.
 */

import { LaunchpadSelectors } from "../base/launchpad.js";

/**
 * Open Edition selectors - different from SAP Edition in several places.
 */
export const OPEN_EDITION_SELECTORS: LaunchpadSelectors = {
  // Login screen - different from SAP Edition
  inputUsername: "inLoginName",
  inputPassword: "inLoginPassword",
  buttonLogin: "butLogin",
  messageLogon: "messageLogon",

  // Password change screen
  messagePassword: "messagePassword",

  // Pincode setup screen - same as SAP Edition
  inputPasscode1: "AppCache_inPasscode1",
  inputPasscode2: "AppCache_inPasscode2",
  buttonSetPasscode: "AppCache_butPasscode",
  messagePasscode: "messagePasscode",

  // Pincode entry (numpad) screen - same as SAP Edition
  numpadButtonPrefix: "butNumpad",
  buttonNumpadUserNew: "butNumpadUserNew",

  // User menu - same structure as SAP Edition
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
 * Version-specific selector overrides for Open Edition.
 */
export const OPEN_EDITION_VERSION_SELECTORS: Record<string, Partial<LaunchpadSelectors>> = {
  // Add version-specific overrides as needed
};

/**
 * Get selectors for a specific Open Edition version.
 */
export function getOpenEditionSelectorsForVersion(version: string): LaunchpadSelectors {
  const selectors = { ...OPEN_EDITION_SELECTORS };
  
  // Parse version
  const parts = version.split(".");
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10) || 0;

  // Apply version-specific overrides
  const versionKey = `${major}.${minor}`;
  const majorKey = `${major}`;

  if (OPEN_EDITION_VERSION_SELECTORS[versionKey]) {
    Object.assign(selectors, OPEN_EDITION_VERSION_SELECTORS[versionKey]);
  } else if (OPEN_EDITION_VERSION_SELECTORS[majorKey]) {
    Object.assign(selectors, OPEN_EDITION_VERSION_SELECTORS[majorKey]);
  }

  return selectors;
}
