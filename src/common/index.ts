/**
 * Common module - re-exports from new modules for backwards compatibility.
 * @deprecated Use direct imports from core, base, and helpers instead.
 */

// Re-export from core
export { Environment } from "../core/environment.js";
export { DxpEditionType, type DxpVersion } from "../core/types.js";

// Re-export from base
export { Page } from "../base/page.js";
export { BaseLaunchpad as Launchpad } from "../base/launchpad.js";
export { BaseTile as Tile } from "../base/tile.js";
export { WebView } from "../base/webview.js";
export { BaseApp as App } from "../base/app.js";
