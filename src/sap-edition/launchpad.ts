/**
 * SAP Edition Launchpad implementation.
 * This is the main class for SAP Edition, which extends BaseLaunchpad.
 */

import { BaseLaunchpad } from "../base/launchpad.js";
import { BaseTile, TileOptions } from "../base/tile.js";
import { LaunchpadOptions } from "../core/types.js";
import { SAP_EDITION_SELECTORS, getSelectorsForVersion, AppCacheTile } from "./selectors.js";
import { SapEditionUrlHelper } from "./url-helper.js";
import { Environment } from "../core/environment.js";

/**
 * SAP Edition tile with full AppCacheTile data.
 */
export class TileSapEdition extends BaseTile {
  /**
   * Get the full tile data with SAP Edition specific properties.
   */
  public get fullTileData(): AppCacheTile {
    return this.tileData as AppCacheTile;
  }
}

/**
 * SAP Edition Launchpad - main implementation for SAP Edition.
 * Uses the latest selectors and patterns.
 */
export class LaunchpadSapEdition extends BaseLaunchpad {
  /**
   * Initialize with SAP Edition selectors.
   */
  constructor(options?: Partial<LaunchpadOptions>) {
    super();
    this.selectors = { ...SAP_EDITION_SELECTORS };
    
    // Apply version-specific selectors if version is available
    const version = Environment.getInstance().version;
    if (version) {
      this.selectors = getSelectorsForVersion(version);
    }

    if (options) {
      this.launchpadName = options.launchpadName ?? "";
      this.isPwa = options.isPwa ?? false;
      this.sapClient = options.sapClient;
      this.baseUrl = options.baseUrl;
      this.pincodeOptions = options.pincodeOptions;
    }
  }

  /**
   * Navigate to the SAP Edition launchpad.
   */
  public async navigateToLaunchpad(): Promise<this> {
    const url = SapEditionUrlHelper.buildUrl({
      baseUrl: this.baseUrl,
      sapClient: this.sapClient,
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
   * Create a SAP Edition tile instance.
   */
  protected async createTileInstance(options: TileOptions): Promise<BaseTile> {
    return new TileSapEdition(options);
  }

  /**
   * Get all tiles from the launchpad.
   */
  public async getAllTiles(): Promise<AppCacheTile[]> {
    const script = `
      if (typeof AppCacheTiles !== "undefined") {
        return AppCacheTiles.getData ? AppCacheTiles.getData() : AppCacheTiles;
      }
      return [];
    `;
    return await this.browser.execute(script) as AppCacheTile[];
  }

  /**
   * Search for tiles by name pattern.
   */
  public async searchTiles(pattern: string | RegExp): Promise<AppCacheTile[]> {
    const allTiles = await this.getAllTiles();
    const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
    
    return allTiles.filter(tile => 
      regex.test(tile.NAME) || 
      regex.test(tile.TILE_TITLE) ||
      regex.test(tile.APPLID)
    );
  }
}

// Re-export for backwards compatibility
export { TileSapEdition as Tile };
