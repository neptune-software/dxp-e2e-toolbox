import {CloseTileConfig, Launchpad} from "./launchpad";
import {DxpEditionType} from "./types";

export interface TileConstructorConfig {
  launchpad: Launchpad;
  tileData: any,
}

export class Tile {

  public readonly launchpad: Launchpad;

  public readonly tileData: any;

  public isOpened: boolean = false;

  constructor(options: TileConstructorConfig) {

    this.launchpad = options.launchpad;
    this.tileData = options.tileData;
  }


  static async getInstance(options: TileConstructorConfig): Promise<Tile> {
    let tileModule;
    switch (options.launchpad.dxpEditionType) {
      case DxpEditionType.sapEdition:
        tileModule = await import("../sap-edition/tile");
        return new tileModule.TileSapEdition(options);
      default:
        tileModule = await import("../open-edition/tile");
        return new tileModule.TileOpenEdition(options);
    }
  }

  public async close(config?: CloseTileConfig): Promise<Tile> {
    await this.launchpad.closeTile({
      tileData: this.tileData,
      config: config,
    });
    this.isOpened = false;
    return this;
  }

}