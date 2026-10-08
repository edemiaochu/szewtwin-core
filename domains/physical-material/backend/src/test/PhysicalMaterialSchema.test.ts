/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "node:path";
import { DbResult } from "@szewtwin/core-szewec";
import { DMSqlStatement, EditTxn, IVaultDb, IVaultHost, IVaultJsFs, PhysicalMaterial, SnapshotDb } from "@szewtwin/core-backend";
import { IVault } from "@szewtwin/core-common";
import { Aggregate, Aluminum, Asphalt, Concrete, PhysicalMaterialSchema, Steel } from "../physical-material-backend";

describe("PhysicalMaterialSchema", () => {
  const outputDir = path.join(__dirname, "output");

  before(async () => {
    await IVaultHost.startup({ cacheDir: path.join(__dirname, ".cache") });
    PhysicalMaterialSchema.registerSchema();
    if (!IVaultJsFs.existsSync(outputDir)) {
      IVaultJsFs.mkdirSync(outputDir);
    }
  });

  function count(iVaultDb: IVaultDb, classFullName: string): number {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return iVaultDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (statement: DMSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
  }

  it("should import", async () => {
    const iVaultFileName: string = path.join(outputDir, "PhysicalMaterialSchema.dtw");
    if (IVaultJsFs.existsSync(iVaultFileName)) {
      IVaultJsFs.removeSync(iVaultFileName);
    }
    const iVaultDb = SnapshotDb.createEmpty(iVaultFileName, { rootSubject: { name: "PhysicalMaterialSchema" }, createClassViews: true });
    const txn = new EditTxn(iVaultDb, "physical-material test");
    txn.start();
    await txn.iVault.importSchemas([PhysicalMaterialSchema.schemaFilePath]);
    for (let i = 1; i <= 3; i++) {
      Aggregate.create(iVaultDb, IVault.dictionaryId, `${Aggregate.className}${i}`).insert(txn);
      Aluminum.create(iVaultDb, IVault.dictionaryId, `${Aluminum.className}${i}`).insert(txn);
      Asphalt.create(iVaultDb, IVault.dictionaryId, `${Asphalt.className}${i}`).insert(txn);
      Concrete.create(iVaultDb, IVault.dictionaryId, `${Concrete.className}${i}`).insert(txn);
      Steel.create(iVaultDb, IVault.dictionaryId, `${Steel.className}${i}`).insert(txn);
    }
    assert.equal(3, count(iVaultDb, Aggregate.classFullName));
    assert.equal(3, count(iVaultDb, Aluminum.classFullName));
    assert.equal(3, count(iVaultDb, Asphalt.classFullName));
    assert.equal(3, count(iVaultDb, Concrete.classFullName));
    assert.equal(3, count(iVaultDb, Steel.classFullName));
    assert.equal(15, count(iVaultDb, PhysicalMaterial.classFullName));
    txn.end();
    iVaultDb.close();
  });
});
