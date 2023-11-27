// import { default as _wdi5 } from "wdio-ui5-service";

import { DxpEditionType, DxpVersion } from "./types";

export interface SetupOptions {
    wdi5: object;
    browser: any;
    dxpEditionType: DxpEditionType;
    dxpVersion: DxpVersion;
}

export class Environment {

    protected static instance: Environment;


    public static getInstance(): Environment {
        if (!Environment.instance) {
            Environment.instance = new Environment();
        }
        return Environment.instance;
    }
    
    public wdi5!: any;

    public browser!: any;
    public dxpVersion!: DxpVersion;
    public dxpEditionType!: DxpEditionType;
    

    public setup(options: SetupOptions) {
        this.wdi5 = options.wdi5;
        this.browser = options.browser; 
        this.dxpVersion = options.dxpVersion;
        this.dxpEditionType = options.dxpEditionType;
        
    }

}