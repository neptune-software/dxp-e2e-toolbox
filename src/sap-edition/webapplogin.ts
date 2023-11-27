import { Environment } from "../common/environment";
import { Page } from "../common/page";
import { DxpEditionType, DxpVersion } from "../common/types";


export interface WebappLoginConstructorOptions{
    dxpVersion?: DxpVersion;
}
export class WebappLogin extends Page {

    constructor(options?:WebappLoginConstructorOptions) {
        super({
            dxpEditionType: DxpEditionType.sapEdition,
            dxpVersion: options?.dxpVersion || Environment.getInstance().dxpVersion,
        })
    }

    public get inputUsername() {
        return $("#sap-user");
    }

    public get inputPassword() {
        return $("#sap-password");
    }

    public get butLogin() {
        return $("#butLogin");
    }

    public async login(username: string, password: string) {
        //@ts-ignore
        await this.inputUsername.setValue(username);
        //@ts-ignore
        await this.inputPassword.setValue(password);

        await this.butLogin.click();
    }

}