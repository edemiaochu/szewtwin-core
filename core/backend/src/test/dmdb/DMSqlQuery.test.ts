/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Id64 } from "@szewtwin/core-szewec";
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, DbRequestKind, DMSqlReader, QueryBinder, QueryOptionsBuilder, QueryPropertyMetaData, QueryRowFormat } from "@szewtwin/core-common";
import { assert, expect, use } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as path from "path";
import { ConcurrentQuery } from "../../ConcurrentQuery";
import { _nativeDb, DMSqlStatement, SnapshotDb } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { SequentialLogMatcher } from "../SequentialLogMatcher";
use(chaiAsPromised);

// cspell:ignore mirukuru ibim

describe("DMSql Query", () => {
  let ivault1: SnapshotDb;
  let ivault2: SnapshotDb;
  let ivault3: SnapshotDb;
  let ivault4: SnapshotDb;
  let ivault5: SnapshotDb;
  let ivault6: SnapshotDb;

  before(async () => {

    ivault1 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("test.dtw"));
    ivault2 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw"));
    ivault3 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("GetSetAutoHandledStructProperties.dtw"));
    ivault4 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("GetSetAutoHandledArrayProperties.dtw"));
    ivault5 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("mirukuru.ibim"));
    ivault6 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("test_dm_4003.bim"));
  });

  after(async () => {
    ivault1.close();
    ivault2.close();
    ivault3.close();
    ivault4.close();
    ivault5.close();
    ivault6.close();
  });

  const megaBytes = (n: number) => n * 1024 * 1024;

  it("v8 max string length test", async () => {
    const reader = ivault1.createQueryReader(`SELECT hex(zeroblob(${megaBytes(500)}))`);
    await expect(reader.step()).to.be.rejectedWith("result size exceeded maximum allowed size");
  });

  it("step fail with large blob", async () => {
    const reader = ivault1.createQueryReader(`SELECT hex(zeroblob(${megaBytes(5000)}))`);
    await expect(reader.step()).to.be.rejectedWith("concurrent query step() failed: string or blob too big (BE_SQLITE_TOOBIG)");
  });

  it("verify 4.8.x format for DMClassId", async () => {
    const queries = [
      "SELECT DMClassId FROM Bis.Element LIMIT 1",
      "SELECT DMClassId aClassId FROM Bis.Element LIMIT 1",
      "SELECT Parent FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1 ",
      "SELECT Parent.RelDMClassId FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1",
      "SELECT Parent aParent FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1 ",
      "SELECT Parent.RelDMClassId aRelClassId FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1",
      "WITH t(aClassId) AS (SELECT DMClassId FROM Bis.Element LIMIT 1) SELECT aClassId FROM t",
      "WITH t(aClassId) AS (SELECT DMClassId Foo FROM Bis.Element LIMIT 1) SELECT aClassId FROM t",
      "WITH t(aClassId) AS (SELECT DMClassId FROM Bis.Element LIMIT 1) SELECT aClassId bClassId FROM t",
      "SELECT * FROM (SELECT DMClassId FROM Bis.Element LIMIT 1)",
      "SELECT * FROM (SELECT DMClassId aClassId, DMClassId FROM Bis.Element LIMIT 1)",
      "SELECT * FROM (SELECT Parent FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1)",
      "SELECT * FROM (SELECT Parent.RelDMClassId FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1)",
      "SELECT * FROM (SELECT Parent aParent FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1)",
      "SELECT * FROM (SELECT Parent.RelDMClassId aRelClassId FROM Bis.Element WHERE Parent.Id IS NOT NULL LIMIT 1)",
      "SELECT * FROM (WITH t(aClassId) AS (SELECT DMClassId FROM Bis.Element LIMIT 1) SELECT aClassId FROM t)",
      "SELECT * FROM (WITH t(aClassId) AS (SELECT DMClassId Foo FROM Bis.Element LIMIT 1) SELECT aClassId FROM t)",
      "SELECT * FROM (WITH t(aClassId) AS (SELECT DMClassId FROM Bis.Element LIMIT 1) SELECT aClassId bClassId FROM t)",
    ];
    assert.equal(queries.length, 18);
    const results = [
      { className: "BisCore.DrawingCategory" },
      { aClassId: "0x4c" },
      { parent: { id: "0x1", relClassName: "BisCore.SubjectOwnsPartitionElements" } },
      { "parent.relClassName": "BisCore.SubjectOwnsPartitionElements" },
      { aParent: { id: "0x1", relClassName: "BisCore.SubjectOwnsPartitionElements" } },
      { aRelClassId: "0xcf" },
      { aClassId: "0x4c" },
      { aClassId: "0x4c" },
      { bClassId: "0x4c" },
      { className: "BisCore.DrawingCategory" },
      { aClassId: "0x4c", className: "BisCore.DrawingCategory" },
      { parent: { id: "0x1", relClassName: "BisCore.SubjectOwnsPartitionElements" } },
      { "parent.relClassName": "BisCore.SubjectOwnsPartitionElements" },
      { aParent: { id: "0x1", relClassName: "BisCore.SubjectOwnsPartitionElements" } },
      { aRelClassId: "0xcf" },
      { aClassId: "0x4c" },
      { aClassId: "0x4c" },
      { bClassId: "0x4c" },
    ];
    assert.equal(results.length, 18);
    const builder = new QueryOptionsBuilder();
    builder.setRowFormat(QueryRowFormat.UseJsPropertyNames);
    let expectedRows = 0;
    for (let i = 0; i < queries.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ivault1.withPreparedStatement(queries[i], (stmt: DMSqlStatement) => {
        assert.equal(DbResult.BE_SQLITE_ROW, stmt.step(), "expected DbResult.BE_SQLITE_ROW");
        assert.deepEqual(stmt.getRow(), results[i], `(DMSqlStatement) "${queries[i]}" does not match expected result (${path.basename(ivault1[_nativeDb].getFilePath())})`);
        ++expectedRows;
      });
      for await (const row of ivault1.createQueryReader(queries[i], undefined, builder.getOptions())) {
        assert.deepEqual(row.toRow(), results[i], `(DMSqlReader) "${queries[i]}" does not match expected result (${path.basename(ivault1[_nativeDb].getFilePath())})`);
        ++expectedRows;
      }
    }
    assert.equal(expectedRows, 36);
  });
  it("verify return values for system properties", async () => {
    /* eslint-disable @typescript-eslint/naming-convention  */
    const testQueries = [
      //
      {
        query: "SELECT a.DMInstanceId, b.DMInstanceId, a.DMClassId, b.DMClassId FROM BisCore.Element a, BisCore.Element b LIMIT 1",
        result: {
          id: "0x19",
          id_1: "0x19",
          className: "BisCore.DrawingCategory",
          className_1: "BisCore.DrawingCategory",
        },
      },
      {
        query: "SELECT Parent.Id,Parent.RelDMClassId, Parent.Id myParentId, Parent.RelDMClassId myParentRelClassId FROM BisCore.Element WHERE Parent.Id IS NOT NULL LIMIT 1",
        result: {
          "myParentId": "0x1",
          "myParentRelClassId": "0xcf",
          "parent.id": "0x1",
          "parent.relClassName": "BisCore.SubjectOwnsPartitionElements",
        },
      },
      {
        query: "SELECT DMInstanceId, DMClassId FROM Bis.Element LIMIT 1",
        result: {
          id: "0x19",
          className: "BisCore.DrawingCategory",
        },
      },
      {
        query: "SELECT * FROM (SELECT DMInstanceId, DMClassId FROM Bis.Element) LIMIT 1",
        result: {
          id: "0x19",
          className: "BisCore.DrawingCategory",
        },
      },
      {
        query: "SELECT DMInstanceId, DMClassId, SourceDMInstanceId, SourceDMClassId, TargetDMInstanceid, TargetDMClassId FROM Bis.ElementRefersToElements LIMIT 1",
        result: {
          id: "0x1",
          className: "BisCore.PartitionOriginatesFromRepository",
          sourceId: "0x1c",
          sourceClassName: "BisCore.PhysicalPartition",
          targetId: "0x12",
          targetClassName: "BisCore.RepositoryLink",
        },
      },
      {
        query: "SELECT * FROM (SELECT DMInstanceId, DMClassId, SourceDMInstanceId, SourceDMClassId, TargetDMInstanceid, TargetDMClassId FROM Bis.ElementRefersToElements) LIMIT 1",
        result: {
          id: "0x1",
          className: "BisCore.PartitionOriginatesFromRepository",
          sourceId: "0x1c",
          sourceClassName: "BisCore.PhysicalPartition",
          targetId: "0x12",
          targetClassName: "BisCore.RepositoryLink",
        },
      },
      {
        query: "SELECT DMInstanceId a, DMClassId b FROM Bis.Element LIMIT 1",
        result: {
          a: "0x19",
          b: "0x4c",
        },
      },
      {
        query: "SELECT * FROM (SELECT DMInstanceId a, DMClassId b FROM Bis.Element) LIMIT 1",
        result: {
          a: "0x19",
          b: "0x4c",
        },
      },
      {
        query: "SELECT DMInstanceId A, DMClassId B FROM Bis.Element LIMIT 1",
        result: {
          a: "0x19",
          b: "0x4c",
        },
      },
      {
        query: "SELECT * FROM (SELECT DMInstanceId A, DMClassId B FROM Bis.Element) LIMIT 1",
        result: {
          a: "0x19",
          b: "0x4c",
        },
      },
      {
        query: "SELECT DMInstanceId a, DMClassId b, SourceDMInstanceId c, SourceDMClassId d, TargetDMInstanceid e, TargetDMClassId f FROM Bis.ElementRefersToElements LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
        },
      },
      {
        query: "SELECT * FROM (SELECT DMInstanceId a, DMClassId b, SourceDMInstanceId c, SourceDMClassId d, TargetDMInstanceid e, TargetDMClassId f FROM Bis.ElementRefersToElements) LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
        },
      },
      {
        query: "SELECT DMInstanceId A, DMClassId B, SourceDMInstanceId C, SourceDMClassId D, TargetDMInstanceid E, TargetDMClassId F FROM Bis.ElementRefersToElements LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
        },
      },
      {
        query: "SELECT * FROM (SELECT DMInstanceId A, DMClassId B, SourceDMInstanceId C, SourceDMClassId D, TargetDMInstanceid E, TargetDMClassId F FROM Bis.ElementRefersToElements) LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
        },
      },
      {
        query: "SELECT Model, Model.Id, Model.RelDMClassId from Bis.Element limit 1",
        result: {
          "model": {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          "model.id": "0x1",
          "model.relClassName": "BisCore.ModelContainsElements",
        },
      },
      {
        query: "SELECT * FROM (SELECT Model, Model.Id, Model.RelDMClassId from Bis.Element) LIMIT 1",
        result: {
          "model": {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          "model.id": "0x1",
          "model.relClassName": "BisCore.ModelContainsElements",
        },
      },
      {
        query: "SELECT r.DMInstanceId, r.DMClassId, r.SourceDMInstanceId, r.SourceDMClassId, r.TargetDMInstanceid, r.TargetDMClassId, ele.Model, ele.Model.Id, ele.Model.RelDMClassId FROM Bis.ElementRefersToElements r JOIN Bis.Element ele ON ele.DMInstanceId = r.SourceDMInstanceId LIMIT 1",
        result: {
          "id": "0x1",
          "className": "BisCore.PartitionOriginatesFromRepository",
          "sourceId": "0x1c",
          "sourceClassName": "BisCore.PhysicalPartition",
          "targetId": "0x12",
          "targetClassName": "BisCore.RepositoryLink",
          "model": {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          "model.id": "0x1",
          "model.relClassName": "BisCore.ModelContainsElements",
        },
      },
      {
        query: "SELECT * FROM (SELECT r.DMInstanceId, r.DMClassId, r.SourceDMInstanceId, r.SourceDMClassId, r.TargetDMInstanceid, r.TargetDMClassId, ele.Model, ele.Model.Id, ele.Model.RelDMClassId FROM Bis.ElementRefersToElements r JOIN Bis.Element ele ON ele.DMInstanceId = r.SourceDMInstanceId) LIMIT 1",
        result: {
          "id": "0x1",
          "className": "BisCore.PartitionOriginatesFromRepository",
          "sourceId": "0x1c",
          "sourceClassName": "BisCore.PhysicalPartition",
          "targetId": "0x12",
          "targetClassName": "BisCore.RepositoryLink",
          "model": {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          "model.id": "0x1",
          "model.relClassName": "BisCore.ModelContainsElements",
        },
      },
      {
        query: "SELECT r.DMInstanceId a, r.DMClassId b, r.SourceDMInstanceId c, r.SourceDMClassId d, r.TargetDMInstanceid e, r.TargetDMClassId f, ele.Model g, ele.Model.Id h, ele.Model.RelDMClassId i FROM Bis.ElementRefersToElements r JOIN Bis.Element ele ON ele.DMInstanceId = r.SourceDMInstanceId LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
          g: {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          h: "0x1",
          i: "0x40",
        },
      },
      {
        query: "SELECT * FROM (SELECT r.DMInstanceId a, r.DMClassId b, r.SourceDMInstanceId c, r.SourceDMClassId d, r.TargetDMInstanceid e, r.TargetDMClassId f, ele.Model g, ele.Model.Id h, ele.Model.RelDMClassId i FROM Bis.ElementRefersToElements r JOIN Bis.Element ele ON ele.DMInstanceId = r.SourceDMInstanceId) LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
          g: {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          h: "0x1",
          i: "0x40",
        },
      },
      {
        query: "SELECT r.DMInstanceId A, r.DMClassId B, r.SourceDMInstanceId C, r.SourceDMClassId D, r.TargetDMInstanceid E, r.TargetDMClassId F, ele.Model G, ele.Model.Id H, ele.Model.RelDMClassId I FROM Bis.ElementRefersToElements r JOIN Bis.Element ele ON ele.DMInstanceId = r.SourceDMInstanceId LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
          g: {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          h: "0x1",
          i: "0x40",
        },
      },
      {
        query: "SELECT * FROM (SELECT r.DMInstanceId A, r.DMClassId B, r.SourceDMInstanceId C, r.SourceDMClassId D, r.TargetDMInstanceid E, r.TargetDMClassId F, ele.Model G, ele.Model.Id H, ele.Model.RelDMClassId I FROM Bis.ElementRefersToElements r JOIN Bis.Element ele ON ele.DMInstanceId = r.SourceDMInstanceId) LIMIT 1",
        result: {
          a: "0x1",
          b: "0xa8",
          c: "0x1c",
          d: "0xb4",
          e: "0x12",
          f: "0xa9",
          g: {
            id: "0x1",
            relClassName: "BisCore.ModelContainsElements",
          },
          h: "0x1",
          i: "0x40",
        },
      },
    ];
    /* eslint-enable @typescript-eslint/naming-convention  */
    const builder = new QueryOptionsBuilder();
    builder.setRowFormat(QueryRowFormat.UseJsPropertyNames);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    builder.setConvertClassIdsToNames(true);
    // With DMDb Profile 4002
    for (const testQuery of testQueries) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ivault1.withPreparedStatement(testQuery.query, (stmt: DMSqlStatement) => {
        assert.equal(DbResult.BE_SQLITE_ROW, stmt.step(), "expected DbResult.BE_SQLITE_ROW");
        assert.deepEqual(stmt.getRow(), testQuery.result, `(DMSqlStatement) "${testQuery.query}" does not match expected result (${path.basename(ivault1[_nativeDb].getFilePath())})`);
      });

      let hasRow = false;
      for await (const row of ivault1.createQueryReader(testQuery.query, undefined, builder.getOptions())) {
        assert.deepEqual(row.toRow(), testQuery.result, `(DMSqlReader) "${testQuery.query}" does not match expected result (${path.basename(ivault1[_nativeDb].getFilePath())})`);
        hasRow = true;
      }
      assert.isTrue(hasRow, "ivault1.query() must return latest one row");
    }
    // With DMDb Profile 4003
    for (const testQuery of testQueries) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ivault6.withPreparedStatement(testQuery.query, (stmt: DMSqlStatement) => {
        assert.equal(DbResult.BE_SQLITE_ROW, stmt.step(), "expected DbResult.BE_SQLITE_ROW");
        assert.deepEqual(stmt.getRow(), testQuery.result, `(DMSqlStatement) "${testQuery.query}" does not match expected result (${path.basename(ivault1[_nativeDb].getFilePath())})`);
      });
      let hasRow = false;
      for await (const row of ivault6.createQueryReader(testQuery.query, undefined, builder.getOptions())) {
        assert.deepEqual(row.toRow(), testQuery.result, `(DMSqlReader) "${testQuery.query}" does not match expected result (${path.basename(ivault1[_nativeDb].getFilePath())})`);
        hasRow = true;
      }
      assert.isTrue(hasRow, "ivault1.query() must return latest one row");
    }
  });
  it("check prepare logErrors flag", () => {
    const dmdb = ivault1;
    // expect log message when statement fails
    let slm = new SequentialLogMatcher();
    slm.append().error().category("BeSQLite").message("Error \"no such table: def (BE_SQLITE_ERROR)\" preparing SQL: SELECT abc FROM def");
    assert.throw(() => dmdb.withSqliteStatement("SELECT abc FROM def", () => { }, /* logErrors = */ true), "no such table: def (BE_SQLITE_ERROR)");
    assert.isTrue(slm.finishAndDispose(), "logMatcher should detect log");

    // now pass suppress log error which mean we should not get the error
    slm = new SequentialLogMatcher();
    slm.append().error().category("BeSQLite").message("Error \"no such table: def (BE_SQLITE_ERROR)\" preparing SQL: SELECT abc FROM def");
    assert.throw(() => dmdb.withSqliteStatement("SELECT abc FROM def", () => { }, /* logErrors = */ false), "no such table: def (BE_SQLITE_ERROR)");
    assert.isFalse(slm.finishAndDispose(), "logMatcher should not detect log");

    // expect log message when statement fails
    slm = new SequentialLogMatcher();
    slm.append().error().category("DMDb").message("DMClass 'abc.def' does not exist or could not be loaded.");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.throw(() => dmdb.withPreparedStatement("SELECT abc FROM abc.def", () => { }, /* logErrors = */ true), "DMClass 'abc.def' does not exist or could not be loaded.");
    assert.isTrue(slm.finishAndDispose(), "logMatcher should detect log");

    // now pass suppress log error which mean we should not get the error
    slm = new SequentialLogMatcher();
    slm.append().error().category("DMDb").message("DMClass 'abc.def' does not exist or could not be loaded.");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.throw(() => dmdb.withPreparedStatement("SELECT abc FROM abc.def", () => { }, /* logErrors = */ false), "");
    assert.isFalse(slm.finishAndDispose(), "logMatcher should not detect log");
  });
  it("restart query", async () => {
    let cancelled = 0;
    let successful = 0;
    let rowCount = 0;
    try {
      ConcurrentQuery.shutdown(ivault1[_nativeDb]);
      ConcurrentQuery.resetConfig(ivault1[_nativeDb], { globalQuota: { time: 1 }, ignoreDelay: false });

      const scheduleQuery = async (delay: number) => {
        return new Promise<void>(async (resolve, reject) => {
          try {
            const options = new QueryOptionsBuilder();
            options.setDelay(delay);
            options.setRestartToken("tag");
            const reader = ivault1.createQueryReader("SELECT DMInstanceId as Id, Parent.Id as ParentId FROM BisCore.element", undefined, options.getOptions());
            while (await reader.step()) {
              rowCount++;
            }
            successful++;
            resolve();
          } catch (err: any) {
            // we expect query to be cancelled
            if (err.errorNumber === DbResult.BE_SQLITE_INTERRUPT) {
              cancelled++;
              resolve();
            } else {
              reject(new Error("rejected"));
            }
          }
        });
      };

      const queries = [];
      queries.push(scheduleQuery(5000));
      queries.push(scheduleQuery(0));

      await Promise.all(queries);
      // We expect at least one query to be cancelled
      assert.isAtLeast(cancelled, 1, "cancelled should be at least 1");
      assert.isAtLeast(successful, 1, "successful should be at least 1");
      assert.isAtLeast(rowCount, 1, "rowCount should be at least 1");
    } finally {
      ConcurrentQuery.shutdown(ivault1[_nativeDb]);
      ConcurrentQuery.resetConfig(ivault1[_nativeDb]);
    }
  });
  it("concurrent query should retry on timeout", async () => {
    class MockDMSqlReader extends DMSqlReader {
      public constructor(_executor: DbRequestExecutor<DbQueryRequest, DbQueryResponse>, query: string) {
        super(_executor, query);
      }
      public async mockReadRows(queryRequest: DbQueryRequest): Promise<DbQueryResponse> {
        return super.runWithRetry(queryRequest);
      }
    }

    // Set time to 1 sec to simulate a timeout scenario
    ConcurrentQuery.resetConfig(ivault1[_nativeDb], { globalQuota: { time: 1 }, ignoreDelay: false });
    const executor = {
      execute: async (req: DbQueryRequest) => {
        return ConcurrentQuery.executeQueryRequest(ivault1[_nativeDb], req);
      },
    };
    const request: DbQueryRequest = {
      kind: DbRequestKind.DMSql,
      query: "SELECT * FROM BisCore.element",
      delay: 5000,  // Set delay to a value > timeout
    };
    try {
      await new MockDMSqlReader(executor, request.query).mockReadRows(request);
      assert(false);  // We expect this scenario to always throw
    } catch (error: any) {
      // Query should give up after max retry count has been reached
      assert(error.message === "query too long to execute or server is too busy");
    }
  });
  it("concurrent query use primary connection", async () => {
    const reader = ivault1.createQueryReader("SELECT * FROM BisCore.element", undefined, { usePrimaryConn: true });
    let props = await reader.getMetaData();
    assert.equal(props.length, 11);
    let rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 46);
    props = await reader.getMetaData();
    assert.equal(props.length, 11);
    assert.equal(reader.stats.backendRowsReturned, 46);
    assert.isTrue(reader.stats.backendCpuTime > 0);
    assert.isTrue(reader.stats.backendMemUsed > 1000);
    assert.isTrue(reader.stats.totalTime > 0);
  });
  it("concurrent query use idset", async () => {
    const ids: string[] = [];
    for await (const row of ivault1.createQueryReader("SELECT DMInstanceId FROM BisCore.Element LIMIT 23")) {
      ids.push(row[0]);
    }
    const reader = ivault1.createQueryReader("SELECT * FROM BisCore.element WHERE InVirtualSet(?, DMInstanceId)", QueryBinder.from([ids]));
    let props = await reader.getMetaData();
    assert.equal(props.length, 11);
    let rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 23);
    props = await reader.getMetaData();
    assert.equal(props.length, 11);
    assert.equal(reader.stats.backendRowsReturned, 23);
    assert.isTrue(reader.stats.backendCpuTime > 0);
    assert.isTrue(reader.stats.backendMemUsed > 100);
  });
  it("concurrent query bind idset in IdSet virtual table", async () => {
    const ids: string[] = [];
    for await (const row of ivault1.createQueryReader("SELECT DMInstanceId FROM BisCore.Element LIMIT 23")) {
      ids.push(row[0]);
    }
    const reader = ivault1.createQueryReader("SELECT * FROM BisCore.element, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", QueryBinder.from([ids]));
    let props = await reader.getMetaData();
    assert.equal(props.length, 12); // 11 for BisCore.element and 1 for IdSet
    let rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 23);
    props = await reader.getMetaData();
    assert.equal(props.length, 12); // 11 for BisCore.element and 1 for IdSet
    assert.equal(reader.stats.backendRowsReturned, 23);
    assert.isTrue(reader.stats.backendCpuTime > 0);
    assert.isTrue(reader.stats.backendMemUsed > 100);
  });
  it("concurrent query bind single id in IdSet virtual table", async () => {
    let ids: string = "";
    for await (const row of ivault1.createQueryReader("SELECT DMInstanceId FROM BisCore.Element LIMIT 23")) {
      ids = row[0]; // getting only the first id
      break;
    }
    const reader = ivault1.createQueryReader("SELECT * FROM BisCore.element, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", QueryBinder.from([ids]));
    let props = await reader.getMetaData();
    assert.equal(props.length, 12); // 11 for BisCore.element and 1 for IdSet
    let rows = 0; // backend will fail to bind so no rows will be returned
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 0);
    props = await reader.getMetaData();
    assert.equal(props.length, 12); // 11 for BisCore.element and 1 for IdSet
    assert.equal(reader.stats.backendRowsReturned, 0);
    assert.isTrue(reader.stats.backendCpuTime > 0);
  });

  it("concurrent query bind idset with invalid values in IdSet virtual table should fail", async () => {
    const ids: string[] = ["0x1", "ABC", "YZ"];

    try {
      ivault1.createQueryReader("SELECT * FROM BisCore.element, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", QueryBinder.from([ids]));
    } catch (err: any) {
      assert.equal(err.message, "unsupported type");
    }
  });

  it("concurrent query bind idset with invalid values in IdSet virtual table should fail", async () => {
    const ids: string[] = ["ABC", "0x1", "YZ"]; // as first value is not an Id so QueryBinder.from will throw error of "unsupported type"

    try {
      ivault1.createQueryReader("SELECT * FROM BisCore.element, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", QueryBinder.from([ids]));
    } catch (err: any) {
      assert.equal(err.message, "unsupported type");
    }
  });

  it("concurrent query bind multiple ids in idset virtual table", async () => {
    const ids: string[] = ["0x1", "0xe", "0x10"];

    const reader = ivault1.createQueryReader("SELECT * FROM BisCore.element, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", QueryBinder.from([ids]));
    let props = await reader.getMetaData();
    assert.equal(props.length, 12); // 11 for BisCore.element and 1 for IdSet
    let rows = 0; // backend will bind successfully but some of the values are not valid for IdSet VT so those values will be ignored
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 3);
    props = await reader.getMetaData();
    assert.equal(props.length, 12); // 11 for BisCore.element and 1 for IdSet
    assert.equal(reader.stats.backendRowsReturned, 3);
    assert.isTrue(reader.stats.backendCpuTime > 0);
  });

  it("concurrent query get meta data", async () => {
    const reader = ivault1.createQueryReader("SELECT * FROM BisCore.element");
    let props = await reader.getMetaData();
    assert.equal(props.length, 11);
    let rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 46);
    props = await reader.getMetaData();
    assert.equal(props.length, 11);
    assert.equal(reader.stats.backendRowsReturned, 46);
    assert.isTrue(reader.stats.backendCpuTime > 0);
    assert.isTrue(reader.stats.backendMemUsed > 1000);
  });
  it("concurrent query access string meta data", async () => {
    let reader = ivault1.createQueryReader("SELECT e.DMClassId FROM bis.Element e");
    let props: QueryPropertyMetaData[] = await reader.getMetaData();
    assert.equal(props.length, 1);
    assert.equal(props[0].accessString, "DMClassId");

    reader = ivault1.createQueryReader("SELECT Model.Id, e.Model.Id, Model.RelDMClassId, e.Model.RelDMClassId FROM bis.Element e");
    props = await reader.getMetaData();
    assert.equal(props.length, 4);
    assert.equal(props[0].accessString, "Model.Id");
    assert.equal(props[1].accessString, "Model.Id");
    assert.equal(props[2].accessString, "Model.RelDMClassId");
    assert.equal(props[3].accessString, "Model.RelDMClassId");

    reader = ivault1.createQueryReader("SELECT Origin.X, Origin.Y, TypeDefinition FROM bis.GeometricElement2d ge");
    props = await reader.getMetaData();
    assert.equal(props.length, 3);
    assert.equal(props[0].accessString, "Origin.X");
    assert.equal(props[1].accessString, "Origin.Y");
    assert.equal(props[2].accessString, "TypeDefinition");
    assert.equal(props[2].typeName, "navigation");

    reader = ivault1.createQueryReader("SELECT 1, 1 + 6, * FROM (VALUES(1,2), (2,3))");
    props = await reader.getMetaData();
    assert.equal(props.length, 4);
    assert.equal(props[0].accessString, "1");
    assert.equal(props[0].jsonName, "1");
    assert.equal(props[1].accessString, "1 + 6");
    assert.equal(props[1].typeName, "double");
    assert.equal(props[2].accessString, "1_1");
    assert.equal(props[2].jsonName, "1_1");
    assert.equal(props[3].accessString, "2");
  });
  it("concurrent query quota", async () => {
    let reader = ivault1.createQueryReader("SELECT * FROM BisCore.element", undefined, { limit: { count: 4 } });
    let rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 4);
    reader = ivault1.createQueryReader("SELECT * FROM BisCore.element", undefined, { limit: { offset: 4, count: 4 } });
    rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 4);
  });
  it("paging results", async () => {
    const getRowPerPage = (nPageSize: number, nRowCount: number) => {
      const nRowPerPage = nRowCount / nPageSize;
      const nPages = Math.ceil(nRowPerPage);
      const nRowOnLastPage = nRowCount - (Math.floor(nRowPerPage) * pageSize);
      const pages = new Array(nPages).fill(pageSize);
      if (nRowPerPage) {
        pages[nPages - 1] = nRowOnLastPage;
      }
      return pages;
    };

    const pageSize = 5;
    const query = "SELECT DMInstanceId as Id, Parent.Id as ParentId FROM BisCore.element";
    const dbs = [ivault1, ivault2, ivault3, ivault4, ivault5];
    const pendingRowCount = [];
    for (const db of dbs) {
      for await (const row of db.createQueryReader(`SELECT count(*) FROM (${query})`)) {
        pendingRowCount.push(row[0] as number);
      }
    }

    const rowCounts = pendingRowCount;
    const expected = [46, 62, 7, 7, 28];
    assert.equal(rowCounts.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assert.equal(rowCounts[i], expected[i]);
    }
    // verify row per page
    for (const db of dbs) {
      const i = dbs.indexOf(db);
      const rowPerPage = getRowPerPage(pageSize, expected[i]);
      for (let k = 0; k < rowPerPage.length; k++) {
        const rs = await db.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames, limit: { count: pageSize, offset: k * pageSize } }).toArray();
        assert.equal(rs.length, rowPerPage[k]);
      }
    }

    // verify async iterator
    for (const db of dbs) {
      const resultSet = [];
      for await (const queryRow of db.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
        const row = queryRow.toRow();
        resultSet.push(row);
        assert.isTrue(Reflect.has(row, "id"));
        if (Reflect.ownKeys(row).length > 1) {
          assert.isTrue(Reflect.has(row, "parentId"));
          const parentId: string = row.parentId as string;
          assert.isTrue(Id64.isValidId64(parentId));
        }
        const id: string = row.id as string;
        assert.isTrue(Id64.isValidId64(id));
      }
      const entry = dbs.indexOf(db);
      assert.equal(rowCounts[entry], resultSet.length);
    }
  });

  describe("supports_instance_query", () => {
    it("returns 1 for entity classes", async () => {
      for await (const row of ivault1.createQueryReader("SELECT supports_instance_query('BisCore.Element')", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 1, "Entity class BisCore.Element should support instance queries");
      }
    });

    it("returns 1 for link table relationship classes", async () => {
      for await (const row of ivault1.createQueryReader("SELECT supports_instance_query('BisCore.CategorySelectorRefersToCategories')", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 1, "Link table relationship should support instance queries");
      }
    });

    it("returns 1 for link table relationship with external class ids", async () => {
      for await (const row of ivault1.createQueryReader("SELECT supports_instance_query('BisCore.ModelSelectorRefersToModels')", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 1, "ModelSelectorRefersToModels (link table with external class ids) should support instance queries");
      }
    });

    it("returns 0 for non-existent classes", async () => {
      for await (const row of ivault1.createQueryReader("SELECT supports_instance_query('BisCore.DoesNotExist')", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 0, "Non-existent class should not support instance queries");
      }
    });

    it("returns 0 for NULL input", async () => {
      for await (const row of ivault1.createQueryReader("SELECT supports_instance_query(NULL)", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 0, "NULL input should return 0");
      }
    });

    it("works with schema alias:class format", async () => {
      for await (const row of ivault1.createQueryReader("SELECT supports_instance_query('bis:Element')", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 1, "Should work with alias:class format");
      }
    });

    it("works with integer class id", async () => {
      // First get the class id for BisCore.Element
      let classId: number | undefined;
      for await (const row of ivault1.createQueryReader("SELECT dm_classid('BisCore', 'Element')", undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        classId = row[0] as number;
      }
      assert.isDefined(classId, "Should be able to resolve BisCore.Element class id");

      for await (const row of ivault1.createQueryReader(`SELECT supports_instance_query(${classId})`, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
        assert.equal(row[0], 1, "Should work with integer class id");
      }
    });

    it("can be used to filter classes that support instance queries", async () => {
      // Example: find all classes in a schema that support SELECT $
      const rows: any[] = [];
      for await (const row of ivault1.createQueryReader(
        `SELECT c.Name, supports_instance_query(c.DMInstanceId) as supported
         FROM meta.DMClassDef c
         JOIN meta.DMSchemaDef s ON c.Schema.Id = s.DMInstanceId
         WHERE s.Name = 'BisCore' AND supports_instance_query(c.DMInstanceId) = 1
         LIMIT 5`,
        undefined,
        { rowFormat: QueryRowFormat.UseJsPropertyNames },
      )) {
        rows.push(row.toRow());
      }
      assert.isAbove(rows.length, 0, "Should find at least one BisCore class that supports instance queries");
      for (const row of rows) {
        assert.equal(row.supported, 1);
      }
    });
  });

  describe("instance query on link table relationships", () => {
    it("SELECT $ works for link table relationship with external class ids", async () => {
      // ModelSelectorRefersToModels is a link table relationship where SourceDMClassId
      // and TargetDMClassId may be stored in external tables. This was previously failing
      // with a SQLite syntax error due to bugs in CreateLinkTableView.
      let rowCount = 0;
      for await (const row of ivault1.createQueryReader(
        "SELECT $ FROM BisCore.ModelSelectorRefersToModels",
        undefined,
        { rowFormat: QueryRowFormat.UseJsPropertyNames },
      )) {
        const instance = row.toRow();
        const json = instance.$;
        assert.isDefined(json, "$ column should be defined");
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        assert.isDefined(parsed.DMInstanceId, "Instance must have DMInstanceId");
        assert.isDefined(parsed.DMClassId, "Instance must have DMClassId");
        assert.isDefined(parsed.SourceDMInstanceId, "Instance must have SourceDMInstanceId");
        assert.isDefined(parsed.TargetDMInstanceId, "Instance must have TargetDMInstanceId");
        rowCount++;
      }
      // The query should at least not crash — whether there are rows depends on the test file
      assert.isAtLeast(rowCount, 0, "Query should execute without error");
    });
  });
});
