/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Id64String, Logger } from "@szewtwin/core-szewec";
import { IVaultDb } from "../IVaultDb";
import { Model } from "../Model";
import { Element } from "../Element";

export function fmtElement(iVault: IVaultDb, elementId: Id64String): string {
  const el = iVault.elements.getElement(elementId);
  return `${el.id} ${el.classFullName} ${el.getDisplayLabel()}`;
}

export function fmtModel(model: Model): string {
  return `${model.id} ${model.classFullName} ${model.name}`;
}

export function printElementTree(loggerCategory: string, seen: Set<Id64String>, iVault: IVaultDb, elementId: Id64String, indent: number) {
  if (seen.has(elementId)) {
    Logger.logTrace(loggerCategory, `${"\t".repeat(indent)}${fmtElement(iVault, elementId)} (SEEN)`);
    return;
  }

  seen.add(elementId);

  Logger.logTrace(loggerCategory, `${"\t".repeat(indent)}${fmtElement(iVault, elementId)}`);

  for (const child of iVault.elements.queryChildren(elementId)) {
    printElementTree(loggerCategory, seen, iVault, child, indent + 1);
  }

  const subModel = iVault.models.tryGetModel<Model>(elementId);
  if (subModel !== undefined) {
    Logger.logTrace(loggerCategory, `${"\t".repeat(indent)} subModel ${fmtModel(subModel)}:`);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.withPreparedStatement(`select dminstanceid from ${Element.classFullName} where Model.Id = ?`, (stmt) => {
      stmt.bindId(1, subModel.id);
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        printElementTree(loggerCategory, seen, iVault, stmt.getValue(0).getId(), indent + 1);
      }
    });
  }
}
