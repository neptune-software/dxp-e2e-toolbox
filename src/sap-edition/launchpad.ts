import { Launchpad } from "../common/launchpad";
import { DxpEditionType } from "../common/types";
import { SapEditionBuildUrlLaunchpadOptions } from "./urlhelper";


export interface LaunchpadOpenOptionsSapEdition extends Omit<SapEditionBuildUrlLaunchpadOptions, 'dxpEditionType'> {

}

export interface AppCacheTile {
  IMAGEDATA: string
  ICON_IMAGEDATA: string
  IMAGE_CONTENT: string
  STATEFUL: boolean
  PARENTS: string
  URL_LONG: string
  TILE_HELP_TEXT: string
  APP_FULL_SCREEN: boolean
  CHART_GUID: string
  MANIFEST: string
  NEW_TILE: boolean
  GUID: string
  NAME: string
  APPLID: string
  ACTIVATED: boolean
  TILE_ICON: string
  TILE_INFO: string
  TILE_TITLE: string
  TILE_TYPE: string
  TILE_NUMBER: string
  TILE_UNIT: string
  TILE_INFOSTATE: string
  UPDDAT: string
  UPDTIM: string
  UPDNAM: string
  CREDAT: string
  CRETIM: string
  CRENAM: string
  SORT: string
  VISIBLE_ALL: boolean
  URL_EXTERNAL: string
  URL_WINDOW: boolean
  SAP_TRANS: string
  SAP_TRANS_WINDOW: boolean
  PARENT: string
  SUB_MENU: boolean
  NUMBER_AJAX_ID: string
  NUMBER_APPLID: string
  TILE_INDICATOR: string
  TILE_VALUECOLOR: string
  ITEM_TYPE: string
  CATEGORY: string
  TILE_FRAMETYPE: string
  TILE_FOOTER: string
  TILE_CONTENT: string
  TILE_BACKIMAGE: string
  TILE_VALUE1: string
  TILE_VALUE2: string
  TILE_VALUE3: string
  TILE_COLOR1: string
  TILE_COLOR2: string
  TILE_COLOR3: string
  TILE_TITLE1: string
  TILE_TITLE2: string
  TILE_TITLE3: string
  AJAX_TIMER: string
  HIDE_HEADER_L: boolean
  HIDE_HEADER_M: boolean
  HIDE_HEADER_S: boolean
  TIMESTAMP: number
  TILE_NUMBER_ADD: boolean
  URL_EXPAND: boolean
  DOC_URL: boolean
  APP_DIALOG: boolean
  URL_DIALOG: boolean
  HIDE_ON_DESKTOP: boolean
  HIDE_ON_TABLET: boolean
  HIDE_ON_MOBILE: boolean
  APPLID_PARAMS: string
  FIORI_TILE_URL: string
  URL_ALIAS: string
  APPLID_SIDEPANEL: string
  SIDEPANEL_TITLE: string
  ENABLE_DOC: boolean
  PREVENT_DIALOG: boolean
  NAV_OBJECT: string
  NAV_ACTION: string
  DIALOG_WIDTH: string
  DIALOG_HEIGHT: string
  NO_ACTION: boolean
  SAP_TRANS_RFC: string
  TAGS: string
  BACK_COLOR: string
  BACK_SHADE: string
  TITLE_LEVEL: string
  TITLE_ALIGN: string
  STYLECLASS: string
  TILEGROUP: string
  BACK_WIDTH: string
  FORCE_ROW: boolean
  INCL_DESCR: boolean
  APPLID_TILE: string
  CUSTOM_COLORSET: boolean
  MOB_FULL_WIDTH: boolean
  TILE_ACTION_TYPE: boolean
  APP_FILL: boolean
  TILE_HELP: boolean
  USE_ICON_IMAGE: boolean
  TILE_ICON_IMAGE: string
  FIT_TILE_CONTENT: boolean
  TILE_BACK_PLACE: string
  TILE_BACK_REPEAT: string
  TILE_BACK_SIZE: string
  OPEN_BUTTON_TEXT: string
  OPEN_BUTTON_ICON: string
  OPEN_BUTTON_NOTX: boolean
  APPLID_TILE_PARA: string
  DYNAMIC_TYPE: string
  ACTION_TYPE: string
  MOBILE_CLIENT: string
  FIORI_STYLE: boolean
  MSGNO: string
  IC_RFCDEST: string
  IC_CLASS: string
  IC_METHOD: string
  IC_PARAMETER: string
  TILE_HEIGHT: string
  TILE_SCALE: string
  NEPTUNE_COLORSET: boolean
  TILE_DETAILS: string
  TILE_SIDETITLE1: string
  TILE_SIDENUMBER1: string
  TILE_SIDEUNIT1: string
  TILE_SIDETITLE2: string
  TILE_SIDENUMBER2: string
  TILE_SIDEUNIT2: string
  NUMERIC_CLASSIC: boolean
  ABAP_REPORT: string
  ABAP_VARIANT: string
  ABAP_VARIANT_MOB: string
  ABAP_SKIP_SEL: boolean
  ABAP_SKIP_SELMOB: boolean
  ABAP_HIDE_SVARI: boolean
  ICON_INLINE: boolean
  TILE_BACK_TYPE: string
  TILE_BACK_HEIGHT: string
  HIDE_ON_CORDOVA: boolean
  MENU_TEXT: string
  HIDE_FROM_MENUS: boolean
  NUMERIC_SHORT: boolean
  ABAP_REPORT_RFC: string
  TILE_ICON_IMAGED: string
  BLOCK_WIN_CHROME: boolean
  BLOCK_WIN_EDGE: boolean
  BLOCK_WIN_FF: boolean
  BLOCK_WIN_IE: boolean
  BLOCK_WIN_OPERA: boolean
  BLOCK_MAC_CHROME: boolean
  BLOCK_MAC_OPERA: boolean
  BLOCK_MAC_SAFARI: boolean
  TILE_BACKIMAGED: string
  TILE_LAYOUT: string
  TILE_LAYOUT_DARK: string
  TILE_DISP_VALUE1: string
  TILE_DISP_VALUE2: string
  TILE_DISP_VALUE3: string
  IMG_SHAPE_CIRCLE: boolean
  ICON_PLACEMENT: string
  TITLE_LEVEL_SUB: string
  RSS_PLAY_SPEED: string
  RSS_ORDER_BY: string
  RSS_ASCENDING: boolean
  RSS_COUNT: string
  RSS_TITLE_HIDE: boolean
  RSS_DESCR_HIDE: boolean
  RSS_THUMB_HIDE: boolean
  RSS_PUBDA_HIDE: boolean
  RSS_MAX_HEIGHT: string
  RSS_ONLY_IMAGE: boolean
  RSS_USE_CONTENT: boolean
  ICON_ONLY_MENU: boolean
  PLAIN_BACKGROUND: boolean
  CSS: string
  TILE_TEXT: string
  SVG_XLINK_ID: string
  SVG_XLINK_CLASS: string
  SVG_XLINK_BOX: string
  SVG_XLINK_RATIO: string
  SIDEPANEL_PARAMS: string
}

