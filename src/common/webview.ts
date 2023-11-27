import {Environment} from "./environment";


export class WebView {

  public readonly browser!: any;

  constructor(){
    this.browser = Environment.getInstance().browser;
  }

}