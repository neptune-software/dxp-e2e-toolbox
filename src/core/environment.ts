/**
 * Environment singleton for managing global toolbox configuration.
 * Provides access to browser, wdi5, version info, and error handling mode.
 */

import { DxpEditionType, DxpVersion, ErrorMode, ToolboxConfig } from "./types.js";

/**
 * Setup options for initializing the environment.
 */
export interface EnvironmentSetupOptions {
  /**
   * WebDriverIO browser instance.
   */
  browser: WebdriverIO.Browser;

  /**
   * wdi5 service instance.
   */
  wdi5: unknown;

  /**
   * DXP edition type.
   */
  edition: DxpEditionType;

  /**
   * DXP version string.
   */
  version: DxpVersion;

  /**
   * Error handling mode. Defaults to "exceptions".
   */
  errorMode?: ErrorMode;
}

/**
 * Environment singleton that holds global configuration for the toolbox.
 * Must be initialized via setup() before using other toolbox features.
 */
export class Environment {
  private static instance: Environment;

  /**
   * WebDriverIO browser instance.
   */
  public browser!: WebdriverIO.Browser;

  /**
   * wdi5 service instance for UI5 control interaction.
   */
  public wdi5!: unknown;

  /**
   * Current DXP version being tested.
   */
  public version!: DxpVersion;

  /**
   * Current DXP edition type.
   */
  public edition!: DxpEditionType;

  /**
   * Error handling mode.
   * - "exceptions": Throw typed exceptions
   * - "assertions": Use expect() assertions
   */
  public errorMode: ErrorMode = "exceptions";

  /**
   * Whether the environment has been initialized.
   */
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance of Environment.
   */
  public static getInstance(): Environment {
    if (!Environment.instance) {
      Environment.instance = new Environment();
    }
    return Environment.instance;
  }

  /**
   * Reset the singleton instance (useful for testing).
   */
  public static reset(): void {
    Environment.instance = new Environment();
  }

  /**
   * Initialize the environment with the provided configuration.
   * This must be called before using other toolbox features.
   */
  public setup(options: EnvironmentSetupOptions): Environment {
    this.browser = options.browser;
    this.wdi5 = options.wdi5;
    this.version = options.version;
    this.edition = options.edition;
    this.errorMode = options.errorMode ?? "exceptions";
    this.initialized = true;
    return this;
  }

  /**
   * Check if the environment has been initialized.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the environment is initialized, throwing if not.
   */
  public ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "[DXP E2E Toolbox] Environment not initialized. Call Environment.getInstance().setup() first."
      );
    }
  }

  /**
   * Check if we're in assertions mode.
   */
  public useAssertions(): boolean {
    return this.errorMode === "assertions";
  }

  /**
   * Check if we're in exceptions mode.
   */
  public useExceptions(): boolean {
    return this.errorMode === "exceptions";
  }

  /**
   * Create environment setup from ToolboxConfig.
   */
  public static fromConfig(config: ToolboxConfig): EnvironmentSetupOptions {
    // Normalize edition string to enum
    let edition: DxpEditionType;
    const editionStr = String(config.edition);
    if (editionStr === "sap-edition" || editionStr === DxpEditionType.sapEdition) {
      edition = DxpEditionType.sapEdition;
    } else {
      edition = DxpEditionType.openEdition;
    }

    return {
      browser: config.browser!,
      wdi5: config.wdi5,
      edition,
      version: config.version,
      errorMode: config.errorMode,
    };
  }
}
