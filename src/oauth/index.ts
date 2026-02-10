/**
 * OAuth module exports.
 */

// Base provider
export { BaseOAuthProvider, type OAuthWindowInfo } from "./oauth-provider.js";

// Specific providers
export { AzureLogin, type AzureLoginOptions } from "./azure-login.js";
export { OktaLogin, type OktaLoginOptions } from "./okta-login.js";
export { BtpIasLogin, type BtpIasLoginOptions } from "./btp-ias-login.js";

// Factory function for creating OAuth providers
import { BaseOAuthProvider } from "./oauth-provider.js";
import { AzureLogin } from "./azure-login.js";
import { OktaLogin } from "./okta-login.js";
import { BtpIasLogin } from "./btp-ias-login.js";
import { OAuthProvider } from "../core/types.js";

/**
 * Create an OAuth provider instance.
 */
export function createOAuthProvider(provider: OAuthProvider): BaseOAuthProvider {
  switch (provider) {
    case "azure":
      return new AzureLogin();
    case "okta":
      return new OktaLogin();
    case "btp-ias":
      return new BtpIasLogin();
    default:
      throw new Error(`Unknown OAuth provider: ${provider}`);
  }
}
