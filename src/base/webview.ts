/**
 * Base WebView class providing access to browser instance.
 */

import { Environment } from "../core/environment.js";

/**
 * Base class for all page objects that need browser access.
 */
export class WebView {
  /**
   * Get the browser instance from Environment.
   */
  protected get browser(): WebdriverIO.Browser {
    return Environment.getInstance().browser;
  }

  /**
   * Get the wdi5 service instance.
   */
  protected get wdi5(): unknown {
    return Environment.getInstance().wdi5;
  }

  /**
   * Get the Environment singleton.
   */
  protected get environment(): Environment {
    return Environment.getInstance();
  }
}
