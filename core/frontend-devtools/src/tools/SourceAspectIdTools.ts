/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { SzewecError } from "@szewtwin/core-szewec";
import { QueryRowFormat } from "@szewtwin/core-common";
import { IVaultApp, NotifyMessageDetails, OutputMessagePriority, Tool } from "@szewtwin/core-frontend";
import { copyStringToClipboard } from "../ClipboardUtilities";
import { parseArgs } from "./parseArgs";

/** Base class for a tool that can convert between source aspect Ids and element Ids.
 * A "source aspect Id" is a string that identifies an object (such as an element) in the source document from which the iVault originated.
 * For example, if the iVault was produced by the Product3 bridge, the source aspect Id is usually a V8 element Id.
 * @beta
 */
export abstract class SourceAspectIdTool extends Tool {
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  protected abstract getDMSql(queryId: string): string;

  public override async run(idToQuery?: string, copyToClipboard?: boolean): Promise<boolean> {
    if (typeof idToQuery === "string")
      await this.doQuery(idToQuery, true === copyToClipboard);

    return true;
  }

  public override async parseAndRun(...keyinArgs: string[]): Promise<boolean> {
    const args = parseArgs(keyinArgs);
    return this.run(args.get("i"), args.getBoolean("c"));
  }

  private async doQuery(queryId: string, copyToClipboard: boolean): Promise<void> {
    const ivault = IVaultApp.viewManager.selectedView?.iVault;
    if (undefined === ivault)
      return;

    let resultId;
    try {
      for await (const row of ivault.createQueryReader(this.getDMSql(queryId), undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames, limit: { count: 1 } }))
        resultId = row.resultId;
    } catch (ex) {
      resultId = SzewecError.getErrorMessage(ex);
    }

    if (typeof resultId !== "string")
      resultId = "NOT FOUND";

    if (copyToClipboard)
      copyStringToClipboard(resultId);

    const message = `${queryId} => ${resultId}`;
    IVaultApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, message));
  }
}

/** Given a source aspect Id, output the Id of the corresponding element in the iVault.
 * A "source aspect Id" is a string that identifies an object (such as an element) in the source document from which the iVault originated.
 * For example, if the iVault was produced by the Product3 bridge, the source aspect Id is usually a V8 element Id.
 * Arguments:
 *  - `id=elementId` where `elementId` is the numeric Id of the element of interest (e.g., `0x13a6c`; decimal notation is also permitted).
 *  - `copy=0|1` where `1` indicates the source aspect Id should be copied to the clipboard.
 * The command outputs to the IVaultApp.notifications the corresponding source aspect Id, or "NOT FOUND".
 * @beta
 */
export class SourceAspectIdFromElementIdTool extends SourceAspectIdTool {
  public static override toolId = "SourceAspectIdFromElementId";

  protected getDMSql(queryId: string): string {
    return `SELECT Identifier as resultId FROM BisCore.ExternalSourceAspect WHERE Element.Id=${queryId} AND [Kind]='Element'`;
  }
}

/** Given the Id of an element in the iVault, output the source aspect Id of the object in the source document from which the element originated.
 * A "source aspect Id" is a string that identifies an object (such as an element) in the source document from which the iVault originated.
 * For example, if the iVault was produced by the Product3 bridge, the source aspect Id is usually a V8 element Id.
 * Arguments:
 *  - `id=sourceAspectId` where `sourceAspectId` is the string identifier of the object of interest.
 *  - `copy=0|1` where `1` indicates the element Id should be copied to the clipboard.
 * The command outputs to the IVaultApp.notifications the corresponding element Id, or "NOT FOUND".
 * @beta
 */
export class ElementIdFromSourceAspectIdTool extends SourceAspectIdTool {
  public static override toolId = "ElementIdFromSourceAspectId";

  protected getDMSql(queryId: string): string {
    return `SELECT Element.Id as resultId FROM BisCore.ExternalSourceAspect WHERE Identifier='${queryId}' AND [Kind]='Element'`;
  }
}
