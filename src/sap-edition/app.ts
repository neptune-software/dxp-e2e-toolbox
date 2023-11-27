import { App, AppOpenOptions } from "../common/app";
import { DxpEditionType } from "../common/types";

export interface AppOpenOptionsSapEdition extends Omit<AppOpenOptions, 'dxpEditionType'> {

}

export class AppSapEdition extends App {
    static async open(options: AppOpenOptionsSapEdition): Promise<App> {
        return App.open({
          ...options,
          dxpEditionType: DxpEditionType.sapEdition,
        });
    
      }
}