/**
 * URL helper for SAP Edition launchpad.
 */

/**
 * Options for building SAP Edition launchpad URLs.
 */
export interface SapEditionUrlOptions {
  /**
   * Base URL (e.g., "https://myserver.com:8080").
   */
  baseUrl?: string;

  /**
   * SAP client number.
   */
  sapClient?: string;

  /**
   * Launchpad name.
   */
  launchpadName: string;

  /**
   * Whether to enable Neptune UI debug mode.
   */
  neptuneUiDebug?: boolean;

  /**
   * Whether to disable SAML2.
   */
  saml2Disabled?: boolean;

  /**
   * Additional query parameters.
   */
  additionalParams?: Record<string, string>;
}

/**
 * URL helper for SAP Edition.
 */
export class SapEditionUrlHelper {
  /**
   * Build a launchpad URL for SAP Edition.
   */
  public static buildLaunchpadUrl(options: SapEditionUrlOptions): string {
    const {
      baseUrl = "",
      sapClient,
      launchpadName,
      neptuneUiDebug = true,
      saml2Disabled = true,
      additionalParams = {},
    } = options;

    // Build base path
    const path = `/sap/bc/ui5_ui5/sap/zn_launchpad/index.html`;

    // Build query parameters
    const params = new URLSearchParams();

    if (sapClient) {
      params.set("sap-client", sapClient);
    }

    params.set("launchpad", launchpadName);

    if (neptuneUiDebug) {
      params.set("neptune-ui-debug", "true");
    }

    if (saml2Disabled) {
      params.set("saml2", "disabled");
    }

    // Add any additional parameters
    for (const [key, value] of Object.entries(additionalParams)) {
      params.set(key, value);
    }

    const queryString = params.toString();
    return `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
  }

  /**
   * Build a PWA launchpad URL for SAP Edition.
   */
  public static buildPwaLaunchpadUrl(options: SapEditionUrlOptions): string {
    const {
      baseUrl = "",
      sapClient,
      launchpadName,
      neptuneUiDebug = true,
      additionalParams = {},
    } = options;

    // PWA uses a different path structure
    const path = `/neptune/${launchpadName}/`;

    const params = new URLSearchParams();

    if (sapClient) {
      params.set("sap-client", sapClient);
    }

    if (neptuneUiDebug) {
      params.set("neptune-ui-debug", "true");
    }

    for (const [key, value] of Object.entries(additionalParams)) {
      params.set(key, value);
    }

    const queryString = params.toString();
    return `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
  }

  /**
   * Build URL based on whether it's a PWA or not.
   */
  public static buildUrl(options: SapEditionUrlOptions & { isPwa?: boolean }): string {
    if (options.isPwa) {
      return this.buildPwaLaunchpadUrl(options);
    }
    return this.buildLaunchpadUrl(options);
  }
}
