/**
 * SAP Edition Launchpad for version 22.x (base).
 * This is the base version for the 22.x series.
 */

import { LaunchpadSapEdition } from "../launchpad.js";
import { SAP_EDITION_SELECTORS, SAP_EDITION_VERSION_SELECTORS } from "../selectors.js";
import { LaunchpadOptions } from "../../core/types.js";

/**
 * Launchpad implementation for SAP Edition version 22.
 * Uses legacy username selector (AppCacheUserActionText).
 */
export class LaunchpadSapEditionV22 extends LaunchpadSapEdition {
  constructor(options?: Partial<LaunchpadOptions>) {
    super(options);
    
    // Apply V22 specific selectors
    this.selectors = {
      ...SAP_EDITION_SELECTORS,
      ...SAP_EDITION_VERSION_SELECTORS["22"],
    };
  }

  /**
   * Get the current username from the user menu.
   * V22 uses the legacy AppCacheUserActionText selector.
   */
  public override async getCurrentUsername(): Promise<string | null> {
    await this.openUserMenu();

    try {
      // V22 uses legacy selector
      const usernameText = await this.getControl(this.selectors.textUsernameLegacy, true) as { getText: () => Promise<string> };
      return await usernameText.getText();
    } catch {
      return null;
    }
  }
}
