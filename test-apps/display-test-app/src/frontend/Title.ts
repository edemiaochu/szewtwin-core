/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { OpenMode } from "@szewtwin/core-szewec";
import { IVaultConnection } from "@szewtwin/core-frontend";

export function setTitle(ivault: IVaultConnection) {
  let prefix = "";
  if (OpenMode.ReadWrite === ivault.openMode && ivault.isBriefcaseConnection())
    prefix = ivault.editingScope ? "[ EDIT ] " : "[ R/W ] ";

  document.title = `${prefix}${ivault.key} - Display Test App`;
}
