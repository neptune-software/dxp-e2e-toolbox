declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SAP_USER: string;
      SAP_PASSWORD: string;
      SAP_URL: string;
      SAP_CLIENT: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export { };