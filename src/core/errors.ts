/**
 * Typed exceptions for the DXP E2E Toolbox.
 * All errors include source identification and timestamp for debugging.
 */

/**
 * Base error class for all toolbox errors.
 * Includes source identification to distinguish toolbox errors from test errors.
 */
export class ToolboxError extends Error {
  public readonly source = "@neptune-software/dxp-e2e-toolbox";
  public readonly timestamp = new Date();
  public readonly errorCode: string;

  constructor(message: string, errorCode: string) {
    super(`[DXP E2E Toolbox] ${message}`);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when an expected screen is not found or doesn't match.
 */
export class ScreenNotFoundError extends ToolboxError {
  public readonly expectedScreen: string;
  public readonly actualScreen: string;

  constructor(expectedScreen: string, actualScreen: string) {
    super(
      `Expected screen "${expectedScreen}" but found "${actualScreen}"`,
      "SCREEN_NOT_FOUND"
    );
    this.expectedScreen = expectedScreen;
    this.actualScreen = actualScreen;
  }
}

/**
 * Thrown when a tile is not found in the launchpad.
 */
export class TileNotFoundError extends ToolboxError {
  public readonly tileIdentifier: string;
  public readonly identifierType: "GUID" | "NAME" | "APPLID";

  constructor(tileIdentifier: string, identifierType: "GUID" | "NAME" | "APPLID" = "GUID") {
    super(
      `Tile not found with ${identifierType}: "${tileIdentifier}"`,
      "TILE_NOT_FOUND"
    );
    this.tileIdentifier = tileIdentifier;
    this.identifierType = identifierType;
  }
}

/**
 * Thrown when login fails due to invalid credentials or other authentication issues.
 */
export class LoginFailedError extends ToolboxError {
  public readonly errorMessage?: string;
  public readonly username?: string;

  constructor(errorMessage?: string, username?: string) {
    super(
      errorMessage
        ? `Login failed: ${errorMessage}`
        : "Login failed due to unknown error",
      "LOGIN_FAILED"
    );
    this.errorMessage = errorMessage;
    this.username = username;
  }
}

/**
 * Thrown when pincode operations fail (setting or entering).
 */
export class PincodeError extends ToolboxError {
  public readonly operationType: "set" | "enter";
  public readonly errorMessage?: string;

  constructor(operationType: "set" | "enter", errorMessage?: string) {
    super(
      `Pincode ${operationType} failed${errorMessage ? `: ${errorMessage}` : ""}`,
      "PINCODE_ERROR"
    );
    this.operationType = operationType;
    this.errorMessage = errorMessage;
  }
}

/**
 * Thrown when an operation times out.
 */
export class TimeoutError extends ToolboxError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation "${operation}" timed out after ${timeoutMs}ms`,
      "TIMEOUT"
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when OAuth authentication fails.
 */
export class OAuthError extends ToolboxError {
  public readonly provider: "azure" | "okta" | "btp-ias";
  public readonly step: string;
  public readonly details?: string;

  constructor(provider: "azure" | "okta" | "btp-ias", step: string, details?: string) {
    super(
      `OAuth error with ${provider} at step "${step}"${details ? `: ${details}` : ""}`,
      "OAUTH_ERROR"
    );
    this.provider = provider;
    this.step = step;
    this.details = details;
  }
}

/**
 * Thrown when a control/element is not found.
 */
export class ControlNotFoundError extends ToolboxError {
  public readonly controlId: string;
  public readonly controlType?: string;

  constructor(controlId: string, controlType?: string) {
    super(
      `Control not found: "${controlId}"${controlType ? ` (type: ${controlType})` : ""}`,
      "CONTROL_NOT_FOUND"
    );
    this.controlId = controlId;
    this.controlType = controlType;
  }
}

/**
 * Thrown when user operations fail (add user, switch user, etc.).
 */
export class UserOperationError extends ToolboxError {
  public readonly operation: string;

  constructor(operation: string, details?: string) {
    super(
      `User operation "${operation}" failed${details ? `: ${details}` : ""}`,
      "USER_OPERATION_ERROR"
    );
    this.operation = operation;
  }
}

/**
 * Thrown when version resolution fails.
 */
export class VersionResolutionError extends ToolboxError {
  public readonly requestedVersion: string;
  public readonly edition: string;

  constructor(requestedVersion: string, edition: string) {
    super(
      `Could not resolve class for version "${requestedVersion}" and edition "${edition}"`,
      "VERSION_RESOLUTION_ERROR"
    );
    this.requestedVersion = requestedVersion;
    this.edition = edition;
  }
}

/**
 * Thrown when window/context operations fail.
 */
export class WindowHandleError extends ToolboxError {
  public readonly operation: string;

  constructor(operation: string, details?: string) {
    super(
      `Window handle operation "${operation}" failed${details ? `: ${details}` : ""}`,
      "WINDOW_HANDLE_ERROR"
    );
    this.operation = operation;
  }
}
