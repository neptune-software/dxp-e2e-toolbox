import {Environment} from "./environment";
import {Page, PageContstructorConfig} from "./page";
import {Tile} from "./tile";
import {DxpEditionType} from "./types";
import {CommonBuildUrlLaunchpadOptions, UrlHelper} from "./urlhelper";


export interface PincodeOptions {

  pincodeEnabled?: boolean;

  pincodeLength?: number;
}

export interface LaunchpadContstructorConfig extends PageContstructorConfig {
    /** Name of the Launchpad */
  launchpadName: string,

  isPwa?: boolean;

  pincodeOptions?: PincodeOptions;

}

export interface LaunchpadOpenOptions extends CommonBuildUrlLaunchpadOptions, LaunchpadContstructorConfig {

}

export interface GetTileDataOptions {
  GUID?: string,
  NAME?: string,
  APPLID?: string,
}
export class Launchpad extends Page {

  public readonly launchpadName: string;

  public readonly isPwa?: boolean;

  public readonly pincodeOptions?: PincodeOptions;

  constructor(options: LaunchpadContstructorConfig) {
    super(options);
    this.launchpadName = options.launchpadName;
    this.isPwa = options.isPwa;
    this.pincodeOptions = options.pincodeOptions;
  }

  static async getInstance(options: LaunchpadContstructorConfig): Promise<Launchpad> {
    let launchpadModule;
    switch (options.dxpEditionType) {
      case DxpEditionType.sapEdition:
        launchpadModule = await import("../sap-edition/launchpad");
        return new launchpadModule.LaunchpadSapEdition(options);
      default:
        launchpadModule = await import("../open-edition/launchpad");
        return new launchpadModule.LaunchpadOpenEdition(options);
    }
  }

  static async open(options: LaunchpadOpenOptions): Promise<Launchpad> {
    const urlHelper = await UrlHelper.getInstance(options.dxpEditionType || Environment.getInstance().dxpEditionType);
    const url = urlHelper.buildUrlString(options);

    await Environment.getInstance().browser.url(url);


    return Launchpad.getInstance({
      ...options,
    });


  }

    /**
     * @description Get Data of a Tile
     * @param options Get Tile Data by NAME, GUID, or APPLID
     */
  public async getTileData(options: GetTileDataOptions): Promise<any> {
    let getTileDataScript = "";
    if (options.GUID) {
      getTileDataScript = `return ModelData.FindFirst(sap.ui.getCore().byId("AppCacheTiles"), "GUID", '${options.GUID}');`;
    } else if (options.NAME) {
      getTileDataScript = `return ModelData.FindFirst(sap.ui.getCore().byId("AppCacheTiles"), "NAME", '${options.NAME}');`;
    } else {
      getTileDataScript = `return ModelData.FindFirst(sap.ui.getCore().byId("AppCacheTiles"), "APPLID", '${options.APPLID}');`;
    }

    const tileData = await this.browser.executeScript(getTileDataScript, []);

    if (tileData && tileData.GUID) {
      return tileData;
    } else {
      throw new Error(`Couldn't fetch Tile Data for ${JSON.stringify(options)}`);
    }
  }

    /**
     * @description Opening a Tile in the Launchpad. It will call function
     * sap.n.Launchpad.HandleTilePress that requires to pass the corresponding GUID of the tile
     * @param  options Get Tile Data by NAME, GUID, or APPLID
     */
  public async openTile(options: GetTileDataOptions): Promise<Tile> {
    await this.browser.pause(500);
    const tileData = await this.getTileData(options);
    const openTileScript = `sap.n.Launchpad.HandleTilePress(arguments[0]);`;

    await this.browser.executeScript(openTileScript, [tileData]);

    const tile = await Tile.getInstance({
      launchpad: this,
      tileData: tileData,
    });
    return tile;
  }

}