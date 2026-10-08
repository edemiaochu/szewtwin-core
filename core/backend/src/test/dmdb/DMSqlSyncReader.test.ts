/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { QueryOptionsBuilder, QueryRowFormat } from "@szewtwin/core-common";
import { SnapshotDb } from "../../IVaultDb";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { Id64 } from "@szewtwin/core-szewec";

describe("WithQueryReaderTests", () => {
  let iVault: SnapshotDb;

  before(async () => {
    iVault = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("test.dtw"));
  });

  after(async () => {
    iVault.close();
  });
  it("check behvaiour if we call clearCaches in between", () => {
    let actualRowCount = 0;
    const expectedInstanceIds = ["0x1", "0xe", "0x10", "0x11", "0x12",
      "0x13", "0x14", "0x15", "0x16", "0x17"];

    expect(() => iVault.withQueryReader("SELECT * FROM bis.Element", (reader) => {
      let loopCount = 0;
      // First loop - read first 10 rows
      while (loopCount < 10) {
        reader.step()
        actualRowCount++;
        loopCount++;
        assert.isDefined(reader.current[0]);
        assert.equal(reader.current[0], expectedInstanceIds[actualRowCount - 1]);
      }
      assert.equal(loopCount, 10);
      iVault.clearCaches();

      reader.step(); // step should fail after clearCaches
    })).to.throw("Step failed");
  });
  it("should throw error if we try to step on a closed iVaultDb object", () => {
    const ivaultPath = iVault.pathName;
    expect(() => iVault.withQueryReader("SELECT * FROM bis.Element", (reader) => {
      let loopCount = 0;
      while (loopCount < 10) {
        reader.step();
        assert.isDefined(reader.current[0]);
        loopCount++;
      }
      assert.equal(loopCount, 10);
      iVault.close();

      iVault = SnapshotDb.openFile(ivaultPath);
      assert.isDefined(reader.current[0]);
      reader.step(); // step should fail after iVaultDb is closed
    })).to.throw("Statement is not prepared");
  });
  it("returning reader from withQueryReader callback should throw error if we try to step on it", () => {
    const readerObj = iVault.withQueryReader("SELECT * FROM bis.Element", (reader) => {
      reader.step();
      return reader;
    });
    expect(readerObj.current[0]).to.equal("0x1"); // will not throw error as we are just accessing current row
    expect(() => readerObj.step()).to.throw("Statement is not prepared");
  });
  it("checking rowFormat unspecified case - values accessed by index", () => {
    // Default rowFormat is UseDMSqlPropertyIndexes: columns are accessed by their SELECT-order index.
    iVault.withQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element", (reader) => {
      assert.isTrue(reader.step());
      const id: string = reader.current[0];
      const classId: string = reader.current[1];
      assert.isTrue(Id64.isValid(classId));
      assert.isTrue(Id64.isValid(id));
      assert.equal(id, "0x19");
    });
  });

  it("checking rowFormat UseDMSqlPropertyIndexes - values accessed by index", () => {
    const config = new QueryOptionsBuilder().setRowFormat(QueryRowFormat.UseDMSqlPropertyIndexes).getOptions();
    iVault.withQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element", (reader) => {
      assert.isTrue(reader.step());
      // Index 0 → DMInstanceId, index 1 → DMClassId
      const id: string = reader.current[0];
      const classId: string = reader.current[1];
      assert.equal(id, "0x19");
      assert.isTrue(Id64.isValid(classId));
      // Swapping column order changes index, not value
    }, undefined, config);
  });

  it("checking rowFormat UseDMSqlPropertyNames - values accessed by DMSQL property name", () => {
    const config = new QueryOptionsBuilder().setRowFormat(QueryRowFormat.UseDMSqlPropertyNames).getOptions();
    iVault.withQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element", (reader) => {
      assert.isTrue(reader.step());
      const id: string = reader.current.DMInstanceId;
      const classId: string = reader.current.DMClassId;
      assert.equal(id, "0x19");
      assert.isTrue(Id64.isValid(classId));
    }, undefined, config);
  });

  it("checking rowFormat UseJsPropertyNames - values accessed by JavaScript property name", () => {
    const config = new QueryOptionsBuilder().setRowFormat(QueryRowFormat.UseJsPropertyNames).getOptions();
    iVault.withQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element", (reader) => {
      assert.isTrue(reader.step());
      // DMInstanceId → id, DMClassId → className (resolved to a fully-qualified class name string)
      const id: string = reader.current.id;
      const className: string = reader.current.className;
      assert.equal(id, "0x19");
      // className should be in the form "SchemaName.ClassName"
      assert.equal(className, "BisCore.DrawingCategory");
    }, undefined, config);
  });

  it("checking rowFormat UseDMSqlPropertyNames with convertClassIdsToClassNames - DMClassId returned as class name string", () => {
    const config = new QueryOptionsBuilder()
      .setRowFormat(QueryRowFormat.UseDMSqlPropertyNames)
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      .setConvertClassIdsToNames(true)
      .getOptions();
    iVault.withQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element", (reader) => {
      assert.isTrue(reader.step());
      const id: string = reader.current.DMInstanceId;
      const classId: string = reader.current.DMClassId;
      assert.equal(id, "0x19");
      // With convertClassIdsToClassNames, DMClassId is resolved to "SchemaName.ClassName" instead of an Id
      assert.equal(classId, "BisCore.DrawingCategory");
    }, undefined, config);
  });
});
