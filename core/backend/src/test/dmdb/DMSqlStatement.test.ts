/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { DbResult, Guid, GuidString, Id64, Id64String } from "@szewtwin/core-szewec";
import { NavigationValue, QueryBinder, QueryOptions, QueryOptionsBuilder, QueryRowFormat } from "@szewtwin/core-common";
import { Point2d, Point3d, Range3d, XAndY, XYAndZ } from "@szewtwin/core-geometry";
import { _nativeDb, DMDb, DMEnumValue, DMSqlColumnInfo, DMSqlInsertResult, DMSqlStatement, DMSqlValue, DMSqlWriteStatement, SnapshotDb } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { SequentialLogMatcher } from "../SequentialLogMatcher";
import { DMDbTestHelper } from "./DMDbTestHelper";
import { ConcurrentQuery } from "../../ConcurrentQuery";

/* eslint-disable @typescript-eslint/naming-convention */
const selectSingleRow = new QueryOptionsBuilder().setLimit({ count: 1, offset: -1 }).setRowFormat(QueryRowFormat.UseJsPropertyNames).getOptions();
async function query(dmdb: DMDb, dmsql: string, params?: QueryBinder, config?: QueryOptions, callback?: (row: any) => void) {
  dmdb.saveChanges();
  let rowCount: number = 0;
  for await (const queryRow of dmdb.createQueryReader(dmsql, params, { ...config, rowFormat: QueryRowFormat.UseJsPropertyNames })) {
    rowCount++;
    if (callback)
      callback(queryRow.toRow());
  }
  return rowCount;
}
async function queryRows(dmdb: DMDb, dmsql: string, params?: QueryBinder, config?: QueryOptions) {
  dmdb.saveChanges();
  const reader = dmdb.createQueryReader(dmsql, params, { ...config, rowFormat: QueryRowFormat.UseJsPropertyNames });
  return reader.toArray();
}
async function queryCount(dmdb: DMDb, dmsql: string, params?: QueryBinder, config?: QueryOptions): Promise<number> {
  dmdb.saveChanges();
  for await (const row of dmdb.createQueryReader(`SELECT COUNT(*) FROM (${dmsql})`, params, { ...config, rowFormat: QueryRowFormat.UseDMSqlPropertyIndexes })) {
    return row[0] as number;
  }
  return -1;
}
function blobEqual(lhs: any, rhs: any) {
  if (!(lhs instanceof Uint8Array) || !(rhs instanceof Uint8Array))
    throw new Error("expecting uint8array");

  if (lhs.byteLength !== rhs.byteLength)
    return false;

  for (let i = 0; i < lhs.byteLength; i++) {
    if (lhs[i] !== rhs[i])
      return false;
  }
  return true;
}

