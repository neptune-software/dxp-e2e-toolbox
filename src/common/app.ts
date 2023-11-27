import { Tile } from "./tile";
import { Page, PageContstructorConfig } from "./page";
import { DxpEditionType, DxpVersion } from "./types";
import { CommonBuildUrlAppOptions, UrlHelper } from "./urlhelper";
import { Environment } from "./environment";
import { AppSapEdition } from "../sap-edition";
import { AppOpenEdition } from "../open-edition";


export interface AppContstructorConfig extends PageContstructorConfig {
    tile?: Tile,
    /** Name of the App */
    appName: string,
}

export interface AppOpenOptions extends CommonBuildUrlAppOptions{

    dxpEditionType: DxpEditionType;
    dxpVersion?: DxpVersion;
}

export class App extends Page {

    public readonly appName: string;
    public readonly tile?: Tile;

    constructor(options: AppContstructorConfig) {
        super(options);
        this.tile = options.tile;
        this.appName = options.appName;
    }

    static getInstance(options: AppContstructorConfig): App {
        switch (options.dxpEditionType) {
            case DxpEditionType.sapEdition:
                return new AppSapEdition(options);
            default: 
                return new AppOpenEdition(options);
        }
    }

    static async open(options:AppOpenOptions):Promise<App>{
        const urlHelper = UrlHelper.getInstance(options.dxpEditionType);
        const url = urlHelper.buildUrlString(options);

        await Environment.getInstance().browser.url(url);


        return App.getInstance({
            ...options, 
        })

        
    }
}