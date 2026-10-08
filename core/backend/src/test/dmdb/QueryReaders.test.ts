/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Id64, Id64String } from "@szewtwin/core-szewec";
import { Code, ColorDef, DMSqlReader, IVault, PhysicalElementProps, QueryBinder, QueryOptionsBuilder, QueryRowFormat, QueryRowProxy } from "@szewtwin/core-common";
import { DefinitionModel, DMSqlInsertResult, DMSqlSyncReader, ElementTreeDeleter, ElementTreeWalkerScope, PhysicalModel, PhysicalObject, SnapshotDb, Subject } from "../../core-backend";
import { DMSqlWriteStatement } from "../../DMSqlStatement";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { DMDbTestHelper } from "./DMDbTestHelper";
import { Range3d } from "@szewtwin/core-geometry";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { withEditTxn } from "../../EditTxn";
chai.use(chaiAsPromised);
const assert = chai.assert;
const expect = chai.expect;


describe("QueryReaders - createQueryReader() and withQueryReader() api tests", (() => {
  let iVault: SnapshotDb;

  before(async () => {
    iVault = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("test.dtw"));
  });

  after(async () => {
    iVault.close();
  });

  describe("bind Id64 enumerable", async () => {
    const outDir = KnownTestLocations.outputDir;

    it("dmsql reader simple", async () => {
      using dmdb = DMDbTestHelper.createDMDb(outDir, "test.dmdb",
        `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="Foo" modifier="Sealed">
            <DMProperty propertyName="n" typeName="int"/>
          </DMEntityClass>
        </DMSchema>`);
      assert.isTrue(dmdb.isOpen);
      dmdb.saveChanges();
      const params = new QueryBinder();
      params.bindIdSet(1, ["0x32"]);
      const optionBuilder = new QueryOptionsBuilder();
      optionBuilder.setRowFormat(QueryRowFormat.UseJsPropertyNames);
      const readerCallback = async (readerObj: DMSqlReader) => {
        const rows = await readerObj.toArray();
        assert.equal(rows[0].id, "0x32");
        assert.equal(rows.length, 1);
      }
      const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
        const rows = syncReader.toArray();
        assert.equal(rows[0].id, "0x32");
        assert.equal(rows.length, 1);
      }
      dmdb.withQueryReader("SELECT DMInstanceId, Name FROM meta.DMClassDef WHERE InVirtualSet(?, DMInstanceId)", syncReaderCallback, params, optionBuilder.getOptions());
      const reader = dmdb.createQueryReader("SELECT DMInstanceId, Name FROM meta.DMClassDef WHERE InVirtualSet(?, DMInstanceId)", params, optionBuilder.getOptions());
      await readerCallback(reader);
    });

    it("dmsql reader simple for IdSet", async () => {
      using dmdb = DMDbTestHelper.createDMDb(outDir, "test.dmdb",
        `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="Foo" modifier="Sealed">
            <DMProperty propertyName="n" typeName="int"/>
          </DMEntityClass>
        </DMSchema>`);
      assert.isTrue(dmdb.isOpen);
      dmdb.saveChanges();
      const params = new QueryBinder();
      params.bindIdSet(1, ["0x32"]);
      const optionBuilder = new QueryOptionsBuilder();
      optionBuilder.setRowFormat(QueryRowFormat.UseJsPropertyNames);
      const readerCallback = async (readerObj: DMSqlReader) => {
        const rows = await readerObj.toArray();
        assert.equal(rows[0].id, "0x32");
        assert.equal(rows.length, 1);
      }
      const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
        const rows = syncReader.toArray();
        assert.equal(rows[0].id, "0x32");
        assert.equal(rows.length, 1);
      }
      dmdb.withQueryReader("SELECT DMInstanceId, Name FROM meta.DMClassDef, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", syncReaderCallback, params, optionBuilder.getOptions());
      const reader = dmdb.createQueryReader("SELECT DMInstanceId, Name FROM meta.DMClassDef, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", params, optionBuilder.getOptions());
      await readerCallback(reader);
    });

    it("bindIdSet not working with integer Ids", async () => {
      using dmdb = DMDbTestHelper.createDMDb(outDir, "test.dmdb",
        `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="Foo" modifier="Sealed">
            <DMProperty propertyName="n" typeName="int"/>
          </DMEntityClass>
        </DMSchema>`)
      assert.isTrue(dmdb.isOpen);
      dmdb.saveChanges();
      const params = new QueryBinder();
      params.bindIdSet(1, ["50"]);
      const optionBuilder = new QueryOptionsBuilder();
      optionBuilder.setRowFormat(QueryRowFormat.UseJsPropertyNames);
      const readerCallback = async (readerObj: DMSqlReader) => {
        const rows = await readerObj.toArray();
        assert.equal(rows.length, 0);
      }
      const syncreaderCallback = (syncReader: DMSqlSyncReader) => {
        const rows = syncReader.toArray();
        assert.equal(rows.length, 0);
      }
      dmdb.withQueryReader("SELECT DMInstanceId, Name FROM meta.DMClassDef WHERE InVirtualSet(?, DMInstanceId)", syncreaderCallback, params, optionBuilder.getOptions());
      const reader = dmdb.createQueryReader("SELECT DMInstanceId, Name FROM meta.DMClassDef WHERE InVirtualSet(?, DMInstanceId)", params, optionBuilder.getOptions());
      await readerCallback(reader);
    });

    it("dmsql reader simple using query reader", async () => {
      using dmdb = DMDbTestHelper.createDMDb(outDir, "test.dmdb",
        `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="Foo" modifier="Sealed">
            <DMProperty propertyName="n" typeName="int"/>
          </DMEntityClass>
        </DMSchema>`);
      assert.isTrue(dmdb.isOpen);

      const insertResult = await dmdb.withCachedWriteStatement("INSERT INTO ts.Foo(n) VALUES(20)", async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      dmdb.saveChanges();
      assert.equal(insertResult.status, DbResult.BE_SQLITE_DONE);
      assert.equal(insertResult.id, "0x1");

      const params = new QueryBinder();
      params.bindId("firstId", insertResult.id!);
      const resultAssertCallback = (queryReader: DMSqlReader | DMSqlSyncReader) => {
        assert.equal(queryReader.current.id, "0x1");
        assert.equal(queryReader.current.dminstanceid, "0x1");
        assert.equal(queryReader.current.n, 20);
        assert.equal(queryReader.current.ID, "0x1");
        assert.equal(queryReader.current.DMINSTANCEID, "0x1");
        assert.equal(queryReader.current[0], "0x1");
        assert.equal(queryReader.current[1], 20);

        const row0 = queryReader.current.toRow();
        assert.equal(row0.DMInstanceId, "0x1");
        assert.equal(row0.n, 20);
      }
      const readerCallback = async (readerObj: DMSqlReader) => {
        assert.isTrue(await readerObj.step());
        resultAssertCallback(readerObj);
        assert.isFalse(await readerObj.step());
      }
      const synReaderCallback = (syncReader: DMSqlSyncReader) => {
        assert.isTrue(syncReader.step());
        resultAssertCallback(syncReader);
        assert.isFalse(syncReader.step());
      }
      dmdb.withQueryReader("SELECT DMInstanceId, n FROM ts.Foo WHERE DMInstanceId=:firstId LIMIT 1", synReaderCallback, params);
      const reader = dmdb.createQueryReader("SELECT DMInstanceId, n FROM ts.Foo WHERE DMInstanceId=:firstId", params, { limit: { count: 1 } });
      await readerCallback(reader);
    });

    it("dmsql reader simple using query row reader", async () => {
      // Use existing element from test.dtw
      const elementId = "0x1";
      const params = new QueryBinder();
      params.bindId("firstId", elementId);
      const resultAssertCallback = (queryReader: DMSqlReader | DMSqlSyncReader) => {
        assert.equal(queryReader.current.id, "0x1");
        assert.equal(queryReader.current.dminstanceid, "0x1");
        assert.isDefined(queryReader.current.dmclassid);
        assert.equal(queryReader.current.ID, "0x1");
        assert.equal(queryReader.current.DMINSTANCEID, "0x1");
        assert.equal(queryReader.current[0], "0x1");
        assert.isDefined(queryReader.current[1]);

        const row0 = queryReader.current.toRow();
        assert.equal(row0.DMInstanceId, "0x1");
        assert.isDefined(row0.DMClassId);
      }
      const readerCallback = async (readerObj: DMSqlReader) => {
        assert.isTrue(await readerObj.step());
        resultAssertCallback(readerObj);
        assert.isFalse(await readerObj.step());
      }
      const synReaderCallback = (syncReader: DMSqlSyncReader) => {
        assert.isTrue(syncReader.step());
        resultAssertCallback(syncReader);
        assert.isFalse(syncReader.step());
      }
      iVault.withQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element WHERE DMInstanceId=:firstId", synReaderCallback, params);
      const reader = iVault.createQueryReader("SELECT DMInstanceId, DMClassId FROM bis.Element WHERE DMInstanceId=:firstId", params, { limit: { count: 1 } });
      await readerCallback(reader);
    });

    it("should bind Range3d", async () => {
      const testRange = new Range3d(1.2, 2.3, 3.4, 4.5, 5.6, 6.7);

      using dmdb = DMDbTestHelper.createDMDb(outDir, "bindrange3d.dmdb",
        `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="Range3d" typeName="binary"/>
        </DMEntityClass>
       </DMSchema>`);

      assert.isTrue(dmdb.isOpen);

      dmdb.withCachedWriteStatement("INSERT INTO test.Foo([Range3d]) VALUES(?)", (stmt: DMSqlWriteStatement) => {
        stmt.bindRange3d(1, testRange);
        const res: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      });
      dmdb.saveChanges();

      const params = new QueryBinder();
      params.bindRange3d(1, testRange);
      const reader = dmdb.createQueryReader("SELECT DMInstanceId, [Range3d] FROM test.Foo WHERE Range3d=?", params);

      const rows = await reader.toArray();
      const rangeBlob: Uint8Array = rows[0][1];
      const rangeFloatArray = new Float64Array(rangeBlob.buffer);
      assert.equal(rangeFloatArray.length, 6);
      const actualRange = new Range3d(...rangeFloatArray);
      assert.isTrue(actualRange.isAlmostEqual(testRange));
    });

  });

  describe("Works as iterable iterator", () => {

    it("iterable in for loop", async () => {
      const expectedRowCount = 46; // 46 Elements in test.dtw
      const readerCallback = async (readerObj: DMSqlReader) => {
        let actualRowCount = 0;
        for await (const row of readerObj) {
          actualRowCount++;
          assert.isDefined(row[0]);
        }
        assert.equal(actualRowCount, expectedRowCount);
      }
      const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
        let actualRowCount = 0;
        for (const row of syncReader) {
          actualRowCount++;
          assert.isDefined(row[0]);
        }
        assert.equal(actualRowCount, expectedRowCount);
      }
      iVault.withQueryReader("SELECT * FROM bis.Element", syncReaderCallback);
      const reader = iVault.createQueryReader("SELECT * FROM bis.Element");
      await readerCallback(reader);
    });

    it("iterable with .next()", async () => {
      const readerCallback = async (readerObj: DMSqlReader) => {
        let row: any;
        let actualRowCount = 0;
        while ((row = await readerObj.next()).done === false) {
          actualRowCount++;
          assert.equal(row.value[0], `0x${actualRowCount}`);
        }
        assert.equal(actualRowCount, 5);
      }
      const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
        let row: any;
        let actualRowCount = 0;
        while ((row = syncReader.next()).done === false) {
          actualRowCount++;
          assert.equal(row.value[0], `0x${actualRowCount}`);
        }
        assert.equal(actualRowCount, 5);
      }
      iVault.withQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback);
      const reader = iVault.createQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 } });
      await readerCallback(reader);
    });

    it("Should not fail on empty array", async () => {
      const idSet: Id64String[] = [];
      const binder = QueryBinder.from([idSet]);
      const reader = iVault.createQueryReader("SELECT DMInstanceId, DMClassId, Name from dmdbf.ExternalFileInfo WHERE InVirtualSet(?, DMInstanceId)", binder);
      assert.isFalse(await reader.step());
    });

  });

  describe("Common usages", () => {

    describe("Get all rows", () => {
      const expectedRowCount = 46; // 46 Elements in test.dtw

      it("Get all rows using iterable iterator", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          let rowCount = 0;
          for await (const _row of readerObj) {
            rowCount++;
          }
          assert.equal(rowCount, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let rowCount = 0;
          for (const _row of syncReader) {
            rowCount++;
          }
          assert.equal(rowCount, expectedRowCount);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element");
        await readerCallback(reader);
      });

      it("Get all rows using step", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          let rowCount = 0;
          while (await readerObj.step()) {
            rowCount++;
          }
          assert.equal(rowCount, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let rowCount = 0;
          while (syncReader.step()) {
            rowCount++;
          }
          assert.equal(rowCount, expectedRowCount);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element");
        await readerCallback(reader);
      });

      it("Get all rows using toArray", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const rows = await readerObj.toArray();
          assert.equal(rows.length, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const rows = syncReader.toArray();
          assert.equal(rows.length, expectedRowCount);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element");
        await readerCallback(reader);
      });

    });

    describe("Get id from each row", () => {

      it("Get id using iterable iterator with unspecified rowFormat", async () => {
        const resultAssertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 } });
        await readerCallback(reader);
      });

      it("Get id using iterable iterator with UseJsPropertyNames rowFormat", async () => {
        const resultAssertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().id, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseJsPropertyNames });
        await readerCallback(reader);
      });

      it("Get id using iterable iterator with UseDMSqlPropertyNames rowFormat", async () => {
        const resultAssertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        await readerCallback(reader);
      });

      it("Get id using iterable iterator with UseDMSqlPropertyIndexes rowFormat", async () => {
        const resultAssertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncreaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncreaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        await readerCallback(reader);
      });

      it("Get id using step with unspecified rowFormat", async () => {
        const resultAssertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().DMInstanceId, expectedId);
        }

        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const synReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }

        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", synReaderCallback);
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 } });
        await readerCallback(reader);
      });

      it("Get id using step with UseJsPropertyNames rowFormat", async () => {
        const resultAssertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().id, expectedId);
        }

        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultAssertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseJsPropertyNames });
        await readerCallback(reader);
      });

      it("Get id using step with UseDMSqlPropertyNames rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        await readerCallback(reader);
      });

      it("Get id using step with UseDMSqlPropertyIndexes rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM meta.DMSchemaDef LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        const reader = iVault.createQueryReader("SELECT * FROM meta.DMSchemaDef", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        await readerCallback(reader);
      });
    });

    describe("Get duplicate property names", () => {

      it("Get duplicate property names using iterable iterator with unspecified rowFormat", async () => {
        const expectedIds = ["0x1", "0xe", "0x10", "0x11", "0x12"];
        const resultassertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId LIMIT 5", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId", undefined, { limit: { count: 5 } });
        await readerCallback(reader);
      });

      it("Get duplicate property names using iterable iterator with UseJsPropertyNames rowFormat", async () => {
        const expectedIds = ["0x1", "0xe", "0x10", "0x11", "0x12"];
        const resultassertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().id, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseJsPropertyNames });
        await readerCallback(reader);
      });

      it("Get duplicate property names using iterable iterator with UseDMSqlPropertyNames rowFormat", async () => {
        const expectedIds = ["0x1", "0xe", "0x10", "0x11", "0x12"];
        const resultassertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        await readerCallback(reader);
      });

      it("Get duplicate property names using iterable iterator with UseDMSqlPropertyIndexes rowFormat", async () => {
        const expectedIds = ["0x1", "0xe", "0x10", "0x11", "0x12"];
        const resultassertCallback = (row: QueryRowProxy, expectedId: string) => {
          assert.equal(row[0], expectedId);
          assert.equal(row.id, expectedId);
          assert.equal(row.dminstanceid, expectedId);
          assert.equal(row.DMINSTANCEID, expectedId);
          assert.equal(row.DMInstanceId, expectedId);
          assert.equal(row.toArray()[0], expectedId);
          assert.equal(row.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          for await (const row of readerObj) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncreaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          for (const row of syncReader) {
            const currentExpectedId = expectedIds[counter - 1];
            resultassertCallback(row, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId LIMIT 5", syncreaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        const reader = iVault.createQueryReader("SELECT * FROM bis.Element c JOIN bis.Element p ON p.DMInstanceId = c.DMInstanceId", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        await readerCallback(reader);
      });
    });

    describe("Get specific values", () => {

      it("Get only DMInstanceId with unspecified rowFormat", async () => {
        const resuktassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().DMInstanceId, expectedId);
        }

        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resuktassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resuktassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 } });
        await readerCallback(reader);
      });

      it("Get only DMInstanceId with UseJsPropertyNames rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().id, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const reader = iVault.createQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseJsPropertyNames });
        await readerCallback(reader);
      });

      it("Get only DMInstanceId with UseDMSqlPropertyNames rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        const reader = iVault.createQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        await readerCallback(reader);
      });

      it("Get only DMInstanceId with UseDMSqlPropertyIndexes rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.id, expectedId);
          assert.equal(queryReader.current.dminstanceid, expectedId);
          assert.equal(queryReader.current.DMINSTANCEID, expectedId);
          assert.equal(queryReader.current.DMInstanceId, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().DMInstanceId, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        const reader = iVault.createQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        await readerCallback(reader);
      });

      it("Get one column with custom name with unspecified rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.customColumnName, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().customColumnName, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 } });
        await readerCallback(reader);
      });

      it("Get one column with custom name with UseJsPropertyNames rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.customColumnName, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().customColumnName, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const reader = iVault.createQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseJsPropertyNames });
        await readerCallback(reader);
      });

      it("Get one column with custom name with UseDMSqlPropertyNames rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.customColumnName, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().customColumnName, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        const reader = iVault.createQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
        await readerCallback(reader);
      });

      it("Get one column with custom name with UseDMSqlPropertyIndexes rowFormat", async () => {
        const resultassertCallback = (queryReader: DMSqlReader | DMSqlSyncReader, expectedId: string) => {
          assert.equal(queryReader.current[0], expectedId);
          assert.equal(queryReader.current.customColumnName, expectedId);
          assert.equal(queryReader.current.toArray()[0], expectedId);
          assert.equal(queryReader.current.toRow().customColumnName, expectedId);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          let counter = 1;
          let rowCount = 0;
          while (await readerObj.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(readerObj, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let counter = 1;
          let rowCount = 0;
          while (syncReader.step()) {
            const currentExpectedId = `0x${counter}`;
            resultassertCallback(syncReader, currentExpectedId);
            counter++;
            rowCount++;
          }
          assert.equal(rowCount, 5);
        }
        iVault.withQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC LIMIT 5", syncReaderCallback, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        const reader = iVault.createQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", undefined, { limit: { count: 5 }, rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes });
        await readerCallback(reader);
      });
    });

    describe("Get count of results", () => {
      const expectedRowCount = 46; // 46 Elements in test.dtw
      const sql = "SELECT COUNT(*) numResults FROM (SELECT * FROM bis.Element)";

      it("Get count of rows using current index", async () => {
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          syncReader.step();
          assert.equal(syncReader.current[0] as number, expectedRowCount);
        }
        const readerCallback = async (readerObj: DMSqlReader) => {
          await readerObj.step();
          assert.equal(readerObj.current[0] as number, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

      it("Get count of rows using current column name", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          await readerObj.step();
          assert.equal(readerObj.current.numResults as number, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          syncReader.step();
          assert.equal(syncReader.current.numResults as number, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

      it("Get count of rows using current and toRow", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          await readerObj.step();
          assert.equal(readerObj.current.toRow().numResults as number, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          syncReader.step();
          assert.equal(syncReader.current.toRow().numResults as number, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

      it("Get count of rows using toArray result itself", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          await readerObj.step();
          assert.equal(readerObj.current.toArray()[0] as number, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          syncReader.step();
          assert.equal(syncReader.current.toArray()[0] as number, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

      it("Get count of rows using iterable iterator and index", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          let count = 0;
          for await (const row of readerObj) {
            count = row[0] as number;
          }
          assert.equal(count, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let count = 0;
          for (const row of syncReader) {
            count = row[0] as number;
          }
          assert.equal(count, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

      it("Get count of rows using iterable iterator and column name", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          let count = 0;
          for await (const row of readerObj) {
            count = row.numResults as number;
          }
          assert.equal(count, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let count = 0;
          for (const row of syncReader) {
            count = row.numResults as number;
          }
          assert.equal(count, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

      it("Get count of rows using iterable iterator and toRow", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          let count = 0;
          for await (const row of readerObj) {
            count = row.toRow().numResults;
          }
          assert.equal(count, expectedRowCount);
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          let count = 0;
          for (const row of syncReader) {
            count = row.toRow().numResults;
          }
          assert.equal(count, expectedRowCount);
        }
        iVault.withQueryReader(sql, syncReaderCallback);
        const reader = iVault.createQueryReader(sql);
        await readerCallback(reader);
      });

    });

    describe("Tests for extendedType and extendType property behaviour of QueryPropertyMetaData", () => {

      it("Id type column with alias", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal("Id", metaData[0].extendedType);
          assert.equal("Id", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal("Id", metaData[0].extendedType);
          assert.equal("Id", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT DMInstanceId customColumnName FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC");
        await readerCallback(reader);
      });

      it("Id type column without alias", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal("Id", metaData[0].extendedType);
          assert.equal("Id", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal("Id", metaData[0].extendedType);
          assert.equal("Id", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT DMInstanceId FROM meta.DMSchemaDef ORDER BY DMInstanceId ASC");
        await readerCallback(reader);
      });

      it("ClassId type column", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal("ClassId", metaData[0].extendedType);
          assert.equal("ClassId", metaData[0].extendType);    // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal("ClassId", metaData[0].extendedType);
          assert.equal("ClassId", metaData[0].extendType);    // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("SELECT DMClassId FROM bis.Element ORDER BY DMClassId ASC", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT DMClassId FROM bis.Element ORDER BY DMClassId ASC");
        await readerCallback(reader);
      });

      it("Column without extended type", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal(undefined, metaData[0].extendedType);
          assert.equal("", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal(undefined, metaData[0].extendedType);
          assert.equal("", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("SELECT s.Name FROM meta.DMSchemaDef s ORDER BY s.Name ASC", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT s.Name FROM meta.DMSchemaDef s ORDER BY s.Name ASC");
        await readerCallback(reader);
      });

      it("Column without extended type with alias", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal(undefined, metaData[0].extendedType);
          assert.equal("", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal(undefined, metaData[0].extendedType);
          assert.equal("", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("SELECT s.Name a FROM meta.DMSchemaDef s ORDER BY a ASC", syncReaderCallback);
        const reader = iVault.createQueryReader("SELECT s.Name a FROM meta.DMSchemaDef s ORDER BY a ASC");
        await readerCallback(reader);
      });

      it("Geometric type column with alias", async () => {
        const readerCallback = async (readerObj: DMSqlReader | DMSqlSyncReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal("GeometryStream", metaData[0].extendedType);
          assert.equal("GeometryStream", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal("GeometryStream", metaData[0].extendedType);
          assert.equal("GeometryStream", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("select GeometryStream A from bis.GeometricElement3d LIMIT 1", syncReaderCallback);
        const reader = iVault.createQueryReader("select GeometryStream A from bis.GeometricElement3d LIMIT 1");
        await readerCallback(reader);
      });

      it("Geometric type column without alias", async () => {
        const readerCallback = async (readerObj: DMSqlReader) => {
          const metaData = await readerObj.getMetaData();
          assert.equal("GeometryStream", metaData[0].extendedType);
          assert.equal("GeometryStream", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        const syncReaderCallback = (syncReader: DMSqlSyncReader) => {
          const metaData = syncReader.getMetaData();
          assert.equal("GeometryStream", metaData[0].extendedType);
          assert.equal("GeometryStream", metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
          assert.equal(metaData[0].extendedType, metaData[0].extendType);   // eslint-disable-line @typescript-eslint/no-deprecated
        }
        iVault.withQueryReader("select GeometryStream from bis.GeometricElement3d LIMIT 1", syncReaderCallback);
        const reader = iVault.createQueryReader("select GeometryStream from bis.GeometricElement3d LIMIT 1");
        await readerCallback(reader);
      });

    });
  });
}));

describe("createQueryReader vs withQueryReader ", () => {
  /** Deletes an entire element tree, including sub-models, child elements and code scope references.
   * Items are deleted in bottom-up order. Definitions and Subjects are deleted after normal elements.
   * Call deleteNormalElements on each tree. Then call deleteSpecialElements.
   */
  class TestElementCascadingDeleter extends ElementTreeDeleter {
    protected shouldVisitCodeScopes(
      _elementId: Id64String,
      _scope: ElementTreeWalkerScope
    ) {
      return true;
    }

    /** The main tree-walking function */
    protected override processElementTree(
      element: Id64String,
      scope: ElementTreeWalkerScope
    ): void {
      if (this.shouldVisitCodeScopes(element, scope)) {
        this._processCodeScopes(element, scope);
      }
      super.processElementTree(element, scope);
    }
    /** Process code scope references */
    private _processCodeScopes(
      element: Id64String,
      scope: ElementTreeWalkerScope
    ) {
      const newScope = new ElementTreeWalkerScope(scope, element);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      this.txn.iVault.withPreparedStatement(
        `
        SELECT DMInstanceId
        FROM bis.Element
        WHERE CodeScope.id=?
          AND Parent.id IS NULL
      `,
        (stmt) => {
          stmt.bindId(1, element);
          while (stmt.step() === DbResult.BE_SQLITE_ROW) {
            const elementId = stmt.getValue(0).getId();
            this.processElementTree(elementId, newScope);
          }
        }
      );
    }
  }

  // Actual test begins here
  let iVaultDb: SnapshotDb;

  function createTestIVaultWithScopedPhysicalObject() {
    const pathForEmpty = IVaultTestUtils.prepareOutputFile(
      "DMReferenceTypesCache",
      "empty.dtw"
    );
    const testIVaultDb = SnapshotDb.createEmpty(pathForEmpty, {
      rootSubject: { name: "empty " },
    });

    const subjectId = withEditTxn(testIVaultDb, (txn) => Subject.insert(txn, IVault.rootSubjectId, "Subject", "Subject Description"));

    const [physicalModelId, definitionModelId] = withEditTxn(testIVaultDb, (txn) => [
      PhysicalModel.insert(txn, subjectId, "Physical"),
      DefinitionModel.insert(txn, subjectId, "Definition"),
    ]);

    const spatialCategoryId = IVaultTestUtils.insertSpatialCategory(
      testIVaultDb,
      definitionModelId,
      "SpatialCategory",
      ColorDef.green
    );

    const physicalObjectProps5: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: spatialCategoryId,
      code: Code.createEmpty(),
      userLabel: "ScopingElement",
    };

    const childElement: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: spatialCategoryId,
      code: { spec: "0x1", scope: Id64.invalid },
      userLabel: "ScopedElement",
    };
    withEditTxn(testIVaultDb, (txn) => {
      const scopingElement = txn.insertElement(physicalObjectProps5);
      childElement.code = { spec: "0x1", scope: scopingElement };
      txn.insertElement(childElement);
    });
    return testIVaultDb;
  }

  beforeEach(async () => {
    iVaultDb = createTestIVaultWithScopedPhysicalObject();
  });

  afterEach(async () => {
    iVaultDb.close();
  });

  it("Failing while using createQueryReader()", async () => {
    const sql = `
    SELECT DMInstanceId
    FROM ${PhysicalObject.classFullName}
    `;
    const reader = iVaultDb.createQueryReader(sql, undefined, { usePrimaryConn: true });
    await reader.step(); // step to initialize reader
    const firstId = reader.current[0];
    withEditTxn(iVaultDb, (txn) => new TestElementCascadingDeleter(txn).deleteNormalElements(firstId));
    await reader.step(); // step to initialize reader
    const secondId = reader.current[0];
    // This is because dmsqlreader built using createQueryReader caches results and so when it tries to access the second element, it is already deleted from the database and it throws "Not Found" error.
    expect(() => withEditTxn(iVaultDb, (txn) => new TestElementCascadingDeleter(txn).deleteNormalElements(secondId))).to.throw();
  });

  it("Passing while using withQueryReader()", async () => {
    const sql = `
    SELECT DMInstanceId
    FROM ${PhysicalObject.classFullName}
    `;
    iVaultDb.withQueryReader(sql, (reader) => {
      let cntSteps = 0;
      while (reader.step()) {
        const id = reader.current[0];
        withEditTxn(iVaultDb, (txn) => new TestElementCascadingDeleter(txn).deleteNormalElements(id));
        cntSteps++;
      }
      assert.equal(cntSteps, 1);
    });
  });
});