describe("DMSqlStatement", () => {
  const outDir = KnownTestLocations.outputDir;
  const testRange = new Range3d(1.2, 2.3, 3.4, 4.5, 5.6, 6.7);
  const blobVal = new Uint8Array(testRange.toFloat64Array().buffer);
  const abbreviatedBlobVal = `{"bytes":${blobVal.byteLength}}`;

  it("check asynchronous step and stepForInsert methods", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "asyncmethodtest.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
          <DMProperty propertyName="dt" typeName="dateTime"/>
          <DMProperty propertyName="fooId" typeName="long" extendedTypeName="Id"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const r = await dmdb.withCachedWriteStatement("INSERT INTO ts.Foo(n,dt,fooId) VALUES(20,TIMESTAMP '2018-10-18T12:00:00Z',20)", async (stmt: DMSqlWriteStatement) => {
      return stmt.stepForInsert();
    });
    dmdb.saveChanges();
    assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    assert.equal(r.id, "0x1");
  });

  it("concurrent query get meta data", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "asyncmethodtest.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
          <DMProperty propertyName="dt" typeName="dateTime"/>
          <DMProperty propertyName="fooId" typeName="long" extendedTypeName="Id"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    await dmdb.withCachedWriteStatement("INSERT INTO ts.Foo(n,dt,fooId) VALUES(20,TIMESTAMP '2018-10-18T12:00:00Z',20)", async (stmt: DMSqlWriteStatement) => {
      stmt.stepForInsert();
    });
    await dmdb.withCachedWriteStatement("INSERT INTO ts.Foo(n,dt,fooId) VALUES(30,TIMESTAMP '2019-10-18T12:00:00Z',30)", async (stmt: DMSqlWriteStatement) => {
      stmt.stepForInsert();
    });
    dmdb.saveChanges();
    const reader = dmdb.createQueryReader("SELECT * FROM ts.Foo");
    let props = await reader.getMetaData();
    assert.equal(props.length, 5);
    let rows = 0;
    while (await reader.step()) {
      rows++;
    }
    assert.equal(rows, 2);
    props = await reader.getMetaData();
    assert.equal(props.length, 5);
  });
  it("null string accessor", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "nullstring.dmdb");
    assert.isTrue(dmdb.isOpen);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await dmdb.withPreparedStatement(`VALUES(NULL)`, async (stmt: DMSqlStatement) => {
      stmt.step();
      const str = stmt.getValue(0).getString();
      assert.equal(str, "");
    });
  });
  it("should page results", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "pagingresultset.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    const ROW_COUNT = 27;
    // insert test rows
    for (let i = 1; i <= ROW_COUNT; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(n) values(${i})`, async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();
    for (let i = 1; i < ROW_COUNT; i++) {
      const rowCount = await queryCount(dmdb, "SELECT DMInstanceId, DMClassId, n FROM ts.Foo WHERE n <= ?", new QueryBinder().bindInt(1, i));
      assert.equal(rowCount, i);
    }

    const temp = await queryRows(dmdb, "SELECT DMInstanceId FROM ONLY ts.Foo");
    assert.equal(temp.length, ROW_COUNT);
    // query page by page
    const PAGE_SIZE = 5;
    const QUERY = "SELECT n FROM ts.Foo";
    const EXPECTED_ROW_COUNT = [5, 5, 5, 5, 5, 2];
    const ready = [];
    for (let i = 0; i < EXPECTED_ROW_COUNT.length; i++) {
      ready.push(queryRows(dmdb, QUERY, undefined, new QueryOptionsBuilder().setLimit({ offset: i * PAGE_SIZE, count: PAGE_SIZE }).getOptions()));
    }
    // verify if each page has right count of rows
    const results = await Promise.all(ready);
    for (let i = 0; i < EXPECTED_ROW_COUNT.length; i++) {
      assert.equal(results[i].length, EXPECTED_ROW_COUNT[i]);
    }
  });

  it("paging use cache statement queryRows()", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "pagingresultset.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    const ROW_COUNT = 100;
    // insert test rows
    for (let i = 1; i <= ROW_COUNT; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(n) values(${i})`, async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();
    // check if varying page number does not require prepare new statements
    dmdb.clearStatementCache();
    const rca = await queryRows(dmdb, "SELECT count(*) as nRows FROM ts.Foo");
    assert.equal(rca[0].nRows, 100); // expe
    const rc = await queryCount(dmdb, "SELECT * FROM ts.Foo");
    assert.equal(rc, 100); // expe
    let rowNo = 0;
    for await (const row of dmdb.createQueryReader("SELECT * FROM ts.Foo", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      assert.equal(row.n, rowNo + 1);
      rowNo = rowNo + 1;
    }
    assert.equal(rowNo, 100); // expect all rows
  });

  it("should restart query", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "cancelquery.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    const ROW_COUNT = 100;
    // insert test rows
    for (let i = 1; i <= ROW_COUNT; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(n) values(${i})`, async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();
    ConcurrentQuery.resetConfig(dmdb[_nativeDb], { globalQuota: { time: 1 }, ignoreDelay: false });

    let cancelled = 0;
    let successful = 0;
    let rowCount = 0;
    const scheduleQuery = async (delay: number) => {
      return new Promise<void>(async (resolve, reject) => {
        try {
          const options = new QueryOptionsBuilder();
          options.setDelay(delay);
          options.setRowFormat(QueryRowFormat.UseJsPropertyNames);
          options.setRestartToken("tag");
          for await (const _row of dmdb.createQueryReader("SELECT * FROM ts.Foo", undefined, options.getOptions())) {
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
    assert.isAtLeast(cancelled, 1);
    assert.isAtLeast(successful, 1);
    assert.isAtLeast(rowCount, 1);
  });
  it("should use cache statement for query()", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "pagingresultset.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    const ROW_COUNT = 27;
    // insert test rows
    for (let i = 1; i <= ROW_COUNT; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(n) values(${i})`, async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();
    // check if varying page number does not require prepare new statements
    dmdb.clearStatementCache();
    for (const _testPageSize of [1, 2, 4, 5, 6, 7, 10, ROW_COUNT]) {
      let rowNo = 1;
      for await (const row of dmdb.createQueryReader("SELECT n FROM ts.Foo WHERE n != ? and DMInstanceId < ?", new QueryBinder().bindInt(1, 123).bindInt(2, 30), { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
        assert.equal(row.n, rowNo);
        rowNo = rowNo + 1;
      }
      assert.equal(rowNo, 28); // expect all rows
      assert.equal(0, dmdb.getCachedStatementCount()); // there must be single cached statement used with different size pages.
    }
  });
  it("concurrent query binding", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "pagingresultset.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    for (let i = 1; i <= 5; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(n) values(${i})`, async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();
    for await (const row of dmdb.createQueryReader("SELECT count(*) as cnt FROM ts.Foo WHERE n in (:a, :b, :c)", new QueryBinder().bindInt("a", 1).bindInt("b", 2).bindInt("c", 3), { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      assert.equal(row.cnt, 3);
    }
    for await (const row of dmdb.createQueryReader("SELECT count(*) as cnt FROM ts.Foo WHERE n in (?, ?, ?)", new QueryBinder().bindInt(1, 1).bindInt(2, 2).bindInt(3, 3), { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      assert.equal(row.cnt, 3);
    }
    const slm = new SequentialLogMatcher();
    slm.append().error().category("DMDb").message("No parameter index found for parameter name: d.");
    try {
      for await (const row of dmdb.createQueryReader("SELECT count(*) as cnt FROM ts.Foo WHERE n in (:a, :b, :c)", new QueryBinder().bindInt("a", 1).bindInt("b", 2).bindInt("c", 3).bindInt("d", 3), { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
        assert.equal(row.cnt, 3);
      }
      assert.isFalse(true);
    } catch (e) { assert.isNotNull(e); }
    assert.isTrue(slm.finishAndDispose());
  });
  it("check HextoId() and IdToHex() dmsql functions", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "pagingresultset.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    for (let i = 1; i <= 2; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(n) values(${i})`, async (stmt: DMSqlWriteStatement) => {
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();
    for await (const row of dmdb.createQueryReader("SELECT IdToHex(DMInstanceId) as hexId, DMInstanceId, HexToId('0x1') as idhex FROM ts.Foo WHERE n = ?", new QueryBinder().bindInt(1, 1), { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      assert.equal(row.hexId, row.id);
      assert.equal(row.hexId, row.idhex);
    }
  });
  it("should bind BeGuid", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "pagingresultset.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="guid" typeName="binary" extendedTypeName="BeGuid"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    const maxRows = 10;
    const guids: GuidString[] = [];
    for (let i = 0; i < maxRows; i++) {
      const r = await dmdb.withCachedWriteStatement(`insert into ts.Foo(guid) values(?)`, async (stmt: DMSqlWriteStatement) => {
        guids.push(Guid.createValue());
        stmt.bindGuid(1, guids[i]);
        return stmt.stepForInsert();
      });
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    }
    dmdb.saveChanges();

    const uint8arrayToGuid = (guidArray: any) => {
      if (!(guidArray instanceof Uint8Array))
        throw new Error("Expecting a Uint8Array type argument");

      if (guidArray.byteLength !== 16)
        throw new Error("Expecting a Uint8Array of length 16");

      let guidStr: string = "";
      const part = [0, 4, 6, 8, 10, 16];
      for (let z = 0; z < part.length - 1; z++) {
        guidArray.subarray(part[z], part[z + 1]).forEach((c) => {
          guidStr += (`00${c.toString(16)}`).slice(-2);
        });
        if (z < part.length - 2)
          guidStr += "-";
      }
      return guidStr;
    };
    const guidToUint8Array = (v: GuidString) => {
      if (v.length !== 36)
        throw new Error("Guid is expected to have 36 characters xxxxxxxx-xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");

      const ar = new Uint8Array(16);
      const t = v.split("-").join("");
      let i = 0;
      for (let z = 0; z < 32; z += 2) {
        ar[i++] = parseInt(t.substring(z, z + 2), 16);
      }
      return ar;
    };

    const testGuid = "74da899a-6dde-406c-bf45-f4547d948f00";
    assert.equal(testGuid, uint8arrayToGuid(guidToUint8Array(testGuid)));
    let k = 0;
    assert.equal(await query(dmdb, "SELECT guid FROM ts.Foo ORDER BY DMInstanceId", undefined, undefined, (row: any) => {
      assert.equal(row.guid, guids[k++]);
    }), maxRows);

    // following will not return any guid BLOB ? = STRING
    for (const guid of guids) {
      assert.equal(await query(dmdb, "SELECT guid FROM ts.Foo WHERE guid=?", new QueryBinder().bindString(1, guid), undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 1);
      assert.equal(await query(dmdb, `SELECT guid FROM ts.Foo WHERE guid='${guid}'`, undefined, undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 0);
      assert.equal(await query(dmdb, `SELECT guid FROM ts.Foo WHERE guid=StrToGuid('${guid}')`, undefined, undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 1);
      assert.equal(await query(dmdb, "SELECT guid FROM ts.Foo WHERE guid=StrToGuid(?)", new QueryBinder().bindString(1, guid), undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 1);
      assert.equal(await query(dmdb, "SELECT guid FROM ts.Foo WHERE GuidToStr(guid)=?", new QueryBinder().bindString(1, guid), undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 1);
      assert.equal(await query(dmdb, "SELECT guid FROM ts.Foo WHERE guid=?", new QueryBinder().bindBlob(1, guidToUint8Array(guid)), undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 1);
      assert.equal(await query(dmdb, "SELECT guid FROM ts.Foo WHERE guid=StrToGuid(?)", new QueryBinder().bindString(1, guid), undefined, (row: any) => {
        assert.equal(row.guid, guid);
      }), 1);
      assert.equal(await query(dmdb, "SELECT GuidToStr(guid) as gstr FROM ts.Foo WHERE guid=StrToGuid(?)", new QueryBinder().bindString(1, guid), undefined, (row: any) => {
        assert.equal(row.gstr, guid);
      }), 1);
    }
  });
  it("should bind Ids", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindids.dmdb");

    assert.isTrue(dmdb.isOpen);

    const verify = async (ecdbToVerify: DMDb, actualRes: DMSqlInsertResult, expectedDMInstanceId?: Id64String) => {
      if (!expectedDMInstanceId) {
        assert.notEqual(actualRes.status, DbResult.BE_SQLITE_DONE);
        assert.isUndefined(actualRes.id);
        return;
      }

      assert.equal(actualRes.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(actualRes.id);
      assert.equal(actualRes.id!, expectedDMInstanceId);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ecdbToVerify.withPreparedStatement("SELECT DMInstanceId, DMClassId, Name FROM dmdbf.ExternalFileInfo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
        stmt.bindId(1, expectedId);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        const row = stmt.getRow();
        assert.equal(row.id, expectedDMInstanceId);
        assert.equal(row.className, "DMDbFileInfo.ExternalFileInfo");
        assert.equal(row.name, `${Id64.getLocalId(expectedDMInstanceId).toString()}.txt`);
      });
      assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Name FROM dmdbf.ExternalFileInfo WHERE DMInstanceId=?", new QueryBinder().bindString(1, expectedId), new QueryOptionsBuilder().setLimit({ count: 1, offset: -1 }).getOptions(), (row) => {
        assert.equal(row.id, expectedDMInstanceId);
        assert.equal(row.className, "DMDbFileInfo.ExternalFileInfo");
        assert.equal(row.name, `${Id64.getLocalId(expectedDMInstanceId).toString()}.txt`);
      }), 1);
    };

    let expectedId = Id64.fromLocalAndBriefcaseIds(4444, 0);
    let r: DMSqlInsertResult = dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindId(1, expectedId);
      stmt.bindString(2, "4444.txt");
      return stmt.stepForInsert();
    });
    await verify(dmdb, r, expectedId);

    expectedId = Id64.fromLocalAndBriefcaseIds(4445, 0);
    r = dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(:id,:name)", (stmt: DMSqlWriteStatement) => {
      stmt.bindId("id", expectedId);
      stmt.bindString("name", "4445.txt");

      return stmt.stepForInsert();
    });
    await verify(dmdb, r, expectedId);

    expectedId = Id64.fromLocalAndBriefcaseIds(4446, 0);
    r = dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindValues([expectedId, "4446.txt"]);
      return stmt.stepForInsert();
    });
    await verify(dmdb, r, expectedId);

    expectedId = Id64.fromLocalAndBriefcaseIds(4447, 0);
    r = dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(:id,:name)", (stmt: DMSqlWriteStatement) => {
      stmt.bindValues({ id: expectedId, name: "4447.txt" });
      return stmt.stepForInsert();
    });
    await verify(dmdb, r, expectedId);
  });

  it("should bind numeric and date strings", async () => {
    const slm = new SequentialLogMatcher();
    slm.append().error().category("DMDb").message("Type mismatch: only BindDateTime or BindText can be called for a column of the DateTime type.");
    slm.append().error().category("DMDb").message("Type mismatch: only BindDateTime or BindText can be called for a column of the DateTime type.");
    slm.append().error().category("DMDb").message("Type mismatch: only BindDateTime or BindText can be called for a column of the DateTime type.");
    slm.append().error().category("DMDb").message("Type mismatch: only BindDateTime or BindText can be called for a column of the DateTime type.");
    slm.append().error().category("DMDb").message("Type mismatch: only BindDateTime or BindText can be called for a column of the DateTime type.");
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/String must be a valid ISO 8601 date, time or timestamp/gm);
    slm.append().error().category("DMDb").message(/only BindDateTime or BindText can be called for a column of the DateTime type/gm);

    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindnumericanddatestrings.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
          <DMProperty propertyName="dt" typeName="dateTime"/>
          <DMProperty propertyName="fooId" typeName="long" extendedTypeName="Id"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const r: DMSqlInsertResult = dmdb.withCachedWriteStatement("INSERT INTO ts.Foo(n,dt,fooId) VALUES(20,TIMESTAMP '2018-10-18T12:00:00Z',20)", (stmt: DMSqlWriteStatement) => {
      return stmt.stepForInsert();
    });
    dmdb.saveChanges();
    assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    const dmsqln = "SELECT 1 FROM ts.Foo WHERE n=?";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await dmdb.withPreparedStatement(dmsqln, async (stmt: DMSqlStatement) => {
      const nNum: number = 20;
      const nStr: string = "20";
      const nDt: string = "2019-01-21T12:00:00Z";
      const nHexStr: string = "0x14";

      stmt.bindInteger(1, nNum);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();
      assert.equal(await queryCount(dmdb, dmsqln, new QueryBinder().bindInt(1, nNum), selectSingleRow), 1);

      stmt.bindValue(1, nNum);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(nNum);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([nNum]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindString(1, nStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqln, new QueryBinder().bindString(1, nStr), selectSingleRow), 1);

      stmt.bindValue(1, nStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(nStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([nStr]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindString(1, nDt);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Date time string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqln, new QueryBinder().bindString(1, nDt), selectSingleRow), 0);

      stmt.bindValue(1, nDt);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Date time string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(nDt);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Date time string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([nDt]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Date time string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      stmt.bindString(1, nHexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Hex string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqln, new QueryBinder().bindString(1, nHexStr), selectSingleRow), 0);

      stmt.bindValue(1, nHexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Hex string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(nHexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Hex string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([nHexStr]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "Hex string is not parsed. SQLite just converts it to something which does not match");
      stmt.reset();
      stmt.clearBindings();
    });

    const dmsqldt = "SELECT 1 FROM ts.Foo WHERE dt=?";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await dmdb.withPreparedStatement(dmsqldt, async (stmt: DMSqlStatement) => {
      const dtStr: string = "2018-10-18T12:00:00Z";
      const num: number = 2458410;
      const str: string = "2458410";
      const hexStr: string = "0x25832a";

      stmt.bindDateTime(1, dtStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, new QueryBinder().bindString(1, dtStr)), 1);
      stmt.bindString(1, dtStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValue(1, dtStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(dtStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([dtStr]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      assert.throw(() => stmt.bindInteger(1, num));
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([num])), 0);
      assert.throw(() => stmt.bindValue(1, num));
      stmt.clearBindings();

      assert.throw(() => stmt.getBinder(1).bind(num));
      stmt.clearBindings();

      assert.throw(() => stmt.bindValues([num]));
      stmt.clearBindings();

      assert.throw(() => stmt.bindString(1, str));
      stmt.clearBindings();

      assert.throw(() => stmt.bindValue(1, str));
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([str])), 0);

      assert.throw(() => stmt.getBinder(1).bind(str));
      stmt.clearBindings();

      assert.throw(() => stmt.bindValues([str]));
      stmt.clearBindings();

      assert.throw(() => stmt.bindString(1, hexStr));
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([hexStr])), 0);

      assert.throw(() => stmt.bindValue(1, hexStr));
      stmt.clearBindings();

      assert.throw(() => stmt.getBinder(1).bind(hexStr));
      stmt.clearBindings();

      assert.throw(() => stmt.bindValues([hexStr]));
      stmt.clearBindings();
    });

    const ecsqlfooId = "SELECT 1 FROM ts.Foo WHERE fooId=?";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await dmdb.withPreparedStatement(ecsqlfooId, async (stmt: DMSqlStatement) => {
      const num: number = 20;
      const str: string = "20";
      const dt: string = "2019-01-21T12:00:00Z";
      const hexStr: string = "0x14";

      stmt.bindId(1, hexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([hexStr])), 0);

      stmt.bindValues([hexStr]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindString(1, hexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValue(1, hexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(hexStr);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([hexStr]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindString(1, str);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([str])), 0);

      stmt.bindValue(1, str);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(str);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([str]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindInteger(1, num);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([num])), 0);

      stmt.bindValue(1, num);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(num);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([num]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindString(1, dt);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "DateTime string is not parsed into what it means. SQlite just uses its regular string conversion routines which don't match here");
      stmt.reset();
      stmt.clearBindings();

      assert.equal(await queryCount(dmdb, dmsqldt, QueryBinder.from([dt])), 0);

      stmt.bindValue(1, dt);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "DateTime string is not parsed into what it means. SQlite just uses its regular string conversion routines which don't match here");
      stmt.reset();
      stmt.clearBindings();

      stmt.getBinder(1).bind(dt);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "DateTime string is not parsed into what it means. SQlite just uses its regular string conversion routines which don't match here");
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([dt]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE, "DateTime string is not parsed into what it means. SQlite just uses its regular string conversion routines which don't match here");
      stmt.reset();
      stmt.clearBindings();
    });
    assert.isTrue(slm.finishAndDispose());
  });

  it("should bind numbers", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindnumbers.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
    <DMEntityClass typeName="Foo" modifier="Sealed">
      <DMProperty propertyName="D" typeName="double"/>
      <DMProperty propertyName="I" typeName="int"/>
      <DMProperty propertyName="L" typeName="long"/>
      <DMProperty propertyName="S" typeName="string"/>
      <DMProperty propertyName="Description" typeName="string"/>
    </DMEntityClass>
    </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const doubleVal: number = 3.5;
    let id = await dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindDouble')", async (stmt: DMSqlWriteStatement) => {
      stmt.bindDouble(1, doubleVal);
      stmt.bindDouble(2, doubleVal);
      stmt.bindDouble(3, doubleVal);
      stmt.bindDouble(4, doubleVal);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", async (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, doubleVal);
      assert.equal(row.i, 3);
      assert.equal(row.l, 3);
      assert.equal(row.s, "3.5");
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), { limit: { count: 1 } }, (row: any) => {
      assert.equal(row.d, doubleVal);
      assert.equal(row.i, 3);
      assert.equal(row.l, 3);
      assert.equal(row.s, "3.5");
    }), 1);

    const smallIntVal: number = 3;
    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, small int')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, smallIntVal);
      stmt.bindInteger(2, smallIntVal);
      stmt.bindInteger(3, smallIntVal);
      stmt.bindInteger(4, smallIntVal);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, smallIntVal);
      assert.equal(row.i, smallIntVal);
      assert.equal(row.l, smallIntVal);
      assert.equal(row.s, "3");
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, smallIntVal);
      assert.equal(row.i, smallIntVal);
      assert.equal(row.l, smallIntVal);
      assert.equal(row.s, "3");
    }), 1);

    const largeUnsafeNumber: number = 12312312312312323654; // too large for int64, but fits into uint64
    assert.isFalse(Number.isSafeInteger(largeUnsafeNumber));
    const largeUnsafeNumberStr: string = "12312312312312323654";
    const largeUnsafeNumberHexStr: string = "0xaade1ed08b0b5e46";

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large unsafe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeUnsafeNumberStr);
      stmt.bindInteger(2, largeUnsafeNumberStr);
      stmt.bindInteger(3, largeUnsafeNumberStr);
      stmt.bindInteger(4, largeUnsafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Str(I) si, HexStr(I) hi, Str(L) sl, HexStr(L) hl FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.si, largeUnsafeNumberStr);
      assert.equal(row.hi, largeUnsafeNumberHexStr);
      assert.equal(row.sl, largeUnsafeNumberStr);
      assert.equal(row.hl, largeUnsafeNumberHexStr);
    });

    // assert.equal(await query(dmdb, "SELECT Str(I) si, HexStr(I) hi, Str(L) sl, HexStr(L) hl FROM Test.Foo WHERE DMInstanceId=?", [id], 1, (row: any) => {
    //   assert.equal(row.si, largeUnsafeNumberStr);
    //   assert.equal(row.hi, largeUnsafeNumberHexStr);
    //   assert.equal(row.sl, largeUnsafeNumberStr);
    //   assert.equal(row.hl, largeUnsafeNumberHexStr);
    // }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large unsafe number as hexstring')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeUnsafeNumberHexStr);
      stmt.bindInteger(2, largeUnsafeNumberHexStr);
      stmt.bindInteger(3, largeUnsafeNumberHexStr);
      stmt.bindInteger(4, largeUnsafeNumberHexStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Str(I) si, HexStr(I) hi, Str(L) sl, HexStr(L) hl FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.si, largeUnsafeNumberStr);
      assert.equal(row.hi, largeUnsafeNumberHexStr);
      assert.equal(row.sl, largeUnsafeNumberStr);
      assert.equal(row.hl, largeUnsafeNumberHexStr);
    });

    // assert.equal(await query(dmdb, "SELECT Str(I) si, HexStr(I) hi, Str(L) sl, HexStr(L) hl FROM Test.Foo WHERE DMInstanceId=?", [id], 1, (row: any) => {
    //   assert.equal(row.si, largeUnsafeNumberStr);
    //   assert.equal(row.hi, largeUnsafeNumberHexStr);
    //   assert.equal(row.sl, largeUnsafeNumberStr);
    //   assert.equal(row.hl, largeUnsafeNumberHexStr);
    // }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindString, large unsafe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, largeUnsafeNumberStr);
      stmt.bindString(2, largeUnsafeNumberStr);
      stmt.bindString(3, largeUnsafeNumberStr);
      stmt.bindString(4, largeUnsafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // uint64 cannot be bound as string in SQLite. They get converted to reals
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.isNumber(row.d);
      assert.isNumber(row.i);
      assert.isNumber(row.l);
      assert.equal(row.s, largeUnsafeNumberStr);
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.isNumber(row.d);
      assert.isNumber(row.i);
      assert.isNumber(row.l);
      assert.equal(row.s, largeUnsafeNumberStr);
    }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindString, large unsafe number as hexstring')", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, largeUnsafeNumberHexStr);
      stmt.bindString(2, largeUnsafeNumberHexStr);
      stmt.bindString(3, largeUnsafeNumberHexStr);
      stmt.bindString(4, largeUnsafeNumberHexStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT CAST(D AS TEXT) d,CAST(I AS TEXT) i,CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeUnsafeNumberHexStr);
      assert.equal(row.i, largeUnsafeNumberHexStr);
      assert.equal(row.l, largeUnsafeNumberHexStr);
      assert.equal(row.s, largeUnsafeNumberHexStr);
    });

    assert.equal(await query(dmdb, "SELECT CAST(D AS TEXT) d,CAST(I AS TEXT) i,CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeUnsafeNumberHexStr);
      assert.equal(row.i, largeUnsafeNumberHexStr);
      assert.equal(row.l, largeUnsafeNumberHexStr);
      assert.equal(row.s, largeUnsafeNumberHexStr);
    }), 1);

    const largeNegUnsafeNumber: number = -123123123123123236;
    assert.isFalse(Number.isSafeInteger(largeNegUnsafeNumber));
    const largeNegUnsafeNumberStr: string = "-123123123123123236";

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large negative unsafe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeNegUnsafeNumberStr);
      stmt.bindInteger(2, largeNegUnsafeNumberStr);
      stmt.bindInteger(3, largeNegUnsafeNumberStr);
      stmt.bindInteger(4, largeNegUnsafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT CAST(I AS TEXT) i, CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.i, largeNegUnsafeNumberStr);
      assert.equal(row.l, largeNegUnsafeNumberStr);
      assert.equal(row.s, largeNegUnsafeNumberStr);
    });

    assert.equal(await query(dmdb, "SELECT CAST(I AS TEXT) i, CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.i, largeNegUnsafeNumberStr);
      assert.equal(row.l, largeNegUnsafeNumberStr);
      assert.equal(row.s, largeNegUnsafeNumberStr);
    }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindString, large negative unsafe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, largeNegUnsafeNumberStr);
      stmt.bindString(2, largeNegUnsafeNumberStr);
      stmt.bindString(3, largeNegUnsafeNumberStr);
      stmt.bindString(4, largeNegUnsafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT CAST(I AS TEXT) i, CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.i, largeNegUnsafeNumberStr);
      assert.equal(row.l, largeNegUnsafeNumberStr);
      assert.equal(row.s, largeNegUnsafeNumberStr);
    });

    assert.equal(await query(dmdb, "SELECT CAST(I AS TEXT) i, CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.i, largeNegUnsafeNumberStr);
      assert.equal(row.l, largeNegUnsafeNumberStr);
      assert.equal(row.s, largeNegUnsafeNumberStr);
    }), 1);

    const largeSafeNumber: number = 1231231231231232;
    assert.isTrue(Number.isSafeInteger(largeSafeNumber));
    const largeSafeNumberStr: string = largeSafeNumber.toString();
    const largeSafeNumberHexStr: string = "0x45fcc5c2c8500";

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large safe number')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeSafeNumber);
      stmt.bindInteger(2, largeSafeNumber);
      stmt.bindInteger(3, largeSafeNumber);
      stmt.bindInteger(4, largeSafeNumber);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I, Str(I) si, HexStr(I) hi, L, Str(L) sl, HexStr(L) hl,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.si, largeSafeNumberStr);
      assert.equal(row.hi, largeSafeNumberHexStr);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.sl, largeSafeNumberStr);
      assert.equal(row.hl, largeSafeNumberHexStr);
      assert.equal(row.s, largeSafeNumberStr);
    });

    // await query(dmdb, "SELECT D,I, Str(I) si, HexStr(I) hi, L, Str(L) sl, HexStr(L) hl,S FROM Test.Foo WHERE DMInstanceId=?", [id], 1, (row: any) => {
    //   assert.equal(row.d, largeSafeNumber);
    //   assert.equal(row.i, largeSafeNumber);
    //   assert.equal(row.si, largeSafeNumberStr);
    //   assert.equal(row.hi, largeSafeNumberHexStr);
    //   assert.equal(row.l, largeSafeNumber);
    //   assert.equal(row.sl, largeSafeNumberStr);
    //   assert.equal(row.hl, largeSafeNumberHexStr);
    //   assert.equal(row.s, largeSafeNumberStr);
    // });

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large safe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeSafeNumberStr);
      stmt.bindInteger(2, largeSafeNumberStr);
      stmt.bindInteger(3, largeSafeNumberStr);
      stmt.bindInteger(4, largeSafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.s, largeSafeNumberStr);
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.s, largeSafeNumberStr);
    }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large safe number as hexstring')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeSafeNumberHexStr);
      stmt.bindInteger(2, largeSafeNumberHexStr);
      stmt.bindInteger(3, largeSafeNumberHexStr);
      stmt.bindInteger(4, largeSafeNumberHexStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.s, largeSafeNumberStr); // even though it was bound as hex str, it gets converted to int64 before persisting
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.s, largeSafeNumberStr); // even though it was bound as hex str, it gets converted to int64 before persisting
    }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindString, large safe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, largeSafeNumberStr);
      stmt.bindString(2, largeSafeNumberStr);
      stmt.bindString(3, largeSafeNumberStr);
      stmt.bindString(4, largeSafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.s, largeSafeNumberStr);
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeSafeNumber);
      assert.equal(row.i, largeSafeNumber);
      assert.equal(row.l, largeSafeNumber);
      assert.equal(row.s, largeSafeNumberStr); // even though it was bound as hex str, it gets converted to int64 before persisting
    }), 1);

    // SQLite does not parse hex strs bound as strings.
    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindString, large safe number as hexstring')", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, largeSafeNumberHexStr);
      stmt.bindString(2, largeSafeNumberHexStr);
      stmt.bindString(3, largeSafeNumberHexStr);
      stmt.bindString(4, largeSafeNumberHexStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT CAST(D AS TEXT) d,CAST(I AS TEXT) i,CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeSafeNumberHexStr);
      assert.equal(row.i, largeSafeNumberHexStr);
      assert.equal(row.l, largeSafeNumberHexStr);
      assert.equal(row.s, largeSafeNumberHexStr);
    });

    assert.equal(await query(dmdb, "SELECT CAST(D AS TEXT) d,CAST(I AS TEXT) i,CAST(L AS TEXT) l,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeSafeNumberHexStr);
      assert.equal(row.i, largeSafeNumberHexStr);
      assert.equal(row.l, largeSafeNumberHexStr);
      assert.equal(row.s, largeSafeNumberHexStr);
    }), 1);

    const largeNegSafeNumber: number = -1231231231231232;
    assert.isTrue(Number.isSafeInteger(largeNegSafeNumber));
    const largeNegSafeNumberStr: string = largeNegSafeNumber.toString();

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large negative safe number')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeNegSafeNumber);
      stmt.bindInteger(2, largeNegSafeNumber);
      stmt.bindInteger(3, largeNegSafeNumber);
      stmt.bindInteger(4, largeNegSafeNumber);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeNegSafeNumber);
      assert.equal(row.i, largeNegSafeNumber);
      assert.equal(row.l, largeNegSafeNumber);
      assert.equal(row.s, largeNegSafeNumberStr);
    });

    assert.equal(await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeNegSafeNumber);
      assert.equal(row.i, largeNegSafeNumber);
      assert.equal(row.l, largeNegSafeNumber);
      assert.equal(row.s, largeNegSafeNumberStr);
    }), 1);

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindInteger, large negative safe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindInteger(1, largeNegSafeNumberStr);
      stmt.bindInteger(2, largeNegSafeNumberStr);
      stmt.bindInteger(3, largeNegSafeNumberStr);
      stmt.bindInteger(4, largeNegSafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeNegSafeNumber);
      assert.equal(row.i, largeNegSafeNumber);
      assert.equal(row.l, largeNegSafeNumber);
      assert.equal(row.s, largeNegSafeNumberStr);
    });

    await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeNegSafeNumber);
      assert.equal(row.i, largeNegSafeNumber);
      assert.equal(row.l, largeNegSafeNumber);
      assert.equal(row.s, largeNegSafeNumberStr);
    });

    id = dmdb.withCachedWriteStatement("INSERT INTO Test.Foo(D,I,L,S,Description) VALUES(?,?,?,?,'bindString, large negative safe number as string')", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, largeNegSafeNumberStr);
      stmt.bindString(2, largeNegSafeNumberStr);
      stmt.bindString(3, largeNegSafeNumberStr);
      stmt.bindString(4, largeNegSafeNumberStr);
      const r: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(r.status, DbResult.BE_SQLITE_DONE);
      return r.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.d, largeNegSafeNumber);
      assert.equal(row.i, largeNegSafeNumber);
      assert.equal(row.l, largeNegSafeNumber);
      assert.equal(row.s, largeNegSafeNumberStr);
    });

    await query(dmdb, "SELECT D,I,L,S FROM Test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), selectSingleRow, (row: any) => {
      assert.equal(row.d, largeNegSafeNumber);
      assert.equal(row.i, largeNegSafeNumber);
      assert.equal(row.l, largeNegSafeNumber);
      assert.equal(row.s, largeNegSafeNumberStr);
    });

  });

  it("should bind primitives", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindprimitives.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
  <DMStructClass typeName="MyStruct" modifier="Sealed">
      <DMProperty propertyName="Bl" typeName="binary"/>
      <DMProperty propertyName="Bo" typeName="boolean"/>
      <DMProperty propertyName="D" typeName="double"/>
      <DMProperty propertyName="Dt" typeName="dateTime"/>
      <DMProperty propertyName="G" typeName="Szewec.Geometry.Common.IGeometry"/>
      <DMProperty propertyName="I" typeName="int"/>
      <DMProperty propertyName="L" typeName="long"/>
      <DMProperty propertyName="P2d" typeName="Point2d"/>
      <DMProperty propertyName="P3d" typeName="Point3d"/>
      <DMProperty propertyName="S" typeName="string"/>
    </DMStructClass>
    <DMEntityClass typeName="Foo" modifier="Sealed">
      <DMProperty propertyName="Bl" typeName="binary"/>
      <DMProperty propertyName="Bo" typeName="boolean"/>
      <DMProperty propertyName="D" typeName="double"/>
      <DMProperty propertyName="Dt" typeName="dateTime"/>
      <DMProperty propertyName="G" typeName="Szewec.Geometry.Common.IGeometry"/>
      <DMProperty propertyName="I" typeName="int"/>
      <DMProperty propertyName="L" typeName="long"/>
      <DMProperty propertyName="P2d" typeName="Point2d"/>
      <DMProperty propertyName="P3d" typeName="Point3d"/>
      <DMProperty propertyName="S" typeName="string"/>
      <DMStructProperty propertyName="Struct" typeName="MyStruct"/>
    </DMEntityClass>
    </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const boolVal = true;
    const doubleVal = 3.5;
    const dtVal: string = "2018-01-23T12:24:00.000";
    const intVal = 3;
    const p2dVal = new Point2d(1, 2);
    const p3dVal = new Point3d(1, 2, 3);
    const strVal: string = "Hello world";

    const verify = async (expectedId: Id64String) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      await dmdb.withPreparedStatement("SELECT Bl,Bo,D,Dt,I,P2d,P3d,S,Struct.Bl s_bl,Struct.Bo s_bo,Struct.D s_d,Struct.Dt s_dt,Struct.I s_i,Struct.P2d s_p2d,Struct.P3d s_p3d,Struct.S s_s FROM test.Foo WHERE DMInstanceId=?", async (stmt: DMSqlStatement) => {
        stmt.bindId(1, expectedId);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        const row = stmt.getRow();
        assert.deepEqual(row.bl, blobVal);
        const f64 = new Float64Array(row.bl.buffer);
        const r2 = new Range3d(...f64);
        assert.deepEqual(r2, testRange);
        assert.equal(row.bo, boolVal);
        assert.equal(row.d, doubleVal);
        assert.equal(row.dt, dtVal);
        assert.equal(row.i, intVal);
        assert.equal(row.p2d.x, p2dVal.x);
        assert.equal(row.p2d.y, p2dVal.y);
        assert.equal(row.p3d.x, p3dVal.x);
        assert.equal(row.p3d.y, p3dVal.y);
        assert.equal(row.p3d.z, p3dVal.z);
        assert.equal(row.s, strVal);

        assert.deepEqual(row.s_bl, blobVal);
        assert.equal(row.s_bo, boolVal);
        assert.equal(row.s_d, doubleVal);
        assert.equal(row.s_dt, dtVal);
        assert.equal(row.s_i, intVal);
        assert.equal(row.s_p2d.x, p2dVal.x);
        assert.equal(row.s_p2d.y, p2dVal.y);
        assert.equal(row.s_p3d.x, p3dVal.x);
        assert.equal(row.s_p3d.y, p3dVal.y);
        assert.equal(row.s_p3d.z, p3dVal.z);
        assert.equal(row.s_s, strVal);

        assert.equal(await query(dmdb, "SELECT Bl,Bo,D,Dt,I,P2d,P3d,S,Struct.Bl s_bl,Struct.Bo s_bo,Struct.D s_d,Struct.Dt s_dt,Struct.I s_i,Struct.P2d s_p2d,Struct.P3d s_p3d,Struct.S s_s FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([expectedId]), selectSingleRow, (row1: any) => {
          assert.deepEqual(row1.bl, blobVal);
          const f64a = new Float64Array(row1.bl.buffer);
          const r2a = new Range3d(...f64a);
          assert.deepEqual(r2a, testRange);
          assert.equal(row1.bo, boolVal);
          assert.equal(row1.d, doubleVal);
          assert.equal(row1.dt, dtVal);
          assert.equal(row1.i, intVal);
          assert.equal(row1.p2d.x, p2dVal.x);
          assert.equal(row1.p2d.y, p2dVal.y);
          assert.equal(row1.p3d.x, p3dVal.x);
          assert.equal(row1.p3d.y, p3dVal.y);
          assert.equal(row1.p3d.z, p3dVal.z);
          assert.equal(row1.s, strVal);

          assert.deepEqual(row1.s_bl, blobVal);
          assert.equal(row1.s_bo, boolVal);
          assert.equal(row1.s_d, doubleVal);
          assert.equal(row1.s_dt, dtVal);
          assert.equal(row1.s_i, intVal);
          assert.equal(row1.s_p2d.x, p2dVal.x);
          assert.equal(row1.s_p2d.y, p2dVal.y);
          assert.equal(row1.s_p3d.x, p3dVal.x);
          assert.equal(row1.s_p3d.y, p3dVal.y);
          assert.equal(row1.s_p3d.z, p3dVal.z);
          assert.equal(row1.s_s, strVal);
        }), 1);
      });
    };

    const ids = new Array<Id64String>();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("INSERT INTO test.Foo(Bl,Bo,D,Dt,I,P2d,P3d,S,Struct.Bl,Struct.Bo,Struct.D,Struct.Dt,Struct.I,Struct.P2d,Struct.P3d,Struct.S) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (stmt: DMSqlStatement) => {
      stmt.bindBlob(1, blobVal);
      stmt.bindBoolean(2, boolVal);
      stmt.bindDouble(3, doubleVal);
      stmt.bindDateTime(4, dtVal);
      stmt.bindInteger(5, intVal);
      stmt.bindPoint2d(6, p2dVal);
      stmt.bindPoint3d(7, p3dVal);
      stmt.bindString(8, strVal);
      stmt.bindBlob(9, blobVal);
      stmt.bindBoolean(10, boolVal);
      stmt.bindDouble(11, doubleVal);
      stmt.bindDateTime(12, dtVal);
      stmt.bindInteger(13, intVal);
      stmt.bindPoint2d(14, p2dVal);
      stmt.bindPoint3d(15, p3dVal);
      stmt.bindString(16, strVal);

      let res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      ids.push(res.id!);
      stmt.reset();
      stmt.clearBindings();
      stmt.bindValues([blobVal, boolVal, doubleVal, dtVal, intVal, p2dVal, p3dVal, strVal, blobVal, boolVal, doubleVal, dtVal, intVal, p2dVal, p3dVal, strVal]);

      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      ids.push(res.id!);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("INSERT INTO test.Foo(Bl,Bo,D,Dt,I,P2d,P3d,S,Struct.Bl,Struct.Bo,Struct.D,Struct.Dt,Struct.I,Struct.P2d,Struct.P3d,Struct.S) VALUES(:bl,:bo,:d,:dt,:i,:p2d,:p3d,:s,:s_bl,:s_bo,:s_d,:s_dt,:s_i,:s_p2d,:s_p3d,:s_s)", (stmt: DMSqlStatement) => {
      stmt.bindBlob("bl", blobVal);
      stmt.bindBoolean("bo", boolVal);
      stmt.bindDouble("d", doubleVal);
      stmt.bindDateTime("dt", dtVal);
      stmt.bindInteger("i", intVal);
      stmt.bindPoint2d("p2d", p2dVal);
      stmt.bindPoint3d("p3d", p3dVal);
      stmt.bindString("s", strVal);

      stmt.bindBlob("s_bl", blobVal);
      stmt.bindBoolean("s_bo", boolVal);
      stmt.bindDouble("s_d", doubleVal);
      stmt.bindDateTime("s_dt", dtVal);
      stmt.bindInteger("s_i", intVal);
      stmt.bindPoint2d("s_p2d", p2dVal);
      stmt.bindPoint3d("s_p3d", p3dVal);
      stmt.bindString("s_s", strVal);

      let res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      ids.push(res.id!);
      stmt.reset();
      stmt.clearBindings();
      stmt.bindValues({
        bl: blobVal, bo: boolVal, d: doubleVal, dt: dtVal,
        i: intVal, p2d: p2dVal, p3d: p3dVal, s: strVal,
        s_bl: blobVal, s_bo: boolVal, s_d: doubleVal, s_dt: dtVal,
        s_i: intVal, s_p2d: p2dVal, s_p3d: p3dVal, s_s: strVal,
      });

      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      ids.push(res.id!);
    });

    for (const id of ids) {
      await verify(id);
    }
  });

  it("should bind structs", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindstructs.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMStructClass typeName="MyStruct" modifier="Sealed">
        <DMProperty propertyName="Bl" typeName="binary"/>
        <DMProperty propertyName="Bo" typeName="boolean"/>
        <DMProperty propertyName="D" typeName="double"/>
        <DMProperty propertyName="Dt" typeName="dateTime"/>
        <DMProperty propertyName="G" typeName="Szewec.Geometry.Common.IGeometry"/>
        <DMProperty propertyName="I" typeName="int"/>
        <DMProperty propertyName="L" typeName="long"/>
        <DMProperty propertyName="P2d" typeName="Point2d"/>
        <DMProperty propertyName="P3d" typeName="Point3d"/>
        <DMProperty propertyName="S" typeName="string"/>
      </DMStructClass>
      <DMEntityClass typeName="Foo" modifier="Sealed">
        <DMStructProperty propertyName="Struct" typeName="MyStruct"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const structVal = {
      bl: blobVal, bo: true, d: 3.5,
      dt: "2018-01-23T12:24:00.000",
      i: 3, p2d: new Point2d(1, 2), p3d: new Point3d(1, 2, 3), s: "Hello World",
    };

    const verify = async (expectedId: Id64String) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      await dmdb.withPreparedStatement("SELECT Struct FROM test.Foo WHERE DMInstanceId=?", async (stmt: DMSqlStatement) => {
        stmt.bindId(1, expectedId);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        const row = stmt.getRow();
        assert.isTrue(blobEqual(row.struct.bl, structVal.bl));
        assert.equal(row.struct.bo, structVal.bo);
        assert.equal(row.struct.d, structVal.d);
        assert.equal(row.struct.dt, structVal.dt);
        assert.equal(row.struct.i, structVal.i);
        assert.equal(row.struct.p2d.x, structVal.p2d.x);
        assert.equal(row.struct.p2d.y, structVal.p2d.y);
        assert.equal(row.struct.p3d.x, structVal.p3d.x);
        assert.equal(row.struct.p3d.y, structVal.p3d.y);
        assert.equal(row.struct.p3d.z, structVal.p3d.z);
        assert.equal(row.struct.s, structVal.s);

        assert.equal(await query(dmdb, "SELECT Struct FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([expectedId]), selectSingleRow, (row1: any) => {
          assert.isTrue(blobEqual(row1.struct.bl, structVal.bl));
          assert.equal(row1.struct.bo, structVal.bo);
          assert.equal(row1.struct.d, structVal.d);
          assert.equal(row1.struct.dt, structVal.dt);
          assert.equal(row1.struct.i, structVal.i);
          assert.equal(row1.struct.p2d.x, structVal.p2d.x);
          assert.equal(row1.struct.p2d.y, structVal.p2d.y);
          assert.equal(row1.struct.p3d.x, structVal.p3d.x);
          assert.equal(row1.struct.p3d.y, structVal.p3d.y);
          assert.equal(row1.struct.p3d.z, structVal.p3d.z);
          assert.equal(row1.struct.s, structVal.s);
        }), 1);
      });
    };
    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Struct) VALUES(?)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindStruct(1, structVal);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Struct) VALUES(?)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindValues([structVal]);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Struct) VALUES(:str)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindStruct("str", structVal);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Struct) VALUES(:str)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindValues({ str: structVal });
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

  });

  it("should bind arrays", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindarrays.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMStructClass typeName="Location" modifier="Sealed">
        <DMProperty propertyName="City" typeName="string"/>
        <DMProperty propertyName="Zip" typeName="int"/>
      </DMStructClass>
      <DMEntityClass typeName="Foo" modifier="Sealed">
        <DMArrayProperty propertyName="I_Array" typeName="int"/>
        <DMArrayProperty propertyName="Dt_Array" typeName="dateTime"/>
        <DMStructArrayProperty propertyName="Addresses" typeName="Location"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const intArray = [1, 2, 3];
    const dtArray = ["2018-01-23T00:00:00.000", "2018-01-23T16:39:00.000"];
    const addressArray = [{ city: "London", zip: 10000 }, { city: "Manchester", zip: 20000 }, { city: "Edinburgh", zip: 30000 }];

    const verify = async (expectedId: Id64String) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      await dmdb.withPreparedStatement("SELECT I_Array, Dt_Array, Addresses FROM test.Foo WHERE DMInstanceId=?", async (stmt: DMSqlStatement) => {
        stmt.bindId(1, expectedId);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        const row = stmt.getRow();

        // don't know why assert.equal doesn't work on arrays directly
        assert.equal(row.i_Array.length, intArray.length);
        for (let i = 0; i < intArray.length; i++) {
          assert.equal(row.i_Array[i], intArray[i]);
        }

        assert.equal(row.dt_Array.length, dtArray.length);
        for (let i = 0; i < dtArray.length; i++) {
          assert.equal(row.dt_Array[i], dtArray[i]);
        }

        assert.equal(row.addresses.length, addressArray.length);
        for (let i = 0; i < addressArray.length; i++) {
          assert.equal(row.addresses[i].city, addressArray[i].city);
          assert.equal(row.addresses[i].zip, addressArray[i].zip);
        }
      });

      assert.equal(await query(dmdb, "SELECT I_Array, Dt_Array, Addresses FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([expectedId]), selectSingleRow, (row: any) => {
        // don't know why assert.equal doesn't work on arrays directly
        assert.equal(row.i_Array.length, intArray.length);
        for (let i = 0; i < intArray.length; i++) {
          assert.equal(row.i_Array[i], intArray[i]);
        }

        assert.equal(row.dt_Array.length, dtArray.length);
        for (let i = 0; i < dtArray.length; i++) {
          assert.equal(row.dt_Array[i], dtArray[i]);
        }

        assert.equal(row.addresses.length, addressArray.length);
        for (let i = 0; i < addressArray.length; i++) {
          assert.equal(row.addresses[i].city, addressArray[i].city);
          assert.equal(row.addresses[i].zip, addressArray[i].zip);
        }
      }), 1);
    };

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(I_Array,Dt_Array,Addresses) VALUES(?,?,?)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindArray(1, intArray);
      stmt.bindArray(2, dtArray);
      stmt.bindArray(3, addressArray);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(I_Array,Dt_Array,Addresses) VALUES(?,?,?)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindValues([intArray, dtArray, addressArray]);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(I_Array,Dt_Array,Addresses) VALUES(:iarray,:dtarray,:addresses)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindArray("iarray", intArray);
      stmt.bindArray("dtarray", dtArray);
      stmt.bindArray("addresses", addressArray);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });

    await dmdb.withCachedWriteStatement("INSERT INTO test.Foo(I_Array,Dt_Array,Addresses) VALUES(:iarray,:dtarray,:addresses)", async (stmt: DMSqlWriteStatement) => {
      stmt.bindValues({ iarray: intArray, dtarray: dtArray, addresses: addressArray });
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      await verify(res.id!);
    });
  });

  it("should bind navigation", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindnavigation.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
    <DMEntityClass typeName="Parent" modifier="Sealed">
      <DMProperty propertyName="Code" typeName="string"/>
    </DMEntityClass>
    <DMEntityClass typeName="Child" modifier="Sealed">
      <DMProperty propertyName="Name" typeName="string"/>
      <DMNavigationProperty propertyName="Parent" relationshipName="ParentHasChildren" direction="backward"/>
    </DMEntityClass>
    <DMRelationshipClass typeName="ParentHasChildren" modifier="None" strength="embedding">
      <Source multiplicity="(0..1)" roleLabel="has" polymorphic="false">
          <Class class="Parent"/>
      </Source>
      <Target multiplicity="(0..*)" roleLabel="has" polymorphic="false">
          <Class class="Child"/>
      </Target>
    </DMRelationshipClass>
    </DMSchema>`);

    assert.isTrue(dmdb.isOpen);

    const parentId: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Parent(Code) VALUES('Parent 1')", (stmt: DMSqlWriteStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });

    const childIds = new Array<Id64String>();
    dmdb.withCachedWriteStatement("INSERT INTO test.Child(Name,Parent) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, "Child 1");
      stmt.bindNavigation(2, { id: parentId, relClassName: "Test.ParentHasChildren" });
      let res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      childIds.push(res.id!);

      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues(["Child 2", { id: parentId, relClassName: "Test.ParentHasChildren" }]);
      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      childIds.push(res.id!);
    });

    dmdb.withCachedWriteStatement("INSERT INTO test.Child(Name,Parent) VALUES(:name,:parent)", (stmt: DMSqlWriteStatement) => {
      stmt.bindString("name", "Child 3");
      stmt.bindNavigation("parent", { id: parentId, relClassName: "Test.ParentHasChildren" });
      let res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      childIds.push(res.id!);

      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues({ name: "Child 4", parent: { id: parentId, relClassName: "Test.ParentHasChildren" } });
      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      childIds.push(res.id!);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Name,Parent FROM test.Child ORDER BY Name", (stmt: DMSqlStatement) => {
      let rowCount: number = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        const row = stmt.getRow();
        assert.equal(row.name, `Child ${rowCount}`);
        const parent: NavigationValue = row.parent as NavigationValue;
        assert.equal(parent.id, parentId);
        assert.equal(parent.relClassName, "Test.ParentHasChildren");
      }
      assert.equal(rowCount, 4);
    });

    let rowCount2: number = 0;
    assert.equal(await query(dmdb, "SELECT Name,Parent FROM test.Child ORDER BY Name", QueryBinder.from([]), undefined, (row: any) => {
      rowCount2++;
      assert.equal(row.name, `Child ${rowCount2}`);
      const parent: NavigationValue = row.parent as NavigationValue;
      assert.equal(parent.id, parentId);
      assert.equal(parent.relClassName, "Test.ParentHasChildren");
    }), 4);
  });

  it("should bind Range3d for parameter in spatial sql function", async () => {
    const iVault = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("DMSqlStatement", "BindRange3d.dtw"), { rootSubject: { name: "BindRange3d" } });
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      iVault.withPreparedStatement("SELECT e.DMInstanceId FROM bis.Element e, bis.SpatialIndex rt WHERE rt.DMInstanceId MATCH DGN_spatial_overlap_aabb(?) AND e.DMInstanceId=rt.DMInstanceId",
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        (stmt: DMSqlStatement) => {
          stmt.bindRange3d(1, new Range3d(0.0, 0.0, 0.0, 1000.0, 1000.0, 1000.0));
          assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
        });

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      iVault.withPreparedStatement("SELECT e.DMInstanceId FROM bis.Element e, bis.SpatialIndex rt WHERE rt.DMInstanceId MATCH DGN_spatial_overlap_aabb(?) AND e.DMInstanceId=rt.DMInstanceId",
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        (stmt: DMSqlStatement) => {
          stmt.bindValues([new Range3d(0.0, 0.0, 0.0, 1000.0, 1000.0, 1000.0)]);
          assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
        });

    } finally {
      iVault.close();
    }
  });

  it("should bind Range3d", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindrange3d.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="Range3d" typeName="binary"/>
        </DMEntityClass>
       </DMSchema>`);

    assert.isTrue(dmdb.isOpen);

    const id: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo([Range3d]) VALUES(?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindRange3d(1, testRange);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });
    dmdb.saveChanges();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT [Range3d] FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const rangeBlob: Uint8Array = stmt.getValue(0).getBlob();
      const rangeFloatArray = new Float64Array(rangeBlob.buffer);
      assert.equal(rangeFloatArray.length, 6);
      const actualRange = new Range3d(...rangeFloatArray);
      assert.isTrue(actualRange.isAlmostEqual(testRange));
    });
  });

  it("should bind IdSets", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindids.dmdb");
    assert.isTrue(dmdb.isOpen);

    const idNumbers: number[] = [4444, 4545, 1234, 6758, 1312];
    dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      idNumbers.forEach((idNum: number) => {
        const expectedId = Id64.fromLocalAndBriefcaseIds(idNum, 0);
        stmt.bindId(1, expectedId);
        stmt.bindString(2, `${idNum}.txt`);
        const r: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(r.status, DbResult.BE_SQLITE_DONE);
        assert.isDefined(r.id);
        assert.equal(r.id!, expectedId);
        dmdb.saveChanges();

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        dmdb.withStatement(`SELECT DMInstanceId, DMClassId, Name FROM dmdbf.ExternalFileInfo WHERE DMInstanceId=${expectedId}`, (confstmt: DMSqlStatement) => {
          assert.equal(confstmt.step(), DbResult.BE_SQLITE_ROW);
          const row = confstmt.getRow();
          assert.equal(row.id, expectedId);
          assert.equal(row.className, "DMDbFileInfo.ExternalFileInfo");
          assert.equal(row.name, `${Id64.getLocalId(expectedId).toString()}.txt`);
        });
        stmt.reset();
        stmt.clearBindings();
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT DMInstanceId, DMClassId, Name from dmdbf.ExternalFileInfo WHERE InVirtualSet(?, DMInstanceId)", (stmt: DMSqlStatement) => {
      let idSet: Id64String[] = [];
      stmt.bindIdSet(1, idSet);
      let result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();

      idSet = [Id64.fromLocalAndBriefcaseIds(idNumbers[2], 0)];
      stmt.bindIdSet(1, idSet);
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_ROW);
      let row = stmt.getRow();
      assert.equal(row.name, `${idNumbers[2]}.txt`);
      stmt.reset();
      stmt.clearBindings();

      idSet.push(idNumbers[0].toString());
      stmt.bindIdSet(1, idSet);
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_ROW);
      row = stmt.getRow();
      assert.equal(row.name, `${idNumbers[2]}.txt`);
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_ROW);
      row = stmt.getRow();
      assert.equal(row.name, `${idNumbers[0]}.txt`);
    });
  });

  it("should bind IdSets to IdSet Virtual Table", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindids.dmdb");
    assert.isTrue(dmdb.isOpen);

    const idNumbers: number[] = [4444, 4545, 1234, 6758, 1312];
    dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      idNumbers.forEach((idNum: number) => {
        const expectedId = Id64.fromLocalAndBriefcaseIds(idNum, 0);
        stmt.bindId(1, expectedId);
        stmt.bindString(2, `${idNum}.txt`);
        const r: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(r.status, DbResult.BE_SQLITE_DONE);
        assert.isDefined(r.id);
        assert.equal(r.id!, expectedId);
        dmdb.saveChanges();

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        dmdb.withStatement(`SELECT DMInstanceId, DMClassId, Name FROM dmdbf.ExternalFileInfo WHERE DMInstanceId=${expectedId}`, (confstmt: DMSqlStatement) => {
          assert.equal(confstmt.step(), DbResult.BE_SQLITE_ROW);
          const row = confstmt.getRow();
          assert.equal(row.id, expectedId);
          assert.equal(row.className, "DMDbFileInfo.ExternalFileInfo");
          assert.equal(row.name, `${Id64.getLocalId(expectedId).toString()}.txt`);
        });
        stmt.reset();
        stmt.clearBindings();
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT DMInstanceId, DMClassId, Name from dmdbf.ExternalFileInfo, IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", (stmt: DMSqlStatement) => {
      let idSet: Id64String[] = [];
      stmt.bindIdSet(1, idSet);
      let result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();

      idSet = [Id64.fromLocalAndBriefcaseIds(idNumbers[2], 0)];
      stmt.bindIdSet(1, idSet);
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_ROW);
      let row = stmt.getRow();
      assert.equal(row.name, `${idNumbers[2]}.txt`);
      stmt.reset();
      stmt.clearBindings();

      idSet.push(idNumbers[0].toString());
      stmt.bindIdSet(1, idSet);
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_ROW);
      row = stmt.getRow();
      assert.equal(row.name, `${idNumbers[2]}.txt`);
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_ROW);
      row = stmt.getRow();
      assert.equal(row.name, `${idNumbers[0]}.txt`);
    });
  });

  it("Error Checking For binding to IdSet statements", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindids.dmdb");
    assert.isTrue(dmdb.isOpen);

    const idNumbers: number[] = [4444, 4545, 1234, 6758, 1312];
    dmdb.withCachedWriteStatement("INSERT INTO dmdbf.ExternalFileInfo(DMInstanceId,Name) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      idNumbers.forEach((idNum: number) => {
        const expectedId = Id64.fromLocalAndBriefcaseIds(idNum, 0);
        stmt.bindId(1, expectedId);
        stmt.bindString(2, `${idNum}.txt`);
        const r: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(r.status, DbResult.BE_SQLITE_DONE);
        assert.isDefined(r.id);
        assert.equal(r.id!, expectedId);
        dmdb.saveChanges();

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        dmdb.withStatement(`SELECT DMInstanceId, DMClassId, Name FROM dmdbf.ExternalFileInfo WHERE DMInstanceId=${expectedId}`, (confstmt: DMSqlStatement) => {
          assert.equal(confstmt.step(), DbResult.BE_SQLITE_ROW);
          const row = confstmt.getRow();
          assert.equal(row.id, expectedId);
          assert.equal(row.className, "DMDbFileInfo.ExternalFileInfo");
          assert.equal(row.name, `${Id64.getLocalId(expectedId).toString()}.txt`);
        });
        stmt.reset();
        stmt.clearBindings();
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT DMInstanceId, DMClassId, Name from dmdbf.ExternalFileInfo, ECVLib.IdSet(?) WHERE id = DMInstanceId DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES", (stmt: DMSqlStatement) => {
      let idSet: Id64String[] = [];
      stmt.bindIdSet(1, idSet);
      let result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();

      idSet = ["0X1", "ABC"];
      try {
        stmt.bindIdSet(1, idSet);
      } catch (err: any) {
        assert.equal(err.message, "Error binding id set");
      }
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();

      try {
        stmt.bindId(1, idNumbers[0].toString());
      } catch (err: any) {
        assert.equal(err.message, "Error binding Id");
      }
      result = stmt.step();
      assert.equal(result, DbResult.BE_SQLITE_DONE);
    });
  });

  /* This test doesn't do anything specific with the binder life time but just runs a few scenarios
     with and without statement cache to test that stuff works fine */
  it("check DMSqlBinder life time", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "dmsqlbinderlifetime.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
    <DMStructClass typeName="Address" modifier="Sealed">
      <DMProperty propertyName="Street" typeName="string"/>
      <DMProperty propertyName="City" typeName="string"/>
      <DMProperty propertyName="Zip" typeName="int"/>
    </DMStructClass>
    <DMEntityClass typeName="Person" modifier="Sealed">
      <DMProperty propertyName="Name" typeName="string"/>
      <DMProperty propertyName="Age" typeName="int"/>
      <DMStructProperty propertyName="Location" typeName="Address"/>
    </DMEntityClass>
    </DMSchema>`);

    assert.isTrue(dmdb.isOpen);

    let id1: Id64String = "", id2: Id64String = "";

    // *** test without statement cache
    dmdb.withCachedWriteStatement("INSERT INTO test.Person(Name,Age,Location) VALUES(?,?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, "Mary Miller");
      stmt.bindInteger(2, 30);
      stmt.bindStruct(3, { Street: "2000 Main Street", City: "New York", Zip: 12311 });

      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      id1 = res.id!;
      assert.isTrue(Id64.isValidId64(id1));
    });


    // *** test withstatement cache
    dmdb.withCachedWriteStatement("INSERT INTO test.Person(Name,Age,Location) VALUES(?,?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, "Mary Miller");
      stmt.bindInteger(2, 30);
      stmt.bindStruct(3, { Street: "2000 Main Street", City: "New York", Zip: 12311 });

      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      id2 = res.id!;
      assert.isTrue(Id64.isValidId64(id2));
    });

    {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      using stmt = dmdb.prepareStatement("SELECT DMInstanceId,DMClassId,Name,Age,Location FROM test.Person ORDER BY DMInstanceId");
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        const row = stmt.getRow();
        if (rowCount === 1)
          assert.equal(row.id, id1);
        else
          assert.equal(row.id, id2);

        assert.equal(row.className, "Test.Person");
        assert.equal(row.name, "Mary Miller");
        assert.equal(row.age, 30);
        assert.equal(row.location.street, "2000 Main Street");
        assert.equal(row.location.city, "New York");
        assert.equal(row.location.zip, 12311);
      }
      assert.equal(rowCount, 2);
    }

    let rowCount2: number = 0;
    assert.equal(await query(dmdb, "SELECT DMInstanceId,DMClassId,Name,Age,Location FROM test.Person ORDER BY DMInstanceId", QueryBinder.from([]), undefined, (row: any) => {
      rowCount2++;
      if (rowCount2 === 1)
        assert.equal(row.id, id1);
      else
        assert.equal(row.id, id2);

      assert.equal(row.className, "Test.Person");
      assert.equal(row.name, "Mary Miller");
      assert.equal(row.age, 30);
      assert.equal(row.location.street, "2000 Main Street");
      assert.equal(row.location.city, "New York");
      assert.equal(row.location.zip, 12311);
    }), 2);
  });

  it("getRow() with primitives values", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "getprimitives.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMEntityClass typeName="Foo" modifier="Sealed">
        <DMProperty propertyName="Bl" typeName="binary"/>
        <DMProperty propertyName="Bo" typeName="boolean"/>
        <DMProperty propertyName="D" typeName="double"/>
        <DMProperty propertyName="Dt" typeName="dateTime"/>
        <DMProperty propertyName="G" typeName="Szewec.Geometry.Common.IGeometry"/>
        <DMProperty propertyName="I" typeName="int"/>
        <DMProperty propertyName="L" typeName="long"/>
        <DMProperty propertyName="P2d" typeName="Point2d"/>
        <DMProperty propertyName="P3d" typeName="Point3d"/>
        <DMProperty propertyName="S" typeName="string"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const boolVal: boolean = true;
    const doubleVal: number = 3.5;
    const dtVal: string = "2018-01-23T12:24:00.000";
    const intVal: number = 3;
    const p2dVal = new Point2d(1, 2);
    const p3dVal = new Point3d(1, 2, 3);
    const strVal: string = "Hello world";

    const id: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Bl,Bo,D,Dt,I,P2d,P3d,S) VALUES(?,?,?,?,?,?,?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindBlob(1, blobVal);
      stmt.bindBoolean(2, boolVal);
      stmt.bindDouble(3, doubleVal);
      stmt.bindDateTime(4, dtVal);
      stmt.bindInteger(5, intVal);
      stmt.bindPoint2d(6, p2dVal);
      stmt.bindPoint3d(7, p3dVal);
      stmt.bindString(8, strVal);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      return res.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT DMInstanceId, DMClassId, Bl,Bo,D,Dt,I,P2d,P3d,S FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.id, id);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, blobVal);
      assert.equal(row.bo, boolVal);
      assert.equal(row.d, doubleVal);
      assert.equal(row.dt, dtVal);
      assert.equal(row.i, intVal);
      assert.equal(row.p2d.x, p2dVal.x);
      assert.equal(row.p2d.y, p2dVal.y);
      assert.equal(row.p3d.x, p3dVal.x);
      assert.equal(row.p3d.y, p3dVal.y);
      assert.equal(row.p3d.z, p3dVal.z);
      assert.equal(row.s, strVal);
    });

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), { abbreviateBlobs: true, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, id);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, abbreviatedBlobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), { abbreviateBlobs: false, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, id);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, blobVal);
    }), 1);

    // assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl,Bo,D,Dt,I,P2d,P3d,S FROM test.Foo WHERE DMInstanceId=?", [id], 1, (row: any) => {
    //   assert.equal(row.id, id);
    //   assert.equal(row.className, "Test.Foo");
    //   assert.deepEqual(row.bl, blobVal);
    //   assert.equal(row.bo, boolVal);
    //   assert.equal(row.d, doubleVal);
    //   assert.equal(row.dt, dtVal);
    //   assert.equal(row.i, intVal);
    //   assert.equal(row.p2d.x, p2dVal.x);
    //   assert.equal(row.p2d.y, p2dVal.y);
    //   assert.equal(row.p3d.x, p3dVal.x);
    //   assert.equal(row.p3d.y, p3dVal.y);
    //   assert.equal(row.p3d.z, p3dVal.z);
    //   assert.equal(row.s, strVal);
    // }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Bl AS Blobby, I+10, Lower(S), Upper(S) CapitalS FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.deepEqual(row.blobby, blobVal);
      assert.equal(row["[I] + 10"], intVal + 10);
      assert.equal(row["lower([S])"], strVal.toLowerCase());
      assert.equal(row.capitalS, strVal.toUpperCase());
    });

    // assert.equal(await query(dmdb, "SELECT Bl AS Blobby, I+10, Lower(S), Upper(S) CapitalS FROM test.Foo WHERE DMInstanceId=?", [id], 1, (row: any) => {
    //   assert.deepEqual(row.blobby, blobVal);
    //   assert.equal(row["[I] + 10"], intVal + 10);
    //   assert.equal(row["lower([S])"], strVal.toLowerCase());
    //   assert.equal(row.capitalS, strVal.toUpperCase());
    // }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const testSchemaId: Id64String = dmdb.withPreparedStatement("SELECT DMInstanceId FROM meta.DMSchemaDef WHERE Name='Test'", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      return Id64.fromJSON(row.id);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const fooClassId: Id64String = dmdb.withPreparedStatement("SELECT DMInstanceId FROM meta.DMClassDef WHERE Name='Foo'", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      return Id64.fromJSON(row.id);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT s.DMInstanceId, c.DMInstanceId, c.Name, s.Name FROM meta.DMClassDef c JOIN meta.DMSchemaDef s ON c.Schema.Id=s.DMInstanceId WHERE s.Name='Test' AND c.Name='Foo'", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.id, testSchemaId);
      assert.equal(row.id_1, fooClassId);
    });

    assert.equal(await query(dmdb, "SELECT s.DMInstanceId, c.DMInstanceId, c.Name, s.Name FROM meta.DMClassDef c JOIN meta.DMSchemaDef s ON c.Schema.Id=s.DMInstanceId WHERE s.Name='Test' AND c.Name='Foo'", QueryBinder.from([]), selectSingleRow, (row: any) => {
      assert.equal(row.id, testSchemaId);
      assert.equal(row.id_1, fooClassId);
    }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT count(*) cnt FROM meta.DMSchemaDef", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.isDefined(row.cnt);
      assert.equal(typeof (row.cnt), "number");
      assert.equal(row.cnt, 6);
    });

    assert.equal(await query(dmdb, "SELECT count(*) cnt FROM meta.DMSchemaDef", QueryBinder.from([]), selectSingleRow, (row: any) => {
      assert.isDefined(row.cnt);
      assert.equal(typeof (row.cnt), "number");
      assert.equal(row.cnt, 6);
    }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT 1 FROM meta.DMSchemaDef LIMIT 1", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(typeof (row["1"]), "number");
      assert.equal(row["1"], 1);
    });

    assert.equal(await query(dmdb, "SELECT 1 FROM meta.DMSchemaDef LIMIT 1", QueryBinder.from([]), undefined, (row: any) => {
      assert.equal(typeof (row["1"]), "number");
      assert.equal(row["1"], 1);
    }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT NULL FROM meta.DMSchemaDef LIMIT 1", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(Object.entries(row).length, 0);
    });

    assert.equal(await query(dmdb, "SELECT NULL FROM meta.DMSchemaDef LIMIT 1", QueryBinder.from([]), undefined, (row: any) => {
      assert.equal(Object.entries(row).length, 0);
    }), 1);
  });

  it("getRow() with abbreviated blobs", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "getblobs.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMEntityClass typeName="Foo" modifier="Sealed">
        <DMProperty propertyName="Bl" typeName="binary"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const singleBlobVal = blobVal.slice(0, 1);
    const abbreviatedSingleBlobVal = `{"bytes":${singleBlobVal.byteLength}}`;
    const emptyBlobVal = new Uint8Array();

    const fullId: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Bl) VALUES(?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindBlob(1, blobVal);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      return res.id!;
    });

    const singleId: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Bl) VALUES(?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindBlob(1, singleBlobVal);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      return res.id!;
    });

    const emptyId: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Bl) VALUES(?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindBlob(1, emptyBlobVal);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      return res.id!;
    });

    const nullId: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Bl) VALUES(?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindNull(1);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      return res.id!;
    });

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([fullId]), { abbreviateBlobs: true, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, fullId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, abbreviatedBlobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([fullId]), { abbreviateBlobs: false, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, fullId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, blobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([fullId]), selectSingleRow, (row: any) => {
      assert.equal(row.id, fullId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, blobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([singleId]), { abbreviateBlobs: true, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, singleId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, abbreviatedSingleBlobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([singleId]), { abbreviateBlobs: false, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, singleId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, singleBlobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([singleId]), { ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, singleId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, singleBlobVal);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([emptyId]), { abbreviateBlobs: true, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, emptyId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, "{\"bytes\":0}");
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([emptyId]), { abbreviateBlobs: false, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, emptyId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl.length, 0);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([emptyId]), selectSingleRow, (row: any) => {
      assert.equal(row.id, emptyId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl.length, 0);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([nullId]), { abbreviateBlobs: true, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, nullId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, undefined);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([nullId]), { abbreviateBlobs: false, ...selectSingleRow }, (row: any) => {
      assert.equal(row.id, nullId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, undefined);
    }), 1);

    assert.equal(await query(dmdb, "SELECT DMInstanceId, DMClassId, Bl FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([nullId]), selectSingleRow, (row: any) => {
      assert.equal(row.id, nullId);
      assert.equal(row.className, "Test.Foo");
      assert.deepEqual(row.bl, undefined);
    }), 1);
  });

  it("getRow() with navigation properties and relationships", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "getnavandrels.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMEntityClass typeName="Parent" modifier="Sealed">
          <DMProperty propertyName="Code" typeName="string"/>
        </DMEntityClass>
        <DMEntityClass typeName="Child" modifier="Sealed">
          <DMProperty propertyName="Name" typeName="string"/>
          <DMNavigationProperty propertyName="Parent" relationshipName="ParentHasChildren" direction="backward"/>
        </DMEntityClass>
        <DMRelationshipClass typeName="ParentHasChildren" modifier="None" strength="embedding">
          <Source multiplicity="(0..1)" roleLabel="has" polymorphic="false">
              <Class class="Parent"/>
          </Source>
          <Target multiplicity="(0..*)" roleLabel="has" polymorphic="false">
              <Class class="Child"/>
          </Target>
        </DMRelationshipClass>
        </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    let rowCount: number;
    const parentId: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Parent(Code) VALUES('Parent 1')", (stmt: DMSqlWriteStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });

    const childIds = new Array<Id64String>();
    dmdb.withCachedWriteStatement("INSERT INTO test.Child(Name,Parent) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindString(1, "Child 1");
      stmt.bindNavigation(2, { id: parentId, relClassName: "Test.ParentHasChildren" });
      let res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      childIds.push(res.id!);

      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues(["Child 2", { id: parentId, relClassName: "Test.ParentHasChildren" }]);
      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      childIds.push(res.id!);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Name,Parent FROM test.Child ORDER BY Name", (stmt: DMSqlStatement) => {
      rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        const row = stmt.getRow();
        assert.equal(row.name, `Child ${rowCount}`);
        assert.equal(row.parent.id, parentId);
        assert.equal(row.parent.relClassName, "Test.ParentHasChildren");
      }
      assert.equal(rowCount, 2);
    });

    rowCount = 0;
    assert.equal(await query(dmdb, "SELECT Name,Parent FROM test.Child ORDER BY Name", QueryBinder.from([]), undefined, (row: any) => {
      rowCount++;
      assert.equal(row.name, `Child ${rowCount}`);
      assert.equal(row.parent.id, parentId);
      assert.equal(row.parent.relClassName, "Test.ParentHasChildren");
    }), 2);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Name,Parent.Id,Parent.RelDMClassId, Parent.Id myParentId, Parent.RelDMClassId myParentRelClassId FROM test.Child ORDER BY Name", (stmt: DMSqlStatement) => {
      rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        const row = stmt.getRow();
        assert.equal(row.name, `Child ${rowCount}`);
        assert.equal(row["parent.id"], parentId);
        assert.equal(row["parent.relClassName"], "Test.ParentHasChildren");
        assert.equal(row.myParentId, parentId);
        assert.isTrue(Id64.isValidId64(row.myParentRelClassId));
      }
      assert.equal(rowCount, 2);
    });

    rowCount = 0;
    assert.equal(await query(dmdb, "SELECT Name,Parent.Id,Parent.RelDMClassId, Parent.Id myParentId, Parent.RelDMClassId myParentRelClassId FROM test.Child ORDER BY Name", QueryBinder.from([]), undefined, (row: any) => {
      rowCount++;
      assert.equal(row.name, `Child ${rowCount}`);
      assert.equal(row["parent.id"], parentId);
      assert.equal(row["parent.relClassName"], "Test.ParentHasChildren");
      assert.equal(row.myParentId, parentId);
      assert.isTrue(Id64.isValidId64(row.myParentRelClassId));
    }), 2);

    const childId: Id64String = childIds[0];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT DMInstanceId,DMClassId,SourceDMInstanceId,SourceDMClassId,TargetDMInstanceId,TargetDMClassId FROM test.ParentHasChildren WHERE TargetDMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, childId);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.id, childId);
      assert.equal(row.className, "Test.ParentHasChildren");
      assert.equal(row.sourceId, parentId);
      assert.equal(row.sourceClassName, "Test.Parent");
      assert.equal(row.targetId, childId);
      assert.equal(row.targetClassName, "Test.Child");
    });

    assert.equal(await query(dmdb, "SELECT DMInstanceId,DMClassId,SourceDMInstanceId,SourceDMClassId,TargetDMInstanceId,TargetDMClassId FROM test.ParentHasChildren WHERE TargetDMInstanceId=?", QueryBinder.from([childId]), undefined, (row: any) => {
      assert.equal(row.id, childId);
      assert.equal(row.className, "Test.ParentHasChildren");
      assert.equal(row.sourceId, parentId);
      assert.equal(row.sourceClassName, "Test.Parent");
      assert.equal(row.targetId, childId);
      assert.equal(row.targetClassName, "Test.Child");
    }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT DMInstanceId as MyId,DMClassId as MyClassId,SourceDMInstanceId As MySourceId,SourceDMClassId As MySourceClassId,TargetDMInstanceId As MyTargetId,TargetDMClassId As MyTargetClassId FROM test.ParentHasChildren WHERE TargetDMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, childId);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.myId, childId);
      assert.isTrue(Id64.isValidId64(row.myClassId));
      assert.equal(row.mySourceId, parentId);
      assert.isTrue(Id64.isValidId64(row.mySourceClassId));
      assert.equal(row.myTargetId, childId);
      assert.isTrue(Id64.isValidId64(row.myTargetClassId));
    });

    assert.equal(await query(dmdb, "SELECT DMInstanceId as MyId,DMClassId as MyClassId,SourceDMInstanceId As MySourceId,SourceDMClassId As MySourceClassId,TargetDMInstanceId As MyTargetId,TargetDMClassId As MyTargetClassId FROM test.ParentHasChildren WHERE TargetDMInstanceId=?", QueryBinder.from([childId]), undefined, (row: any) => {
      rowCount++;
      assert.equal(row.myId, childId);
      assert.isTrue(Id64.isValidId64(row.myClassId));
      assert.equal(row.mySourceId, parentId);
      assert.isTrue(Id64.isValidId64(row.mySourceClassId));
      assert.equal(row.myTargetId, childId);
      assert.isTrue(Id64.isValidId64(row.myTargetClassId));
    }), 1);

  });

  it("getRow() with structs", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "getstructs.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMStructClass typeName="MyStruct" modifier="Sealed">
        <DMProperty propertyName="Bl" typeName="binary"/>
        <DMProperty propertyName="Bo" typeName="boolean"/>
        <DMProperty propertyName="D" typeName="double"/>
        <DMProperty propertyName="Dt" typeName="dateTime"/>
        <DMProperty propertyName="G" typeName="Szewec.Geometry.Common.IGeometry"/>
        <DMProperty propertyName="I" typeName="int"/>
        <DMProperty propertyName="L" typeName="long"/>
        <DMProperty propertyName="P2d" typeName="Point2d"/>
        <DMProperty propertyName="P3d" typeName="Point3d"/>
        <DMProperty propertyName="S" typeName="string"/>
      </DMStructClass>
      <DMEntityClass typeName="Foo" modifier="Sealed">
        <DMStructProperty propertyName="Struct" typeName="MyStruct"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const boolVal: boolean = true;
    const doubleVal: number = 3.5;
    const dtVal: string = "2018-01-23T12:24:00.000";
    const intVal: number = 3;
    const p2dVal: XAndY = { x: 1, y: 2 };
    const p3dVal: XYAndZ = { x: 1, y: 2, z: 3 };
    const stringVal: string = "Hello World";

    const id: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Struct) VALUES(?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindStruct(1, { bl: blobVal, bo: boolVal, d: doubleVal, dt: dtVal, i: intVal, p2d: p2dVal, p3d: p3dVal, s: stringVal });
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });

    const expectedStruct = { bl: blobVal, bo: boolVal, d: doubleVal, dt: dtVal, i: intVal, p2d: p2dVal, p3d: p3dVal, s: stringVal };
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Struct FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row: any = stmt.getRow();
      assert.deepEqual(row.struct.bl, expectedStruct.bl);
      assert.equal(row.struct.bo, expectedStruct.bo);
      assert.equal(row.struct.d, expectedStruct.d);
      assert.equal(row.struct.dt, expectedStruct.dt);
      assert.equal(row.struct.i, expectedStruct.i);
      assert.equal(row.struct.p2d.x, expectedStruct.p2d.x);
      assert.equal(row.struct.p2d.y, expectedStruct.p2d.y);
      assert.equal(row.struct.p3d.x, expectedStruct.p3d.x);
      assert.equal(row.struct.p3d.y, expectedStruct.p3d.y);
      assert.equal(row.struct.p3d.z, expectedStruct.p3d.z);
      assert.equal(row.struct.s, expectedStruct.s);
    });

    assert.equal(await query(dmdb, "SELECT Struct FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), undefined, (row: any) => {
      assert.deepEqual(row.struct.bl, expectedStruct.bl);
      assert.equal(row.struct.bo, expectedStruct.bo);
      assert.equal(row.struct.d, expectedStruct.d);
      assert.equal(row.struct.dt, expectedStruct.dt);
      assert.equal(row.struct.i, expectedStruct.i);
      assert.equal(row.struct.p2d.x, expectedStruct.p2d.x);
      assert.equal(row.struct.p2d.y, expectedStruct.p2d.y);
      assert.equal(row.struct.p3d.x, expectedStruct.p3d.x);
      assert.equal(row.struct.p3d.y, expectedStruct.p3d.y);
      assert.equal(row.struct.p3d.z, expectedStruct.p3d.z);
      assert.equal(row.struct.s, expectedStruct.s);
    }), 1);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Struct FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const actualStruct: any = stmt.getValue(0).getStruct();
      assert.deepEqual(actualStruct.bl, expectedStruct.bl);
      assert.equal(actualStruct.bo, expectedStruct.bo);
      assert.equal(actualStruct.d, expectedStruct.d);
      assert.equal(actualStruct.dt, expectedStruct.dt);
      assert.equal(actualStruct.i, expectedStruct.i);
      assert.equal(actualStruct.p2d.x, expectedStruct.p2d.x);
      assert.equal(actualStruct.p2d.y, expectedStruct.p2d.y);
      assert.equal(actualStruct.p3d.x, expectedStruct.p3d.x);
      assert.equal(actualStruct.p3d.y, expectedStruct.p3d.y);
      assert.equal(actualStruct.p3d.z, expectedStruct.p3d.z);
      assert.equal(actualStruct.s, expectedStruct.s);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Struct.Bl, Struct.Bo, Struct.D, Struct.Dt, Struct.I, Struct.P2d, Struct.P3d, Struct.S FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row: any = stmt.getRow();
      assert.deepEqual(row["struct.Bl"], expectedStruct.bl);
      assert.equal(row["struct.Bo"], expectedStruct.bo);
      assert.equal(row["struct.D"], expectedStruct.d);
      assert.equal(row["struct.Dt"], expectedStruct.dt);
      assert.equal(row["struct.I"], expectedStruct.i);
      assert.equal(row["struct.P2d"].x, expectedStruct.p2d.x);
      assert.equal(row["struct.P2d"].y, expectedStruct.p2d.y);
      assert.equal(row["struct.P3d"].x, expectedStruct.p3d.x);
      assert.equal(row["struct.P3d"].y, expectedStruct.p3d.y);
      assert.equal(row["struct.P3d"].z, expectedStruct.p3d.z);
      assert.equal(row["struct.S"], expectedStruct.s);
    });

    assert.equal(await query(dmdb, "SELECT Struct.Bl, Struct.Bo, Struct.D, Struct.Dt, Struct.I, Struct.P2d, Struct.P3d, Struct.S FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), undefined, (row: any) => {
      assert.deepEqual(row["struct.Bl"], expectedStruct.bl);
      assert.equal(row["struct.Bo"], expectedStruct.bo);
      assert.equal(row["struct.D"], expectedStruct.d);
      assert.equal(row["struct.Dt"], expectedStruct.dt);
      assert.equal(row["struct.I"], expectedStruct.i);
      assert.equal(row["struct.P2d"].x, expectedStruct.p2d.x);
      assert.equal(row["struct.P2d"].y, expectedStruct.p2d.y);
      assert.equal(row["struct.P3d"].x, expectedStruct.p3d.x);
      assert.equal(row["struct.P3d"].y, expectedStruct.p3d.y);
      assert.equal(row["struct.P3d"].z, expectedStruct.p3d.z);
      assert.equal(row["struct.S"], expectedStruct.s);
    }), 1);
  });

  it("check HexStr() sql function", async () => {
    const slm = new SequentialLogMatcher();
    slm.append().error().category("DMDb").message(/Step failed for DMSQL/gm);
    slm.append().error().category("DMDb").message(/Step failed for DMSQL/gm);
    slm.append().error().category("DMDb").message(/Step failed for DMSQL/gm);
    slm.append().error().category("DMDb").message(/Failed to prepare function expression/gm);
    slm.append().error().category("DMDb").message(/Failed to prepare function expression/gm);
    slm.append().error().category("DMDb").message(/Step failed for DMSQL/gm);

    using dmdb = DMDbTestHelper.createDMDb(outDir, "hexstrfunction.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
       <DMEntityClass typeName="Foo" modifier="Sealed">
        <DMProperty propertyName="Bl" typeName="binary"/>
        <DMProperty propertyName="Bo" typeName="boolean"/>
        <DMProperty propertyName="D" typeName="double"/>
        <DMProperty propertyName="Dt" typeName="dateTime"/>
        <DMProperty propertyName="G" typeName="Szewec.Geometry.Common.IGeometry"/>
        <DMProperty propertyName="I" typeName="int"/>
        <DMProperty propertyName="L" typeName="long"/>
        <DMProperty propertyName="P2d" typeName="Point2d"/>
        <DMProperty propertyName="P3d" typeName="Point3d"/>
        <DMProperty propertyName="S" typeName="string"/>
       </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const expectedRow = {
      bl: blobVal, bo: true, d: 3.5, dt: "2018-01-23T12:24:00.000",
      i: 3, l: 12312312312312, p2d: { x: 1, y: 2 }, p3d: { x: 1, y: 2, z: 3 }, s: "Hello World",
    };

    const id: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(Bl,Bo,D,Dt,I,L,P2d,P3d,S) VALUES(:bl,:bo,:d,:dt,:i,:l,:p2d,:p3d,:s)", (stmt: DMSqlWriteStatement) => {
      stmt.bindValues({
        bl: blobVal, bo: expectedRow.bo, d: expectedRow.d,
        dt: expectedRow.dt, i: expectedRow.i, l: expectedRow.l, p2d: expectedRow.p2d, p3d: expectedRow.p3d, s: expectedRow.s,
      });
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });

    dmdb.saveChanges();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT I, HexStr(I) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row: any = stmt.getRow();
      assert.equal(row.i, expectedRow.i);
      assert.equal(row.hex, "0x3");
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT L, HexStr(L) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row: any = stmt.getRow();
      assert.equal(row.l, expectedRow.l);
      assert.equal(row.hex, "0xb32af0071f8");
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Bl, HexStr(Bl) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ERROR);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Bo, HexStr(Bo) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row: any = stmt.getRow();
      assert.equal(row.bo, expectedRow.bo);
      assert.equal(row.hex, "0x1");
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT D, HexStr(D) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ERROR);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Dt, HexStr(Dt) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ERROR);
    });

    // SQL functions cannot take points. So here preparation already fails
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.throw(() => dmdb.withPreparedStatement("SELECT P2d, HexStr(P2d) hex FROM test.Foo WHERE DMInstanceId=?", () => {
      assert.fail();
    }));

    // SQL functions cannot take points. So here preparation already fails
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.throw(() => dmdb.withPreparedStatement("SELECT P3d, HexStr(P3d) hex FROM test.Foo WHERE DMInstanceId=?", () => {
      assert.fail();
    }));

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT S, HexStr(S) hex FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ERROR);
    });
    assert.isTrue(slm.finishAndDispose());
  });

  it("check dm enums", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "dmenums.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEnumeration typeName="Status" backingTypeName="int" isStrict="true">
          <DMEnumerator name="On" value="1" />
          <DMEnumerator name="Off" value="2" />
        </DMEnumeration>
        <DMEnumeration typeName="Domain" backingTypeName="string" isStrict="true">
          <DMEnumerator name="Org" value="Org" />
          <DMEnumerator name="Com" value="Com" />
        </DMEnumeration>
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="MyStat" typeName="Status"/>
          <DMArrayProperty propertyName="MyStats" typeName="Status"/>
          <DMProperty propertyName="MyDomain" typeName="Domain"/>
          <DMArrayProperty propertyName="MyDomains" typeName="Domain"/>
       </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const id: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(MyStat,MyStats,MyDomain,MyDomains) VALUES(test.Status.[On],?,test.Domain.Org,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindValue(1, [1, 2]);
      stmt.bindValue(2, ["Org", "Com"]);
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT MyStat,MyStats, MyDomain,MyDomains FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      const row: any = stmt.getRow();
      assert.equal(row.myStat, 1);
      assert.deepEqual(row.myStats, [1, 2]);
      assert.equal(row.myDomain, "Org");
      assert.deepEqual(row.myDomains, ["Org", "Com"]);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const myStatVal: DMSqlValue = stmt.getValue(0);
      assert.isFalse(myStatVal.isNull);
      assert.isTrue(myStatVal.columnInfo.isEnum());
      assert.equal(myStatVal.getInteger(), 1);
      assert.deepEqual(myStatVal.getEnum(), [{ schema: "Test", name: "Status", key: "On", value: 1 }]);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const myStatsVal: DMSqlValue = stmt.getValue(1);
      assert.isFalse(myStatsVal.isNull);
      assert.isTrue(myStatsVal.columnInfo.isEnum());
      assert.deepEqual(myStatsVal.getArray(), [1, 2]);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const actualStatsEnums: DMEnumValue[][] = [];
      for (const arrayElement of myStatsVal.getArrayIterator()) {
        actualStatsEnums.push(arrayElement.getEnum()!);
      }
      assert.equal(actualStatsEnums.length, 2);
      assert.deepEqual(actualStatsEnums[0], [{ schema: "Test", name: "Status", key: "On", value: 1 }]);
      assert.deepEqual(actualStatsEnums[1], [{ schema: "Test", name: "Status", key: "Off", value: 2 }]);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const myDomainVal: DMSqlValue = stmt.getValue(2);
      assert.isFalse(myDomainVal.isNull);
      assert.isTrue(myDomainVal.columnInfo.isEnum());
      assert.equal(myDomainVal.getString(), "Org");
      assert.deepEqual(myDomainVal.getEnum(), [{ schema: "Test", name: "Domain", key: "Org", value: "Org" }]);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const myDomainsVal: DMSqlValue = stmt.getValue(3);
      assert.isFalse(myDomainsVal.isNull);
      assert.isTrue(myDomainsVal.columnInfo.isEnum());
      assert.deepEqual(myDomainsVal.getArray(), ["Org", "Com"]);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const actualDomainsEnums: DMEnumValue[][] = [];
      for (const arrayElement of myDomainsVal.getArrayIterator()) {
        actualDomainsEnums.push(arrayElement.getEnum()!);
      }
      assert.equal(actualDomainsEnums.length, 2);
      assert.deepEqual(actualDomainsEnums[0], [{ schema: "Test", name: "Domain", key: "Org", value: "Org" }]);
      assert.deepEqual(actualDomainsEnums[1], [{ schema: "Test", name: "Domain", key: "Com", value: "Com" }]);
    });

    assert.equal(await query(dmdb, "SELECT MyStat,MyStats, MyDomain,MyDomains FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([id]), undefined, (row: any) => {
      assert.equal(row.myStat, 1);
      assert.deepEqual(row.myStats, [1, 2]);
      assert.equal(row.myDomain, "Org");
      assert.deepEqual(row.myDomains, ["Org", "Com"]);
    }), 1);

    // test some enums in the built-in schemas
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Type,Modifier FROM meta.DMClassDef WHERE Name='Foo'", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      const row: any = stmt.getRow();
      assert.deepEqual(row, { type: 0, modifier: 2 });

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const typeVal: DMSqlValue = stmt.getValue(0);
      assert.isFalse(typeVal.isNull);
      assert.isTrue(typeVal.columnInfo.isEnum());
      assert.equal(typeVal.getInteger(), 0);
      assert.deepEqual(typeVal.getEnum(), [{ schema: "DMDbMeta", name: "DMClassType", key: "Entity", value: 0 }]);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const modifierVal: DMSqlValue = stmt.getValue(1);
      assert.isFalse(modifierVal.isNull);
      assert.isTrue(modifierVal.columnInfo.isEnum());
      assert.equal(modifierVal.getInteger(), 2);
      assert.deepEqual(modifierVal.getEnum(), [{ schema: "DMDbMeta", name: "DMClassModifier", key: "Sealed", value: 2 }]);
    });

    assert.equal(await query(dmdb, "SELECT Type,Modifier FROM meta.DMClassDef WHERE Name='Foo'", QueryBinder.from([id]), undefined, (row: any) => {
      assert.deepEqual(row, { type: 0, modifier: 2 });
    }), 1);
  });

  it("check ORed DMEnums", async () => {
    const slm = new SequentialLogMatcher();
    slm.append().error().category("DMDb").message(/The value 9 cannot be broken down into a combination of DMEnumerators/gm);
    slm.append().error().category("DMDb").message(/The value 'gov,de' cannot be broken down into a combination of DMEnumerators/gm);

    using dmdb = DMDbTestHelper.createDMDb(outDir, "oreddmenums.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEnumeration typeName="Color" backingTypeName="int" isStrict="true">
          <DMEnumerator name="Red" value="1" />
          <DMEnumerator name="Yellow" value="2" />
          <DMEnumerator name="Blue" value="4" />
        </DMEnumeration>
        <DMEnumeration typeName="Domain" backingTypeName="string" isStrict="true">
          <DMEnumerator name="Org" value="org" />
          <DMEnumerator name="Com" value="com" />
          <DMEnumerator name="Gov" value="gov" />
        </DMEnumeration>
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="MyColor" typeName="Color"/>
          <DMProperty propertyName="MyDomain" typeName="Domain"/>
       </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const ids: { unored: Id64String, ored: Id64String, unmatched: Id64String } = dmdb.withCachedWriteStatement("INSERT INTO test.Foo(MyColor,MyDomain) VALUES(?,?)", (stmt: DMSqlWriteStatement) => {
      stmt.bindValue(1, 4);
      stmt.bindValue(2, "com");
      let res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      const unored: Id64String = res.id!;
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValue(1, 5);
      stmt.bindValue(2, "gov,com");
      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      const ored: Id64String = res.id!;
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValue(1, 9);
      stmt.bindValue(2, "gov,de");
      res = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      const unmatched: Id64String = res.id!;
      stmt.reset();
      stmt.clearBindings();

      return { unored, ored, unmatched };
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT MyColor,MyDomain FROM test.Foo WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, ids.unored);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      let row: any = stmt.getRow();
      assert.equal(row.myColor, 4);
      assert.equal(row.myDomain, "com");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      let colVal: DMSqlValue = stmt.getValue(0);
      assert.isFalse(colVal.isNull);
      assert.isTrue(colVal.columnInfo.isEnum());
      assert.equal(colVal.getInteger(), 4);
      assert.deepEqual(colVal.getEnum(), [{ schema: "Test", name: "Color", key: "Blue", value: 4 }]);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      let domainVal: DMSqlValue = stmt.getValue(1);
      assert.isFalse(domainVal.isNull);
      assert.isTrue(domainVal.columnInfo.isEnum());
      assert.equal(domainVal.getString(), "com");
      assert.deepEqual(domainVal.getEnum(), [{ schema: "Test", name: "Domain", key: "Com", value: "com" }]);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindId(1, ids.ored);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      row = stmt.getRow();
      assert.equal(row.myColor, 5);
      assert.equal(row.myDomain, "gov,com");

      colVal = stmt.getValue(0);
      assert.isFalse(colVal.isNull);
      assert.isTrue(colVal.columnInfo.isEnum());
      assert.equal(colVal.getInteger(), 5);
      assert.deepEqual(colVal.getEnum(), [{ schema: "Test", name: "Color", key: "Red", value: 1 }, { schema: "Test", name: "Color", key: "Blue", value: 4 }]);

      domainVal = stmt.getValue(1);
      assert.isFalse(domainVal.isNull);
      assert.isTrue(domainVal.columnInfo.isEnum());
      assert.equal(domainVal.getString(), "gov,com");
      assert.deepEqual(domainVal.getEnum(), [{ schema: "Test", name: "Domain", key: "Com", value: "com" }, { schema: "Test", name: "Domain", key: "Gov", value: "gov" }]);

      stmt.reset();
      stmt.clearBindings();

      stmt.bindId(1, ids.unmatched);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      row = stmt.getRow();
      assert.equal(row.myColor, 9);
      assert.equal(row.myDomain, "gov,de");

      colVal = stmt.getValue(0);
      assert.isFalse(colVal.isNull);
      assert.isTrue(colVal.columnInfo.isEnum());
      assert.equal(colVal.getInteger(), 9);
      assert.isUndefined(colVal.getEnum());

      domainVal = stmt.getValue(1);
      assert.isFalse(domainVal.isNull);
      assert.isTrue(domainVal.columnInfo.isEnum());
      assert.equal(domainVal.getString(), "gov,de");
      assert.isUndefined(domainVal.getEnum());
    });

    assert.equal(await query(dmdb, "SELECT MyColor,MyDomain FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([ids.unored]), undefined, (row: any) => {
      assert.equal(row.myColor, 4);
      assert.equal(row.myDomain, "com");
    }), 1);

    assert.equal(await query(dmdb, "SELECT MyColor,MyDomain FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([ids.ored]), undefined, (row: any) => {
      assert.equal(row.myColor, 5);
      assert.equal(row.myDomain, "gov,com");
    }), 1);

    assert.equal(await query(dmdb, "SELECT MyColor,MyDomain FROM test.Foo WHERE DMInstanceId=?", QueryBinder.from([ids.unmatched]), undefined, (row: any) => {
      assert.equal(row.myColor, 9);
      assert.equal(row.myDomain, "gov,de");
    }), 1);

    // test some enums in the built-in schemas
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT CustomAttributeContainerType caType FROM meta.DMClassDef WHERE Type=meta.DMClassType.CustomAttribute AND Name='DateTimeInfo'", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row: any = stmt.getRow();
      assert.equal(row.caType, 160);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const caTypeVal: DMSqlValue = stmt.getValue(0);
      assert.isFalse(caTypeVal.isNull);
      assert.isTrue(caTypeVal.columnInfo.isEnum());
      assert.equal(caTypeVal.getInteger(), 160);
      assert.deepEqual(caTypeVal.getEnum(), [
        { schema: "DMDbMeta", name: "DMCustomAttributeContainerType", key: "PrimitiveProperty", value: 32 },
        { schema: "DMDbMeta", name: "DMCustomAttributeContainerType", key: "PrimitiveArrayProperty", value: 128 }]);
    });
    assert.equal(await query(dmdb, "SELECT CustomAttributeContainerType caType FROM meta.DMClassDef WHERE Type=meta.DMClassType.CustomAttribute AND Name='DateTimeInfo'", QueryBinder.from([ids.unmatched]), undefined, (row: any) => {
      assert.equal(row.caType, 160);
    }), 1);
    assert.isTrue(slm.finishAndDispose());
  });

  it("should get native sql", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "asyncmethodtest.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
          <DMProperty propertyName="dt" typeName="dateTime"/>
          <DMProperty propertyName="fooId" typeName="long" extendedTypeName="Id"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const r = await dmdb.withCachedWriteStatement("INSERT INTO ts.Foo(n,dt,fooId) VALUES(20,TIMESTAMP '2018-10-18T12:00:00Z',20)", async (stmt: DMSqlWriteStatement) => {
      const nativesql: string = stmt.getNativeSql();
      assert.isTrue(nativesql.startsWith("INSERT INTO [ts_Foo]"));
      return stmt.stepForInsert();
    });
    dmdb.saveChanges();
    assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    assert.equal(r.id, "0x1");
  });

  it("check column info", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "columnInfo.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="MyClass" modifier="Sealed">
          <DMProperty propertyName="MyProperty" typeName="string"/>
       </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const id: Id64String = dmdb.withCachedWriteStatement("INSERT INTO test.MyClass(MyProperty) VALUES('Value')", (stmt: DMSqlWriteStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      return res.id!;
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT MyProperty as MyAlias, 1 as MyGenerated FROM test.MyClass WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      const row: any = stmt.getRow();
      assert.equal(row.myAlias, "Value");
      assert.equal(row.myGenerated, 1);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val0: DMSqlValue = stmt.getValue(0);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo0: DMSqlColumnInfo = val0.columnInfo;

      assert.equal(colInfo0.getPropertyName(), "MyAlias");
      const accessString0 = colInfo0.getAccessString();
      assert.equal(accessString0, "MyAlias");
      const originPropertyName = colInfo0.getOriginPropertyName();
      assert.isDefined(originPropertyName);
      assert.equal(originPropertyName, "MyProperty");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val1: DMSqlValue = stmt.getValue(1);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo1: DMSqlColumnInfo = val1.columnInfo;

      assert.equal(colInfo1.getPropertyName(), "MyGenerated");
      const accessString1 = colInfo1.getAccessString();
      assert.equal(accessString1, "MyGenerated");
      assert.isUndefined(colInfo1.getOriginPropertyName());
    });
  });

  it("check access string metadata in nested struct", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "columnInfo.dmdb",
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="DMDbMap" version="02.00.00" alias="dmdbmap"/>
        <DMStructClass typeName="InnerStruct">
          <DMProperty propertyName="a" typeName="string"/>
          <DMProperty propertyName="b" typeName="string"/>
        </DMStructClass>
        <DMStructClass typeName="OuterStruct">
          <DMStructProperty propertyName="c" typeName="InnerStruct"/>
          <DMProperty propertyName="d" typeName="string"/>
        </DMStructClass>
        <DMEntityClass typeName="Z">
          <DMCustomAttributes>
            <ClassMap xmlns="DMDbMap.02.00.00">
              <MapStrategy>TablePerHierarchy</MapStrategy>
            </ClassMap>
            <ShareColumns xmlns="DMDbMap.02.00.00">
                <MaxSharedColumnsBeforeOverflow>32</MaxSharedColumnsBeforeOverflow>
            </ShareColumns>
          </DMCustomAttributes>
        </DMEntityClass>
        <DMEntityClass typeName="A">
          <BaseClass>Z</BaseClass>
          <DMStructProperty propertyName="f" typeName="OuterStruct"/>
          <DMProperty propertyName="g" typeName="string"/>
        </DMEntityClass>
        <DMEntityClass typeName="B">
          <BaseClass>Z</BaseClass>
          <DMStructProperty propertyName="h" typeName="InnerStruct" />
          <DMProperty propertyName="i" typeName="string"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    dmdb.withCachedWriteStatement("INSERT INTO Test.A (f.c.a, f.c.b, f.d, g) VALUES ('f.c.a' ,'f.c.b', 'f.d', 'g')", (stmt: DMSqlWriteStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT f, f.c.a, f.c.b, f.d, g FROM Test.A", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      const row: any = stmt.getRow();
      assert.equal(row.f.c.a, "f.c.a");
      assert.equal(row.f.c.b, "f.c.b");
      assert.equal(row.f.d, "f.d");
      assert.equal(row.g, "g");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val0: DMSqlValue = stmt.getValue(0);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo0: DMSqlColumnInfo = val0.columnInfo;

      assert.equal(colInfo0.getPropertyName(), "f");
      const accessString0 = colInfo0.getAccessString();
      assert.equal(accessString0, "f");
      const originPropertyName0 = colInfo0.getOriginPropertyName();
      assert.isDefined(originPropertyName0);
      assert.equal(originPropertyName0, "f");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val1: DMSqlValue = stmt.getValue(1);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo1: DMSqlColumnInfo = val1.columnInfo;

      assert.equal(colInfo1.getPropertyName(), "a");
      const accessString1 = colInfo1.getAccessString();
      assert.equal(accessString1, "f.c.a");
      const originPropertyName1 = colInfo1.getOriginPropertyName();
      assert.isDefined(originPropertyName1);
      assert.equal(originPropertyName1, "a");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val2: DMSqlValue = stmt.getValue(2);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo2: DMSqlColumnInfo = val2.columnInfo;

      assert.equal(colInfo2.getPropertyName(), "b");
      const accessString2 = colInfo2.getAccessString();
      assert.equal(accessString2, "f.c.b");
      const originPropertyName2 = colInfo2.getOriginPropertyName();
      assert.isDefined(originPropertyName2);
      assert.equal(originPropertyName2, "b");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val3: DMSqlValue = stmt.getValue(3);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo3: DMSqlColumnInfo = val3.columnInfo;

      assert.equal(colInfo3.getPropertyName(), "d");
      const accessString3 = colInfo3.getAccessString();
      assert.equal(accessString3, "f.d");
      const originPropertyName3 = colInfo3.getOriginPropertyName();
      assert.isDefined(originPropertyName3);
      assert.equal(originPropertyName3, "d");

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val4: DMSqlValue = stmt.getValue(4);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo4: DMSqlColumnInfo = val4.columnInfo;

      assert.equal(colInfo4.getPropertyName(), "g");
      const accessString4 = colInfo4.getAccessString();
      assert.equal(accessString4, "g");
      const originPropertyName4 = colInfo4.getOriginPropertyName();
      assert.isDefined(originPropertyName4);
      assert.equal(originPropertyName4, "g");
    });

    dmdb.withCachedWriteStatement("INSERT INTO Test.B (h.a, h.b, i) VALUES ('h.a' ,'h.b', 'i')", (stmt: DMSqlWriteStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT h, i FROM Test.B", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      // getRow just returns the enum values
      const row: any = stmt.getRow();
      assert.equal(row.h.a, "h.a");
      assert.equal(row.h.b, "h.b");
      assert.equal(row.i, "i");
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val0: DMSqlValue = stmt.getValue(0);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo0: DMSqlColumnInfo = val0.columnInfo;

      assert.equal(colInfo0.getPropertyName(), "h");
      const accessString0 = colInfo0.getAccessString();
      assert.equal(accessString0, "h");
      const originPropertyName0 = colInfo0.getOriginPropertyName();
      assert.isDefined(originPropertyName0);
      assert.equal(originPropertyName0, "h");
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const val1: DMSqlValue = stmt.getValue(1);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const colInfo1: DMSqlColumnInfo = val1.columnInfo;

      assert.equal(colInfo1.getPropertyName(), "i");
      const accessString1 = colInfo1.getAccessString();
      assert.equal(accessString1, "i");
      const originPropertyName1 = colInfo1.getOriginPropertyName();
      assert.isDefined(originPropertyName1);
      assert.equal(originPropertyName1, "i");
    });
  });

  it("dmsql statements with QueryBinder", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "test.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="booleanProperty" typeName="boolean"/>
          <DMProperty propertyName="blobProperty" typeName="binary"/>
          <DMProperty propertyName="doubleProperty" typeName="double"/>
          <DMProperty propertyName="customIdProperty" typeName="string"/>
          <DMProperty propertyName="customIdSetProperty" typeName="string"/>
          <DMProperty propertyName="intProperty" typeName="int"/>
          <DMProperty propertyName="longProperty" typeName="long"/>
          <DMProperty propertyName="stringProperty" typeName="string"/>
          <DMProperty propertyName="nullProperty" typeName="int"/>
          <DMProperty propertyName="point2dProperty" typeName="point2d"/>
          <DMProperty propertyName="point3dProperty" typeName="point3d"/>
        </DMEntityClass>
        <DMStructClass typeName="Bar" modifier="Sealed">
          <DMProperty propertyName="structClassProperty" typeName="string"/>
        </DMStructClass>
        <DMEntityClass typeName="Baz" modifier="Sealed">
          <DMStructProperty propertyName="structProperty" typeName="Bar"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);

    const booleanValue = true;
    const blobValue = new Uint8Array([0, 0, 0]);
    const doubleValue = 12.12;
    const customIdValue = "1234";
    const customIdSetValue = ["0x9"];
    const intValue = 10;
    const longValue = 1e9;
    const stringValue = "test string value";
    const point2dValue = new Point2d(10, 20);
    const point3dValue = new Point3d(15, 30, 45);
    const structValue = { structClassProperty: "test string value for struct property" };

    let r = await dmdb.withCachedWriteStatement(
      `INSERT INTO ts.Foo(booleanProperty, blobProperty, doubleProperty, customIdProperty, customIdSetProperty, intProperty, longProperty, stringProperty, nullProperty, point2dProperty, point3dProperty)
          VALUES(:booleanValue, :blobValue, :doubleValue, :customIdValue, :customIdSetValue, :intValue, :longValue, :stringValue, :nullValue, :point2dValue, :point3dValue)`,
      async (stmt: DMSqlWriteStatement) => {
        stmt.bindBoolean("booleanValue", booleanValue);
        stmt.bindBlob("blobValue", blobValue);
        stmt.bindDouble("doubleValue", doubleValue);
        stmt.bindId("customIdValue", customIdValue);
        stmt.bindId("customIdSetValue", customIdSetValue[0]);
        stmt.bindInteger("intValue", intValue);
        stmt.bindInteger("longValue", longValue);
        stmt.bindString("stringValue", stringValue);
        stmt.bindNull("nullValue");
        stmt.bindPoint2d("point2dValue", point2dValue);
        stmt.bindPoint3d("point3dValue", point3dValue);
        return stmt.stepForInsert();
      },
    );

    dmdb.saveChanges();
    assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    assert.equal(r.id, "0x1");

    const params = new QueryBinder();
    params.bindBoolean("booleanValue", booleanValue);
    params.bindBlob("blobValue", blobValue);
    params.bindDouble("doubleValue", doubleValue);
    params.bindId("customIdValue", customIdValue);
    params.bindInt("intValue", intValue);
    params.bindLong("longValue", longValue);
    params.bindString("stringValue", stringValue);
    params.bindPoint2d("point2dValue", point2dValue);
    params.bindPoint3d("point3dValue", point3dValue);
    params.bindIdSet("customIdSetValue", customIdSetValue);

    let reader = dmdb.createQueryReader(
      `SELECT booleanProperty, blobProperty, doubleProperty, customIdProperty, customIdSetProperty, intProperty, longProperty, stringProperty, nullProperty, point2dProperty, point3dProperty FROM ts.Foo
          WHERE booleanProperty = :booleanValue AND blobProperty = :blobValue AND doubleProperty = :doubleValue AND customIdProperty = :customIdValue AND InVirtualSet(:customIdSetValue, customIdSetProperty) AND
          intProperty = :intValue AND longProperty = :longValue AND stringProperty = :stringValue AND point2dProperty = :point2dValue AND point3dProperty = :point3dValue`,
      params,
    );
    const row = (await reader.toArray())[0];

    assert.isNotNull(row);
    assert.equal(row[0], booleanValue);
    assert.deepEqual(row[1], blobValue);
    assert.equal(row[2], doubleValue);
    assert.equal(row[3], customIdValue);
    assert.equal(row[4], "9");
    assert.equal(row[5], intValue);
    assert.equal(row[6], longValue);
    assert.equal(row[7], stringValue);
    assert.equal(row[8], null);
    assert.deepEqual(row[9], { X: 10, Y: 20 });
    assert.deepEqual(row[10], { X: 15, Y: 30, Z: 45 });

    assert.isFalse(await reader.step());

    r = await dmdb.withCachedWriteStatement(
      "INSERT INTO ts.Baz(structProperty) VALUES(:structValue)",
      async (stmt: DMSqlWriteStatement) => {
        stmt.bindStruct("structValue", structValue);
        return stmt.stepForInsert();
      },
    );

    dmdb.saveChanges();
    assert.equal(r.status, DbResult.BE_SQLITE_DONE);
    assert.equal(r.id, "0x2");

    reader = dmdb.createQueryReader(
      `SELECT * FROM ts.Baz`,
    );

    await reader.step();

    assert.deepEqual(reader.current.structProperty, structValue);

    const paramsWithStruct = new QueryBinder();
    paramsWithStruct.bindStruct("structValue", structValue);
    reader = dmdb.createQueryReader("SELECT * FROM ts.Baz WHERE structProperty = :structValue", paramsWithStruct);

    await assert.isRejected(reader.toArray(), "Struct type binding not supported");
  });

  it("Statement closed with WithWriteStatement", async () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "test_hang.dmdb",
    `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestSchema" alias="Test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMEntityClass typeName="X">
        <DMProperty propertyName="Label" typeName="string" />
      </DMEntityClass>
    </DMSchema>
    `);
    assert.isTrue(dmdb.isOpen);

    dmdb.withWriteStatement(`INSERT INTO Test.X (Label) VALUES (?)`, (stmt) => {
      stmt.bindString(1, "TestLabel 1");
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      stmt.clearBindings();
    });

    dmdb.saveChanges();

    const reader = dmdb.createQueryReader(
      `SELECT Label FROM Test.X`
    );
    const row = (await reader.toArray())[0];

    assert.isNotNull(row);
    assert.equal(row[0], "TestLabel 1");

    assert.isFalse(await reader.step());
  });

  describe("invalid RelDMClassId with pragma validate_dmsql_writes", () => {
    let dmdb: DMDb;
    let parentHasChildrenClassId: Id64String;
    let childHasFriendsClassId: Id64String;
    let validRelClassId: Id64String;

    before(async () => {
      dmdb = DMDbTestHelper.createDMDb(outDir, "bindnavigation.dmdb",
        `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">

          <DMEntityClass typeName="Parent" modifier="Sealed">
            <DMProperty propertyName="Code" typeName="string"/>
          </DMEntityClass>

          <DMEntityClass typeName="ChildTemplate" modifier="Abstract">
            <DMProperty propertyName="Name" typeName="string"/>
            <DMNavigationProperty propertyName="Parent" relationshipName="ParentHasChildren" direction="backward"/>
          </DMEntityClass>

          <DMEntityClass typeName="Child" modifier="Sealed">
            <BaseClass>ChildTemplate</BaseClass>
            <DMProperty propertyName="Age" typeName="int"/>
            <DMNavigationProperty propertyName="Friends" relationshipName="ChildHasFriends" direction="backward"/>
          </DMEntityClass>

          <DMRelationshipClass typeName="ParentHasChildren" modifier="None" strength="embedding">
            <Source multiplicity="(0..1)" roleLabel="has" polymorphic="false">
                <Class class="Parent"/>
            </Source>
            <Target multiplicity="(0..*)" roleLabel="has" polymorphic="false">
                <Class class="ChildTemplate"/>
            </Target>
          </DMRelationshipClass>

          <DMRelationshipClass typeName="ChildHasFriends" modifier="None" strength="embedding">
            <Source multiplicity="(0..1)" roleLabel="has" polymorphic="false">
                <Class class="Child"/>
            </Source>
            <Target multiplicity="(0..*)" roleLabel="has" polymorphic="false">
                <Class class="Child"/>
            </Target>
          </DMRelationshipClass>
        </DMSchema>`);

      assert.isTrue(dmdb.isOpen);

      let reader = dmdb.createQueryReader("SELECT DMInstanceId FROM meta.DMClassDef WHERE Name='Parent'");
      assert.isTrue(await reader.step());
      parentHasChildrenClassId = reader.current.DMInstanceId;
      assert.isTrue(Id64.isValidId64(parentHasChildrenClassId));

      // When the DMSql insert validation is set to true, the invalid relClassId is detected and an error is thrown.
      assert.isTrue(await (dmdb.createQueryReader("PRAGMA validate_dmsql_writes=true")).step());

      reader = dmdb.createQueryReader("SELECT DMInstanceId FROM meta.DMClassDef WHERE Name='ParentHasChildren'");
      assert.isTrue(await reader.step());
      validRelClassId = reader.current.DMInstanceId;
      assert.isTrue(Id64.isValidId64(validRelClassId));

      reader = dmdb.createQueryReader("SELECT DMInstanceId FROM meta.DMClassDef WHERE Name='ChildHasFriends'");
      assert.isTrue(await reader.step());
      childHasFriendsClassId = reader.current.DMInstanceId;
      assert.isTrue(Id64.isValidId64(childHasFriendsClassId));

      dmdb.saveChanges();
    });

    after(() => {
      dmdb.closeDb();
    });

    function testDMSqlWithoutBinders(testCaseNumber: number, sqlStmt: string, shouldSucceed: boolean, expectedError: string, isInsert: boolean = true, expectedResult: DbResult = DbResult.BE_SQLITE_DONE) {
      let id: Id64String | undefined;
      let stmt: DMSqlWriteStatement | undefined;
      try {
        stmt = dmdb.prepareWriteStatement(sqlStmt);
        assert.isDefined(stmt);
        if (isInsert) {
          const res: DMSqlInsertResult = stmt.stepForInsert();
          assert.equal(res.status, expectedResult);
          assert.isDefined(res.id);
        } else {
          assert.equal(stmt.step(), expectedResult);
        }
      } catch (err: any) {
        if (shouldSucceed)
          assert.fail(`Test case ${testCaseNumber} should not have thrown an error: ${err.message}`);
        else
          assert.equal(err.message, expectedError, `Test case ${testCaseNumber} Expected error: ${err.message}`);
      }
      if (stmt !== undefined)
        stmt[Symbol.dispose]();
      return id;
    };

    function testDMSqlWithBinders(testCaseNumber: number, sqlStmt: string, firstBinderValue: string, secondBinderValue: string, shouldSucceed: boolean, expectedError: string, isInsert: boolean = true, expectedResult: DbResult = DbResult.BE_SQLITE_DONE) {
      let stmt: DMSqlWriteStatement | undefined;
      try {
        stmt = dmdb.prepareWriteStatement(sqlStmt);
        if (firstBinderValue !== "")
          stmt.bindNavigation(1, { id: "1", relClassName: firstBinderValue });
        if (secondBinderValue !== "")
          stmt.bindNavigation(2, { id: "2", relClassName: secondBinderValue });

        if (isInsert) {
          const res: DMSqlInsertResult = stmt.stepForInsert();
          assert.equal(res.status, expectedResult);
          assert.isDefined(res.id);
        } else {
          assert.equal(stmt.step(), expectedResult);
        }
      } catch (err: any) {
        if (shouldSucceed)
          assert.fail(`Test case ${testCaseNumber} should not have thrown an error: ${err.message}`);
        else
          assert.equal(err.message, expectedError, `Test case ${testCaseNumber} Expected error: ${err.message}`);
      }

      if (stmt !== undefined)
        stmt[Symbol.dispose]();
      stmt?.clearBindings();
    };

    it("insert statement with invalid relClassId in navigation properties", async () => {
      // Invalid RelDMClassId values
      testDMSqlWithoutBinders(1, `INSERT INTO test.Child(Parent.Id, Parent.RelDMClassId) VALUES(1, 9999)`, false, `The DMSql statement contains a class with id '9999' which is not a valid relationship class.`);
      testDMSqlWithoutBinders(2, `INSERT INTO test.Child(Parent.Id, Parent.RelDMClassId) VALUES(1, NULL)`, false, `The DMSql statement contains an invalid relationship class id.`);
      testDMSqlWithoutBinders(3, `INSERT INTO test.Child(Parent.Id, Parent.RelDMClassId) VALUES(1, ${parentHasChildrenClassId})`, false, `The DMSql statement contains a class with id '${parentHasChildrenClassId}' which is not a valid relationship class.`);
      testDMSqlWithoutBinders(4, `INSERT INTO test.Child(Parent.Id, Parent.RelDMClassId) VALUES(1, ${validRelClassId})`, true, "");

      // Invalid RelClassName values with binders
      testDMSqlWithBinders(5, "INSERT INTO test.Child(Parent) VALUES(?)", "Test.InvalidClass", "", false, "The DMSql statement contains a relationship class 'Test.InvalidClass' which does not correspond to any DM class.");

      // Valid RelClassName values with binders
      testDMSqlWithBinders(6, "INSERT INTO test.Child(Parent) VALUES(?)", "Test.ParentHasChildren", "", true, "");
      testDMSqlWithBinders(7, "INSERT INTO test.Child(Friends) VALUES(?)", "Test.ChildHasFriends", "", true, "");

      // Valid RelClassName values with binders but invalid relClassId
      testDMSqlWithBinders(8, "INSERT INTO test.Child(Parent) VALUES(?)", "Test.ChildHasFriends", "", false, "The DMSql statement contains a relationship class 'Test.ChildHasFriends' which does not match the relationship class in the navigation property.");
      testDMSqlWithBinders(9, "INSERT INTO test.Child(Friends) VALUES(?)", "Test.ParentHasChildren", "", false, "The DMSql statement contains a relationship class 'Test.ParentHasChildren' which does not match the relationship class in the navigation property.");

      // Valid multiple RelClassName values with binders
      testDMSqlWithBinders(10, "INSERT INTO test.Child(Parent, Friends) VALUES(?, ?)", "Test.ParentHasChildren", "Test.ChildHasFriends", true, "");
      testDMSqlWithBinders(11, "INSERT INTO test.Child(Friends, Parent) VALUES(?, ?)", "Test.ParentHasChildren", "Test.ChildHasFriends", false, "The DMSql statement contains a relationship class 'Test.ParentHasChildren' which does not match the relationship class in the navigation property.");
    });

    it("update statement with invalid relClassId in navigation properties", async () => {
      // insert a value that can be updated in the test suite
      dmdb.withWriteStatement("INSERT INTO test.Child(Name, Parent, Friends) VALUES('Test123', ?, ?)", (stmt: DMSqlWriteStatement) => {
        stmt.bindNavigation(1, { id: "1", relClassName: "Test.ParentHasChildren" });
        stmt.bindNavigation(2, { id: "2", relClassName: "Test.ChildHasFriends" });
        const res: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(res.status, DbResult.BE_SQLITE_DONE);
        assert.isDefined(res.id);
        stmt.clearBindings();
        dmdb.saveChanges();
      });

      // Invalid RelDMClassId values
      testDMSqlWithoutBinders(1, `UPDATE test.Child SET Parent.RelDMClassId = 9999`, false, `The DMSql statement contains a class with id '9999' which is not a valid relationship class.`, false);
      testDMSqlWithoutBinders(2, `UPDATE test.Child SET Parent.RelDMClassId = NULL`, false, `The DMSql statement contains an invalid relationship class id.`, false);
      testDMSqlWithoutBinders(3, `UPDATE test.Child SET Parent.RelDMClassId = ${parentHasChildrenClassId}`, false, `The DMSql statement contains a class with id '${parentHasChildrenClassId}' which is not a valid relationship class.`, false);
      testDMSqlWithoutBinders(4, `UPDATE test.Child SET Parent.RelDMClassId = ${validRelClassId}`, true, "", false);

      // Invalid RelClassName values with binders
      testDMSqlWithBinders(5, "UPDATE test.Child SET Parent = ?", "Test.InvalidClass", "", false, "The DMSql statement contains a relationship class 'Test.InvalidClass' which does not correspond to any DM class.", false);

      // Valid RelClassName values with binders
      testDMSqlWithBinders(6, "UPDATE test.Child SET Parent = ?", "Test.ParentHasChildren", "", true, "", false);
      testDMSqlWithBinders(7, "UPDATE test.Child SET Friends = ?", "Test.ChildHasFriends", "", true, "", false);

      // Valid RelClassName values with binders but invalid relClassId
      testDMSqlWithBinders(8, "UPDATE test.Child SET Parent = ?", "Test.ChildHasFriends", "", false, "The DMSql statement contains a relationship class 'Test.ChildHasFriends' which does not match the relationship class in the navigation property.", false);
      testDMSqlWithBinders(9, "UPDATE test.Child SET Friends = ?", "Test.ParentHasChildren", "", false, "The DMSql statement contains a relationship class 'Test.ParentHasChildren' which does not match the relationship class in the navigation property.", false);

      // Valid multiple RelClassName values with binders
      testDMSqlWithBinders(10, "UPDATE test.Child SET Parent = ?, Friends = ?", "Test.ParentHasChildren", "Test.ChildHasFriends", true, "", false);
      testDMSqlWithBinders(11, "UPDATE test.Child SET Friends = ?, Parent = ?", "Test.ParentHasChildren", "Test.ChildHasFriends", false, "The DMSql statement contains a relationship class 'Test.ParentHasChildren' which does not match the relationship class in the navigation property.", false);
    });

    it("select statement with invalid relClassId in navigation properties", async () => {
      // insert a value that can be updated in the test suite
      dmdb.withWriteStatement("INSERT INTO test.Child(Name, Parent, Friends) VALUES('Test123', ?, ?)", (stmt: DMSqlWriteStatement) => {
        stmt.bindNavigation(1, { id: "1", relClassName: "Test.ParentHasChildren" });
        stmt.bindNavigation(2, { id: "2", relClassName: "Test.ChildHasFriends" });
        const res: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(res.status, DbResult.BE_SQLITE_DONE);
        assert.isDefined(res.id);
        stmt.clearBindings();
        dmdb.saveChanges();
      });

      // Invalid RelDMClassId values
      testDMSqlWithoutBinders(1, `SELECT * from test.Child where Parent.RelDMClassId = 9999`, true, "", false);
      testDMSqlWithoutBinders(2, `SELECT * from test.Child where Parent.RelDMClassId = NULL`, true, "", false);
      testDMSqlWithoutBinders(3, `SELECT * from test.Child where Parent.RelDMClassId = ${parentHasChildrenClassId}`, true, "", false);
      testDMSqlWithoutBinders(4, `SELECT * from test.Child where Parent.RelDMClassId = ${validRelClassId}`, true, "", false, DbResult.BE_SQLITE_ROW);

      // Invalid RelClassName values with binders
      testDMSqlWithBinders(5, "SELECT * from test.Child where Parent = ?", "Test.InvalidClass", "", true, "", false);

      // Valid RelClassName values with binders
      testDMSqlWithBinders(6, "SELECT * from test.Child where Parent = ?", "Test.ParentHasChildren", "", true, "", false, DbResult.BE_SQLITE_ROW);
      testDMSqlWithBinders(7, "SELECT * from test.Child where Friends = ?", "Test.ChildHasFriends", "", true, "", false);

      // Valid RelClassName values with binders but invalid relClassId
      testDMSqlWithBinders(8, "SELECT * from test.Child where Parent = ?", "Test.ChildHasFriends", "", true, "", false);
      testDMSqlWithBinders(9, "SELECT * from test.Child where Friends = ?", "Test.ParentHasChildren", "", true, "", false);

      // Valid multiple RelClassName values with binders
      testDMSqlWithBinders(10, "SELECT * from test.Child where Parent = ? and Friends = ?", "Test.ParentHasChildren", "Test.ChildHasFriends", true, "", false, DbResult.BE_SQLITE_ROW);
      testDMSqlWithBinders(11, "SELECT * from test.Child where Friends = ? and Parent = ?", "Test.ParentHasChildren", "Test.ChildHasFriends", true, "", false);
    });
  });
});

