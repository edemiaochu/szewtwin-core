/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as path from "path";
import { CategorySelector, DisplayStyle3d, IVaultDb, ModelSelector, OrthographicViewDefinition, PhysicalModel, SpatialCategory, StandaloneDb, withEditTxn } from "@szewtwin/core-backend";
import { SubCategoryAppearance } from "@szewtwin/core-common";
import { Range3d, StandardViewIndex } from "@szewtwin/core-geometry";
import { CreateNewIVaultArgs, CreateNewIVaultResult } from "../common/DtaIpcInterface";

/** Appends a ".dtw" extension to `filePath` if it does not already end in ".dtw". */
function normalizeFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ".dtw" === ext ? filePath : `${filePath}.dtw`;
}

/** Creates a new, empty, editable standalone iVault (.dtw) file on disk, initialized with a default
 * PhysicalModel, SpatialCategory, and spatial view so that editing tools work immediately after opening.
 */
export function createNewIVault(args: CreateNewIVaultArgs): CreateNewIVaultResult {
  const filePath = normalizeFilePath(args.filePath);
  if (fs.existsSync(filePath))
    throw new Error(`File already exists: ${filePath}`);

  const name = args.name ?? path.basename(filePath, path.extname(filePath));
  const db = StandaloneDb.createEmpty(filePath, {
    rootSubject: { name },
    enableTransactions: true,
  });

  const { defaultModelId, defaultCategoryId, defaultViewId } = withEditTxn(db, (txn) => {
    const defaultCategoryId = SpatialCategory.insert(txn, IVaultDb.dictionaryId, "Default", new SubCategoryAppearance());
    const defaultModelId = PhysicalModel.insert(txn, IVaultDb.rootSubjectId, "Default");

    // Create a default spatial view that displays the new model and category.
    const modelSelectorId = ModelSelector.insert(txn, IVaultDb.dictionaryId, "Default", [defaultModelId]);
    const categorySelectorId = CategorySelector.insert(txn, IVaultDb.dictionaryId, "Default", [defaultCategoryId]);
    const displayStyleId = DisplayStyle3d.insert(txn, IVaultDb.dictionaryId, "Default");
    const defaultViewId = OrthographicViewDefinition.insert(txn, IVaultDb.dictionaryId, "Default View", modelSelectorId, categorySelectorId, displayStyleId, new Range3d(-100, -100, -100, 100, 100, 100), StandardViewIndex.Iso);

    return { defaultModelId, defaultCategoryId, defaultViewId };
  });

  // setDefaultViewId writes via the implicit txn, so it must be called outside the EditTxn above.
  db.views.setDefaultViewId(defaultViewId);

  db.close(); // All changes are saved; close it so the frontend can open it.

  return { filePath, defaultModelId, defaultCategoryId };
}
