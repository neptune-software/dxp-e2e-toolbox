/**
 * Main factory for creating toolbox instances.
 * Provides a simple API for getting edition and version-specific launchpad instances.
 */

import { Environment } from "./environment.js";
import { DxpEditionType, ToolboxConfig, LaunchpadOptions } from "./types.js";
import { VersionResolver } from "./version-resolver.js";

// Forward declare launchpad type to avoid circular imports
import type { BaseLaunchpad } from "../base/launchpad.js";

/**
 * Launchpad creation options combining toolbox config and launchpad-specific options.
 */
export interface CreateLaunchpadOptions extends LaunchpadOptions {
  /**
   * DXP edition. If not specified, uses the edition from Environment.
   */
  edition?: DxpEditionType | "sap-edition" | "open-edition";

  /**
   * DXP version. If not specified, uses the version from Environment.
   */
  version?: string;
}

/**
 * Main factory class for creating toolbox instances.
 */
export class ToolboxFactory {
  private static sapEditionResolver?: VersionResolver<BaseLaunchpad>;
  private static openEditionResolver?: VersionResolver<BaseLaunchpad>;

  /**
   * Initialize the toolbox with the provided configuration.
   * This sets up the Environment singleton and must be called once before using the toolbox.
   * 
   * @example
   * ```typescript
   * // In your test setup (e.g., wdio.conf.ts or before hook)
   * await ToolboxFactory.init({
   *   edition: "sap-edition",
   *   version: "23.10.0005",
   *   errorMode: "exceptions",
   *   browser: browser,
   *   wdi5: wdi5
   * });
   * ```
   */
  public static init(config: ToolboxConfig): void {
    const env = Environment.getInstance();
    env.setup(Environment.fromConfig(config));
    
    // Initialize version resolvers
    this.initResolvers();
  }

  /**
   * Initialize version resolvers with available launchpad classes.
   */
  private static async initResolvers(): Promise<void> {
    // SAP Edition resolver
    this.sapEditionResolver = new VersionResolver<BaseLaunchpad>(
      DxpEditionType.sapEdition,
      "LaunchpadSapEdition"
    );

    // Register base SAP Edition class
    this.sapEditionResolver.registerBase(async () => {
      const mod = await import("../sap-edition/launchpad.js");
      return new mod.LaunchpadSapEdition({} as LaunchpadOptions);
    });

    // Register versioned SAP Edition classes
    // Version 22 (base for 22.x)
    this.sapEditionResolver.register("22", async () => {
      const mod = await import("../sap-edition/versions/launchpad-v22.js");
      return new mod.LaunchpadSapEditionV22({} as LaunchpadOptions);
    });

    // Version 22.10 (for 22.10.x - has different user menu selectors)
    this.sapEditionResolver.register("22.10", async () => {
      const mod = await import("../sap-edition/versions/launchpad-v22-10.js");
      return new mod.LaunchpadSapEditionV22_10({} as LaunchpadOptions);
    });

    // Version 23 (base for 23.x)
    this.sapEditionResolver.register("23", async () => {
      const mod = await import("../sap-edition/versions/launchpad-v23.js");
      return new mod.LaunchpadSapEditionV23({} as LaunchpadOptions);
    });

    // Open Edition resolver
    this.openEditionResolver = new VersionResolver<BaseLaunchpad>(
      DxpEditionType.openEdition,
      "LaunchpadOpenEdition"
    );

    // Register base Open Edition class
    this.openEditionResolver.registerBase(async () => {
      const mod = await import("../open-edition/launchpad.js");
      return new mod.LaunchpadOpenEdition({} as LaunchpadOptions);
    });
  }

  /**
   * Create a launchpad instance with the appropriate edition and version-specific implementation.
   * 
   * @example
   * ```typescript
   * // Create launchpad with current environment settings
   * const launchpad = await ToolboxFactory.createLaunchpad({
   *   launchpadName: "MY_LAUNCHPAD"
   * });
   * 
   * // Or override edition/version
   * const launchpad = await ToolboxFactory.createLaunchpad({
   *   launchpadName: "MY_LAUNCHPAD",
   *   edition: "sap-edition",
   *   version: "23.10.0005"
   * });
   * 
   * // Use fluent API
   * await launchpad
   *   .login(username, password)
   *   .setPincode("1111")
   *   .enterPincode("1111");
   * ```
   */
  public static async createLaunchpad(options: CreateLaunchpadOptions): Promise<BaseLaunchpad> {
    const env = Environment.getInstance();
    env.ensureInitialized();

    // Determine edition
    let edition: DxpEditionType;
    if (options.edition) {
      edition = typeof options.edition === "string" && options.edition === "sap-edition"
        ? DxpEditionType.sapEdition
        : options.edition === "open-edition"
          ? DxpEditionType.openEdition
          : options.edition as DxpEditionType;
    } else {
      edition = env.edition;
    }

    // Determine version
    const version = options.version ?? env.version;

    // Get the appropriate resolver
    const resolver = edition === DxpEditionType.sapEdition
      ? this.sapEditionResolver
      : this.openEditionResolver;

    if (!resolver) {
      await this.initResolvers();
    }

    // Get factory and create instance with options
    const factory = (edition === DxpEditionType.sapEdition
      ? this.sapEditionResolver!
      : this.openEditionResolver!
    ).resolve(version);

    // Create instance - we need to call factory and then initialize with options
    const launchpad = await factory();
    
    // Initialize the launchpad with the provided options
    await launchpad.initialize({
      launchpadName: options.launchpadName,
      isPwa: options.isPwa,
      sapClient: options.sapClient,
      baseUrl: options.baseUrl,
      pincodeOptions: options.pincodeOptions,
    });

    return launchpad;
  }

  /**
   * Convenience method to create a SAP Edition launchpad.
   */
  public static async createSapEditionLaunchpad(options: Omit<CreateLaunchpadOptions, "edition">): Promise<BaseLaunchpad> {
    return this.createLaunchpad({
      ...options,
      edition: DxpEditionType.sapEdition,
    });
  }

  /**
   * Convenience method to create an Open Edition launchpad.
   */
  public static async createOpenEditionLaunchpad(options: Omit<CreateLaunchpadOptions, "edition">): Promise<BaseLaunchpad> {
    return this.createLaunchpad({
      ...options,
      edition: DxpEditionType.openEdition,
    });
  }

  /**
   * Get the current Environment instance.
   */
  public static getEnvironment(): Environment {
    return Environment.getInstance();
  }
}