export type AppCacheTiles = AppCacheTile[];


/**
 * Enum for Possible Page Objects shown in the AppCacheNav navigation obj
 * @readonly
 * @enum {string}
 */
export enum AppCacheNavScreens {
  /** @member {string} */
  /** Basic Logon Screen that shows Username and Password. */
  AppCache_boxLogon = "AppCache_boxLogon",

  /** @member {string} */
  /** Screen that is shown when password change is necessray */
  AppCache_boxPassword = "AppCache_boxPassword",

  /** @member {string} */
  /** Screen that is shown when a user needs to define a Pincode */
  AppCache_boxPasscode = "AppCache_boxPasscode",

  /** @member {string} */
  /** Screen that is shown when a user needs to enter a predefined Pincode (shows the numbPad basically)  */
  AppCache_boxPasscodeEntry = "AppCache_boxPasscodeEntry",

  /** @member {string} */
  /** User Overview Screen  */
  AppCache_boxUsers = "AppCache_boxUsers",

  /** @member {string} */
  /** Captcha Screen  */
  AppCache_boxCaptcha = "AppCache_boxCaptcha",

  /** @member {string} */
  /** Launchpad  */
  AppCachePageMenu = "AppCachePageMenu",

  /** @member {string} */
  /** A Jsview (so an app seems to be opened)  */
  AppCache_JSVIEW = "__JSVIEW__",

  /** @member {string} */
  /** The Launchpad Screen with the Tiles & Tile Groups  */
  AppCache_LAUNCHPADSCREEN = "__LAUNCHPADSCREEN__",
}

export class LaunchpadSapEdition extends Launchpad {


  static async open(options: LaunchpadOpenOptionsSapEdition): Promise<Launchpad> {

    return Launchpad.open({
      ...options,
      dxpEditionType: DxpEditionType.sapEdition,
    });

  }

}