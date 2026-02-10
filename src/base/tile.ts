/**
 * Base Tile class for tile operations.
 */

import { CloseTileConfig } from "../core/types.js";
import type { BaseLaunchpad } from "./launchpad.js";

/**
 * Tile data structure from Neptune launchpad.
 */
export interface TileData {
  GUID: string;
  NAME?: string;
  APPLID?: string;
  TITLE?: string;
  [key: string]: unknown;
}

/**
 * Options for creating a tile instance.
 */
export interface TileOptions {
  launchpad: BaseLaunchpad;
  tileData: TileData;
}

/**
 * Base Tile class representing an opened tile in the launchpad.
 */
export class BaseTile {
  /**
   * Reference to the launchpad that owns this tile.
   */
  public readonly launchpad: BaseLaunchpad;

  /**
   * The tile data from Neptune.
   */
  public readonly tileData: TileData;

  /**
   * Whether this tile is currently opened.
   */
  public isOpened: boolean = false;

  constructor(options: TileOptions) {
    this.launchpad = options.launchpad;
    this.tileData = options.tileData;
  }

  /**
   * Get the tile GUID.
   */
  public get guid(): string {
    return this.tileData.GUID;
  }

  /**
   * Get the tile name.
   */
  public get name(): string | undefined {
    return this.tileData.NAME;
  }

  /**
   * Get the tile application ID.
   */
  public get applId(): string | undefined {
    return this.tileData.APPLID;
  }

  /**
   * Get the tile title.
   */
  public get title(): string | undefined {
    return this.tileData.TITLE;
  }

  /**
   * Close this tile.
   */
  public async close(config?: CloseTileConfig): Promise<this> {
    await this.launchpad.closeTileByData(this.tileData, config);
    this.isOpened = false;
    return this;
  }

  /**
   * Wait for the tile app to be fully loaded.
   */
  public async waitForAppLoaded(): Promise<this> {
    const browser = this.launchpad["browser"];
    
    await browser.waitUntil(
      async () => {
        try {
          // Check if the app view is loaded
          const script = `
            return (function() {
              var tile = ModelData.FindFirst(sap.ui.getCore().byId("AppCacheTiles"), "GUID", "${this.guid}");
              if (!tile) return false;
              // Check if app container exists
              var appContainer = document.querySelector('[data-app-guid="${this.guid}"]');
              return !!appContainer;
            })();
          `;
          return await browser.execute(script);
        } catch {
          return false;
        }
      },
      {
        timeout: 30000,
        interval: 500,
        timeoutMsg: `App for tile "${this.guid}" did not load`,
      }
    );

    return this;
  }
}
