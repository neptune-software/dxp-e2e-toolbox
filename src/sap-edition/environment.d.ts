declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SAP_USER: string;
      SAP_PASSWORD: string;
      SAP_URL: string;
      SAP_CLIENT: string;
      BROWSER_URL: string;
      PERCY_TOKEN: string;
      HEADLESS: string;
      BROWSERSTACK_USERNAME: string;
      BROWSERSTACK_ACCESS_KEY: string;
      NEPTUNE_OKTA_EMAIL1: string;
      NEPTUNE_OKTA_PASSWORD1: string;
      NEPTUNE_OKTA_EMAIL2: string;
      NEPTUNE_OKTA_PASSWORD2: string;
      NEPTUNE_PINCODE: string;
      NEPTUNE_PINCODE2: string;
      NEPTUNE_PINCODE3: string;
      SAP_USERNAME1: string;
      SAP_USERNAME2: string;
      SAP_USER1: string;
      SAP_USER2: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export { };