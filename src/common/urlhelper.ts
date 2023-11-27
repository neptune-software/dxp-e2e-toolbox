import {DxpEditionType} from "./types";

export interface CommonUniversalBuildUrlOptions {
    /** Url of the dxp instance if not provided using process.env.BROWSER_URL */
  url?: string,

    /* manually specified path if you want to do it on your own*/
  path?: string

}

export interface BuildUrlCockpitOptions {
    /** You want to open the cockpit? */
  cockpit: boolean,
}

export interface CommonBuildUrlCockpitOptions extends CommonUniversalBuildUrlOptions, BuildUrlCockpitOptions {

}

export interface BuildUrlLaunchpadOptions {
    /** Name of the launchpad you want to start */
  launchpadName: string,

    /** is it a pwa ? */
  pwa?: boolean
}
export interface CommonBuildUrlLaunchpadOptions extends CommonUniversalBuildUrlOptions, BuildUrlLaunchpadOptions {

}


export interface BuildUrlAppOptions {
    /** Name of the launchpad you want to start */
  appName: string,
}

export interface CommonBuildUrlAppOptions extends BuildUrlAppOptions, CommonUniversalBuildUrlOptions {

}

export type CommonBuildUrlOptions = CommonBuildUrlAppOptions | CommonBuildUrlLaunchpadOptions | CommonBuildUrlCockpitOptions;


export abstract class UrlHelper {

  public readonly dxpEditionType: DxpEditionType;

  constructor(dxpEditionType: DxpEditionType) {
    this.dxpEditionType = dxpEditionType;
  }

  static async getInstance(dxpEditionType: DxpEditionType): Promise<UrlHelper> {
    let urlHelperModule;
    switch (dxpEditionType) {
      case DxpEditionType.sapEdition:
        urlHelperModule = await import("../sap-edition/urlhelper");
        return new urlHelperModule.UrlHelperSapEdition();
      default:
        urlHelperModule = await import("../open-edition/urlhelper");
        return new urlHelperModule.UrlHelperOpenEdition();
    }
  }

  public abstract buildUrl(options: CommonBuildUrlOptions): URL;

  public buildUrlString(options: CommonBuildUrlOptions): string {
    return this.buildUrl(options).toString();
  }

}