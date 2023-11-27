import {DxpEditionType} from "../common/types";
import {CommonBuildUrlAppOptions, UrlHelper} from "../common/urlhelper";

export class UrlHelperOpenEdition extends UrlHelper {

  constructor() {
    super(DxpEditionType.openEdition);
  }

  public buildUrl(_options: CommonBuildUrlAppOptions): URL {
    throw new Error("Method not implemented.");
  }



}