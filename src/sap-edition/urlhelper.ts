import {DxpEditionType} from "../common/types";
import {BuildUrlAppOptions, CommonUniversalBuildUrlOptions, UrlHelper, BuildUrlCockpitOptions, BuildUrlLaunchpadOptions} from "../common/urlhelper";


export interface SapEditionUniversalBuildUrlOptions extends CommonUniversalBuildUrlOptions {

    /** You want to run it with neptune ui debug ? */
  neptuneDebug?: boolean

    /** You want to run it under the /webapp/... icf node? */
  webapp?: boolean

    /** Client of the sap system if not provided using process.env.SAP_CLIENT */
  client?: string

    /** add saml2=disabled?*/
  saml2Disabled?: boolean

}

export interface SapEditionBuildUrlCockpitOptions extends SapEditionUniversalBuildUrlOptions, BuildUrlCockpitOptions {

}

export interface SapEditionBuildUrlLaunchpadOptions extends SapEditionUniversalBuildUrlOptions, BuildUrlLaunchpadOptions {

}

export interface SapEditionBuildUrlAppOptions extends SapEditionUniversalBuildUrlOptions, BuildUrlAppOptions {

}

export type SapEditionBuildUrlOptions =
 SapEditionBuildUrlCockpitOptions |
 SapEditionBuildUrlLaunchpadOptions |
 SapEditionBuildUrlAppOptions;



export class UrlHelperSapEdition extends UrlHelper {

  constructor() {
    super(DxpEditionType.sapEdition);
  }

  public buildUrl(options: SapEditionBuildUrlOptions): URL {

    let url!: URL;
    if (options.url) {
      url = new URL(options.url);
    } else if(process.env.BROWSER_URL) {
      url = new URL(process.env.BROWSER_URL);
    }
    const launchpadOptions = options as SapEditionBuildUrlLaunchpadOptions;
    const appOptions = options as SapEditionBuildUrlAppOptions;
    const cockpitOptions = options as SapEditionBuildUrlCockpitOptions;

    if (options.path) {
      url.pathname = options.path;
    } else {
      url.pathname = `/neptune/`;
      if (options.webapp) {
        url.pathname += `webapp/`;
      } else if (launchpadOptions.pwa) {
        url.pathname += `pwa/`;
      }
    }

    if (cockpitOptions.cockpit) {
      url.pathname += `neptune/cockpit.html`;
    } else if (appOptions.appName) {
      url.pathname += appOptions.appName;
    } else if (launchpadOptions.launchpadName) {
      url.searchParams.append("launchpad", launchpadOptions.launchpadName);
    }
    if (options.client) {
      url.searchParams.append("sap-client", options.client);
    } else if (process.env.SAP_CLIENT) {
      url.searchParams.append("sap-client", process.env.SAP_CLIENT);
    }

    if (options.neptuneDebug) {
      url.searchParams.append("neptune-ui-debug", "true");
    }
    if (options.saml2Disabled) {
      url.searchParams.append("saml2", "disabled");
    }
    return url;
  }



}