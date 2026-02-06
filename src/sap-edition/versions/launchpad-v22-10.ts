/**
 * SAP Edition Launchpad for version 22.10.x.
 * This version introduced new username text selector.
 */

import { LaunchpadSapEditionV22 } from "./launchpad-v22.js";
import { SAP_EDITION_SELECTORS, SAP_EDITION_VERSION_SELECTORS } from "../selectors.js";
import { LaunchpadOptions } from "../../core/types.js";

/**
 * Launchpad implementation for SAP Edition version 22.10.
 * Uses new username selector (launchpadSettingsHeaderText) from 22.10.0009+.
 */
export class LaunchpadSapEditionV22_10 extends LaunchpadSapEditionV22 {
  constructor(options?: Partial<LaunchpadOptions>) {
    super(options);
    
    // Apply V22.10 specific selectors (new username text selector)
    this.selectors = {
      ...SAP_EDITION_SELECTORS,
      ...SAP_EDITION_VERSION_SELECTORS["22.10"],
    };
  }

  /**
   * Get the current username from the user menu.
   * V22.10 uses the new launchpadSettingsHeaderText selector.
   */
  public override async getCurrentUsername(): Promise<string | null> {
    await this.openUserMenu();

    try {
      // V22.10+ uses new selector
      const usernameText = await this.getControl(this.selectors.textUsername, true) as { getText: () => Promise<string> };
      return await usernameText.getText();
    } catch {
      // Fall back to legacy if needed
      try {
        const usernameText = await this.getControl(this.selectors.textUsernameLegacy, true) as { getText: () => Promise<string> };
        return await usernameText.getText();
      } catch {
        return null;
      }
    }
  }
}
