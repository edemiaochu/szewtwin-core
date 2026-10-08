/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BrowserAuthorizationClient } from "@szewtwin/browser-authorization";

/** Global information on the currently opened iVault and the state of the view. */
export class SimpleViewState {
  public oidcClient?: BrowserAuthorizationClient;
  constructor() { }
}
