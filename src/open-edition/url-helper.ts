/**
 * URL helper for Open Edition launchpad.
 */

/**
 * Options for building Open Edition launchpad URLs.
 */
export interface OpenEditionUrlOptions {
  /**
   * Base URL (e.g., "https://myserver.com").
   */
  baseUrl?: string;

  /**
   * Launchpad name/ID.
   */
  launchpadName: string;

  /**
   * Whether to enable Neptune UI debug mode.
   */
  neptuneUiDebug?: boolean;

  /**
   * Additional query parameters.
   */
  additionalParams?: Record<string, string>;
}

/**
 * URL helper for Open Edition.
 */
export class OpenEditionUrlHelper {
  /**
   * Build a launchpad URL for Open Edition.
   */
  public static buildLaunchpadUrl(options: OpenEditionUrlOptions): string {
    const {
      baseUrl = "",
      launchpadName,
      neptuneUiDebug = true,
      additionalParams = {},
    } = options;

    // Build base path - Open Edition uses a different structure
    const path = `/launchpad/${launchpadName}/`;

    // Build query parameters
    const params = new URLSearchParams();

    if (neptuneUiDebug) {
      params.set("neptune-ui-debug", "true");
    }

    // Add any additional parameters
    for (const [key, value] of Object.entries(additionalParams)) {
      params.set(key, value);
    }

    const queryString = params.toString();
    return `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
  }

  /**
   * Build a PWA launchpad URL for Open Edition.
   */
  public static buildPwaLaunchpadUrl(options: OpenEditionUrlOptions): string {
    const {
      baseUrl = "",
      launchpadName,
      neptuneUiDebug = true,
      additionalParams = {},
    } = options;

    // PWA uses the same path structure in Open Edition
    const path = `/pwa/${launchpadName}/`;

    const params = new URLSearchParams();

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
  public static buildUrl(options: OpenEditionUrlOptions & { isPwa?: boolean }): string {
    if (options.isPwa) {
      return this.buildPwaLaunchpadUrl(options);
    }
    return this.buildLaunchpadUrl(options);
  }
}
