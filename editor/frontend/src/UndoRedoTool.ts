/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Editing
 */

import { IVaultApp, IpcApp, Tool } from "@szewtwin/core-frontend";

/** Undo all element changes
 * @beta
 */
export class UndoAllTool extends Tool {
  public static override toolId = "UndoAll";
  public override async run(): Promise<boolean> {
    const ivault = IVaultApp.viewManager.selectedView?.view.iVault;
    if (undefined === ivault || ivault.isReadonly || !ivault.isBriefcaseConnection)
      return true;

    await IpcApp.appFunctionIpc.reverseAllTxn(ivault.key);
    return true;
  }
}

/** Undo active tool steps, or element changes
 * @beta
 */
export class UndoTool extends Tool {
  public static override toolId = "Undo";
  public override async run(): Promise<boolean> {
    await IVaultApp.toolAdmin.doUndoOperation();
    return true;
  }
}

/** Redo active tool steps, or element changes
 * @beta
 */
export class RedoTool extends Tool {
  public static override toolId = "Redo";
  public override async run(): Promise<boolean> {
    await IVaultApp.toolAdmin.doRedoOperation();
    return true;
  }
}

