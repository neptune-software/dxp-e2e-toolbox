import {App} from "../common/app";
import {DxpEditionType} from "../common/types";
import {SapEditionBuildUrlAppOptions} from "./urlhelper";

export type AppOpenOptionsSapEdition = Omit<SapEditionBuildUrlAppOptions, "dxpEditionType">;

export class AppSapEdition extends App {
  static async open(options: AppOpenOptionsSapEdition): Promise<App> {
    return App.open({
      ...options,
      dxpEditionType: DxpEditionType.sapEdition,
    });

  }
}