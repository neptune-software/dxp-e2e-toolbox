import { WebView } from "./webview";
import { DxpEditionType, DxpVersion } from "./types";
import { UrlHelper } from "./urlhelper";
import { Environment } from "./environment";


export interface PageContstructorConfig {
    dxpEditionType?: DxpEditionType;
    dxpVersion?: DxpVersion;
}

export class Page extends WebView {

    public readonly dxpEditionType: DxpEditionType;

    public readonly dxpVersion: DxpVersion;

    protected urlHelper!: UrlHelper;

    constructor(options: PageContstructorConfig) {
        super();
        this.dxpEditionType = options.dxpEditionType!;
        if (options.dxpVersion) {
            this.dxpVersion = options.dxpVersion;
        } else {
            this.dxpVersion = Environment.getInstance().dxpVersion;
        }
    }

    public getUrlHelper(): UrlHelper {
        if (!this.urlHelper) {
            this.urlHelper = UrlHelper.getInstance(this.dxpEditionType);
        }
        return this.urlHelper;
    }

    public async waitUntilNeptuneIsReady() {
        await Environment.getInstance().browser.waitUntil(async () => {

            const neptuneReady = `return (neptune && neptune.ui5Ready && neptune.deviceReady)`;
            const ready = await Environment.getInstance().browser.executeScript(neptuneReady, []);
            return ready;

        }, {
            timeout: 15000,
            timeoutMsg: "expected neptune page to be ready",
        });
    }

    public async injectUI5() {
        try {
            await Environment.getInstance().wdi5.injectUI5(Environment.getInstance().browser);
        } catch (error) {
            console.log(error);
        }
    }


}