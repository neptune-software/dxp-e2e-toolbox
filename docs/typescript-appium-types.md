# TypeScript and Appium / wdi5 types

You do **not** need a separate “Appium types” package. The browser instance is already typed for Appium and mobile when you use the right dependencies and `tsconfig` setup.

## Where the types come from

| What | Source |
|------|--------|
| **Appium protocol** (e.g. `terminateApp`, `activateApp`, `background`, `getCurrentPackage`, `getOrientation`, `setOrientation`, `getContexts`, `switchContext`) | **webdriverio** (via `@wdio/protocols` → `AppiumCommands`) |
| **isAndroid / isIOS** | **webdriverio** (via `InstanceBase` → `SessionFlags` from **webdriver**) |
| **Capabilities** (Appium, BrowserStack, etc.) | **@wdio/types** (`VendorExtensions`, `AppiumCapabilities`, `BrowserStackCapabilities`) |
| **wdi5 browser API** (`asControl`, `getUI5Version`, `goTo`, `fe`, etc.) | **wdio-ui5-service** (augments `WebdriverIO.Browser` in `dist/esm/types/browser-commands.d.ts` when the package is in `tsconfig` `types`) |
| **injectUI5** (wdi5) | Added at runtime by **wdio-ui5-service** but **not** declared in their Browser augmentation; we add it in this repo’s minimal augmentation for type safety. |

So the “types package” is:

- **webdriverio** (dev or peer) – gives `WebdriverIO.Browser` with protocol + session flags.
- **@wdio/types** (dev) – gives capability types.
- **wdio-ui5-service** (peer) – add to `tsconfig` `types` so the service’s browser augmentation is loaded (`asControl`, `getUI5Version`, `goTo`, `fe`, etc.). Ensure the package is fully installed (including its `dist/`) so the type definitions are present.

## tsconfig setup

In your **TypeScript project** that uses Appium and/or wdi5, use a `tsconfig` that includes the same “types” as this toolbox (see `tsconfig.base.json`):

```json
{
  "compilerOptions": {
    "types": [
      "node",
      "webdriverio",
      "expect-webdriverio",
      "@wdio/globals/types",
      "wdio-ui5-service"
    ]
  }
}
```

- **webdriverio** – required so `WebdriverIO` and the enhanced `Browser` (with Appium + SessionFlags) are available.
- **wdio-ui5-service** – include if you use wdi5; install it (e.g. as dev dependency) so this type entry resolves.

If you use **@wdio/appium-service** (the one that starts the Appium server), you can add it to `types` as well and install it so typings for the service and config are available:

```json
"types": [
  "node",
  "webdriverio",
  "expect-webdriverio",
  "@wdio/globals/types",
  "@wdio/appium-service",
  "wdio-ui5-service"
]
```

## wdio-ui5-service and browser types

**wdio-ui5-service** does enhance the browser object types. When you add `"wdio-ui5-service"` to your `tsconfig` `types` array and the package is installed (with its `dist/`), the service’s type definitions augment `WebdriverIO.Browser` with:

- `asControl`, `allControls`, `getUI5Version`, `goTo`, `screenshot`, `fe`, `config`, etc.

(See `node_modules/wdio-ui5-service/dist/esm/types/browser-commands.d.ts`.)

The service does **not** declare **`injectUI5`** in that augmentation, even though it adds the method at runtime. This repo therefore adds `Browser.injectUI5` in its own minimal augmentation so that `browser.injectUI5()` is correctly typed. If wdio-ui5-service adds `injectUI5` to their Browser interface in a future version, we can remove it from our augmentation.

## Minimal augmentation in this repo

This repo keeps a small **webdriverio augmentation** in `src/types/webdriverio-augmentation.d.ts` only for:

- **Capabilities.bundleId** – resolved session capabilities sometimes expose `bundleId` without the `appium:` prefix.
- **Browser.injectUI5** – wdio-ui5-service adds this at runtime but does not declare it in their Browser augmentation; we add it here for type safety.

Everything else (Appium commands, `isAndroid`/`isIOS`, wdi5’s `asControl`/`getUI5Version`/etc., and standard capability types) comes from the packages above.
