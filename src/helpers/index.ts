/**
 * Helper module exports.
 */

// Wait utilities
export * from "./wait-utils.js";

// WebView utilities
export { WebViewUtil } from "./webview-util.js";

// Window handle utilities
export { WindowHandleUtil } from "./window-handle-util.js";

// App lifecycle utilities
export {
  AppLifecycleUtil,
  AppLifecycleError,
  type AppLifecycleOptions,
  type RestartAppOptions,
} from "./app-lifecycle-util.js";

// Context utilities (mobile webviews and browser tabs)
export {
  ContextUtil,
  ContextError,
  type ContextType,
  type ContextInfo,
  type ContextSwitchOptions,
  type OAuthWindowOptions,
} from "./context-util.js";

// Gesture utilities
export * from "./gestures.js";

// OAuth Flow Manager - unified OAuth handling
export {
  OAuthFlowManager,
  type OAuthProvider,
  type OAuthBrowserMode,
  type OAuthCredentials,
  type PerformOAuthLoginOptions,
  type OAuthLoginResult,
  type IsOAuthPageCallback,
  type CustomLoginHandler,
} from "./oauth-flow-manager.js";
