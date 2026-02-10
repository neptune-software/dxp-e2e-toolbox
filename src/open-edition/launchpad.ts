/**
 * Open Edition Launchpad implementation.
 * This is the main class for Open Edition, which extends BaseLaunchpad.
 */

import { BaseLaunchpad } from "../base/launchpad.js";
import { BaseTile, TileOptions } from "../base/tile.js";
import { LaunchpadOptions } from "../core/types.js";
import { OPEN_EDITION_SELECTORS, getOpenEditionSelectorsForVersion } from "./selectors.js";
import { OpenEditionUrlHelper } from "./url-helper.js";
import { Environment } from "../core/environment.js";

/**
 * Open Edition tile.
 */
export class TileOpenEdition extends BaseTile {
  // Open Edition specific tile functionality can be added here
}

/**
 * Open Edition Launchpad - main implementation for Open Edition.
 */
export class LaunchpadOpenEdition extends BaseLaunchpad {
  /**
   * Initialize with Open Edition selectors.
   */
  constructor(options?: Partial<LaunchpadOptions>) {
    super();
    this.selectors = { ...OPEN_EDITION_SELECTORS };
    
    // Apply version-specific selectors if version is available
    const env = Environment.getInstance();
    if (env.isInitialized() && env.version) {
      this.selectors = getOpenEditionSelectorsForVersion(env.version);
    }

    if (options) {
      this.launchpadName = options.launchpadName ?? "";
      this.isPwa = options.isPwa ?? false;
      this.baseUrl = options.baseUrl;
      this.pincodeOptions = options.pincodeOptions;
    }
  }

  /**
   * Navigate to the Open Edition launchpad.
   */
  public override async navigateToLaunchpad(): Promise<this> {
    const url = OpenEditionUrlHelper.buildUrl({
      baseUrl: this.baseUrl,
      launchpadName: this.launchpadName,
      isPwa: this.isPwa,
    });

    await this.browser.url(url);
    return this;
  }

  /**
   * Open the launchpad and wait for it to be ready.
   */
  public async open(): Promise<this> {
    await this.navigateToLaunchpad();
    await this.waitForLaunchpadReady();
    return this;
  }

  /**
   * Create an Open Edition tile instance.
   */
  protected override async createTileInstance(options: TileOptions): Promise<BaseTile> {
    return new TileOpenEdition(options);
  }

  /**
   * Login with Open Edition specific behavior.
   * Open Edition may have different authentication flows.
   */
  public override async login(username: string, password: string): Promise<this> {
    // Open Edition uses different selector IDs for login
    // The base class implementation should work with our overridden selectors
    return super.login(username, password);
  }
}

// Re-export for convenience
export { TileOpenEdition as Tile };
