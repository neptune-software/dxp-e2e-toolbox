import { LaunchpadOpenEdition } from "../open-edition/launchpad";
import { LaunchpadSapEdition } from "../sap-edition/launchpad";
import { Environment } from "./environment";
import { Page, PageContstructorConfig } from "./page";
import { DxpEditionType } from "./types";
import { CommonBuildUrlLaunchpadOptions, UrlHelper } from "./urlhelper";


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

export interface LaunchpadOpenOptions extends CommonBuildUrlLaunchpadOptions, LaunchpadContstructorConfig{
 
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

    static getInstance(options: LaunchpadContstructorConfig): Launchpad {
        switch (options.dxpEditionType) {
            case DxpEditionType.sapEdition:
                return new LaunchpadSapEdition(options);
            default:
                return new LaunchpadOpenEdition(options);
        }
    }

    static async open(options:LaunchpadOpenOptions):Promise<Launchpad>{
        const urlHelper = UrlHelper.getInstance(options.dxpEditionType || Environment.getInstance().dxpEditionType);
        const url = urlHelper.buildUrlString(options);

        await Environment.getInstance().browser.url(url);


        return Launchpad.getInstance({
            ...options, 
        })

        
    }

}