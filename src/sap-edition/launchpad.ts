import {Launchpad} from "../common/launchpad";
import {DxpEditionType} from "../common/types";
import {SapEditionBuildUrlLaunchpadOptions} from "./urlhelper";


export type LaunchpadOpenOptionsSapEdition = Omit<SapEditionBuildUrlLaunchpadOptions, "dxpEditionType">;

export class LaunchpadSapEdition extends Launchpad {


  static async open(options: LaunchpadOpenOptionsSapEdition): Promise<Launchpad> {

    return Launchpad.open({
      ...options,
      dxpEditionType: DxpEditionType.sapEdition,
    });

  }

}