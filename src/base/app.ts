/**
 * Base App class for application page objects.
 */

import { Page } from "./page.js";

/**
 * Base class for application-specific page objects.
 */
export class BaseApp extends Page {
  /**
   * The view name for this app (for UI5 selector context).
   */
  public readonly viewName: string;

  constructor(viewName: string = "") {
    super();
    this.viewName = viewName;
  }

  /**
   * Create a UI5 selector with the view name context.
   */
  protected createSelector(id: string, controlType?: string): object {
    const selector: Record<string, string> = { id };
    
    if (this.viewName) {
      selector.viewName = this.viewName;
    }
    
    if (controlType) {
      selector.controlType = controlType;
    }

    return { selector };
  }
}
