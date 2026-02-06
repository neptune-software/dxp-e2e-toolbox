/**
 * DXP E2E Toolbox - Main entry point
 * 
 * @package @neptune-software/dxp-e2e-toolbox
 * 
 * A robust, version-aware factory-based library for Neptune DXP end-to-end testing.
 * 
 * @example
 * ```typescript
 * import { ToolboxFactory, AzureLogin } from "@neptune-software/dxp-e2e-toolbox";
 * 
 * // Initialize the toolbox
 * ToolboxFactory.init({
 *   edition: "sap-edition",
 *   version: "23.10.0005",
 *   errorMode: "exceptions",
 *   browser: browser,
 *   wdi5: wdi5
 * });
 * 
 * // Create a launchpad instance
 * const launchpad = await ToolboxFactory.createLaunchpad({
 *   launchpadName: "MY_LAUNCHPAD"
 * });
 * 
 * // Use fluent API
 * await launchpad
 *   .login(username, password)
 *   .setPincode("1111")
 *   .enterPincode("1111");
 * 
 * // Open a tile
 * const tile = await launchpad.openTile("TILE_GUID");
 * await tile.close();
 * ```
 */

// Core exports
export * from "./core/index.js";

// Base classes
export * from "./base/index.js";

// Helpers
export * from "./helpers/index.js";

// OAuth providers
export * from "./oauth/index.js";

// SAP Edition
export * as sapEdition from "./sap-edition/index.js";

// Open Edition
export * as openEdition from "./open-edition/index.js";

// Re-export commonly used items at top level for convenience
export { ToolboxFactory } from "./core/toolbox-factory.js";
export { Environment } from "./core/environment.js";
export { BaseLaunchpad } from "./base/launchpad.js";
export { LaunchpadSapEdition } from "./sap-edition/launchpad.js";
export { LaunchpadOpenEdition } from "./open-edition/launchpad.js";
export { AzureLogin } from "./oauth/azure-login.js";
export { OktaLogin } from "./oauth/okta-login.js";
export { BtpIasLogin } from "./oauth/btp-ias-login.js";
