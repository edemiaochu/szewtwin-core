/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { DbResult } from "@szewtwin/core-szewec";
import { Range3d } from "@szewtwin/core-geometry";
import { DMDb, DMDbOpenMode, SqliteStatement, SqliteValueType } from "../../core-backend";
import { KnownTestLocations } from "../KnownTestLocations";
import { DMDbTestHelper } from "./DMDbTestHelper";
import { SequentialLogMatcher } from "../SequentialLogMatcher";

describe("SqliteStatement", () => {
  const outDir = KnownTestLocations.outputDir;
  const stringVal: string = "Hello world";
  const intVal = 0;
  const doubleVal = -2.5;
  const blobVal = new Uint8Array(new Range3d(1.2, 2.3, 3.4, 4.5, 5.6, 6.7).toFloat64Array().buffer);

  it("create table, insert, select with dmdb", () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "sqlitestatement.dmdb");
    assert.isTrue(dmdb.isOpen);

    dmdb.withSqliteStatement("CREATE TABLE MyTable(id INTEGER PRIMARY KEY, stringcol TEXT, intcol INTEGER, doublecol REAL, blobcol)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    const stmt1 = "INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)";
    dmdb.withPreparedSqliteStatement(stmt1, (stmt) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValue(1, stringVal);
      stmt.bindValue(2, intVal);
      stmt.bindValue(3, doubleVal);
      stmt.bindValue(4, blobVal);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement(stmt1, (stmt) => {
      stmt.maybeBindString(1, stringVal);
      stmt.maybeBindInteger(2, intVal);
      stmt.maybeBindDouble(3, doubleVal);
      stmt.maybeBindBlob(4, blobVal);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement(stmt1, (stmt) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValues([stringVal, intVal, doubleVal, blobVal]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    const stmt2 = "INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(:string,:int,:double,:blob)";
    dmdb.withPreparedSqliteStatement(stmt2, (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValue(":string", stringVal);
      stmt.bindValue(":int", intVal);
      stmt.bindValue(":double", doubleVal);
      stmt.bindValue(":blob", blobVal);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement(stmt2, (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValues({ ":string": stringVal, ":int": intVal, ":double": doubleVal, ":blob": blobVal });
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.saveChanges();

    dmdb.withPreparedSqliteStatement("SELECT id,stringcol,intcol,doublecol,blobcol FROM MyTable", (stmt: SqliteStatement) => {
      assert.isTrue(stmt.isReadonly);
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        assert.equal(stmt.getColumnCount(), 5);
        const idSqlVal = stmt.getValue(0);
        assert.isFalse(idSqlVal.isNull);
        assert.equal(idSqlVal.type, SqliteValueType.Integer);
        assert.isDefined(idSqlVal.value);
        assert.equal(idSqlVal.value, rowCount);
        assert.equal(idSqlVal.getInteger(), rowCount);
        assert.equal(idSqlVal.columnName, "id");

        const stringSqlVal = stmt.getValue(1);
        assert.isFalse(stringSqlVal.isNull);
        assert.equal(stringSqlVal.type, SqliteValueType.String);
        assert.isDefined(stringSqlVal.value);
        assert.equal(stringSqlVal.value, stringVal);
        assert.equal(stringSqlVal.getString(), stringVal);
        assert.equal(stringSqlVal.columnName, "stringcol");

        const intSqlVal = stmt.getValue(2);
        assert.isFalse(intSqlVal.isNull);
        assert.equal(intSqlVal.type, SqliteValueType.Integer);
        assert.isDefined(intSqlVal.value);
        assert.equal(intSqlVal.value, intVal);
        assert.equal(intSqlVal.getInteger(), intVal);
        assert.equal(intSqlVal.columnName, "intcol");

        const doubleSqlVal = stmt.getValue(3);
        assert.isFalse(doubleSqlVal.isNull);
        assert.equal(doubleSqlVal.type, SqliteValueType.Double);
        assert.isDefined(doubleSqlVal.value);
        assert.equal(doubleSqlVal.value, doubleVal);
        assert.equal(doubleSqlVal.getDouble(), doubleVal);
        assert.equal(doubleSqlVal.columnName, "doublecol");

        const blobSqlVal = stmt.getValue(4);
        assert.isFalse(blobSqlVal.isNull);
        assert.equal(blobSqlVal.type, SqliteValueType.Blob);
        assert.isDefined(blobSqlVal.value);
        assert.equal((blobSqlVal.value as Uint8Array).byteLength, blobVal.byteLength);
        assert.equal(blobSqlVal.getBlob().byteLength, blobVal.byteLength);
        assert.equal(blobSqlVal.columnName, "blobcol");
      }
      assert.equal(rowCount, 5);
    });

    dmdb.withPreparedSqliteStatement("SELECT id,stringcol,intcol,doublecol,blobcol FROM MyTable", (stmt: SqliteStatement) => {
      assert.isTrue(stmt.isReadonly);
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        const row = stmt.getRow();
        assert.isDefined(row.id);
        assert.equal(row.id, rowCount);

        assert.isDefined(row.stringcol);
        assert.equal(row.stringcol, stringVal);

        assert.isDefined(row.intcol);
        assert.equal(row.intcol, intVal);

        assert.isDefined(row.doublecol);
        assert.equal(row.doublecol, doubleVal);

        assert.isDefined(row.blobcol);
        assert.equal((row.blobcol as Uint8Array).byteLength, blobVal.byteLength);
      }
      assert.equal(rowCount, 5);
    });

    dmdb.withPreparedSqliteStatement("SELECT id,stringcol,intcol,doublecol,blobcol FROM MyTable", (stmt: SqliteStatement) => {
      assert.isTrue(stmt.isReadonly);
      let rowCount = 0;
      for (const row of stmt) {
        rowCount++;
        assert.isDefined(row.id);
        assert.equal(row.id, rowCount);

        assert.isDefined(row.stringcol);
        assert.equal(row.stringcol, stringVal);

        assert.isDefined(row.intcol);
        assert.equal(row.intcol, intVal);

        assert.isDefined(row.doublecol);
        assert.equal(row.doublecol, doubleVal);

        assert.isDefined(row.blobcol);
        assert.equal((row.blobcol as Uint8Array).byteLength, blobVal.byteLength);
      }
      assert.equal(rowCount, 5);
    });
  });

  it("null values handling", () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "bindnull.dmdb");
    assert.isTrue(dmdb.isOpen);

    dmdb.withSqliteStatement("CREATE TABLE MyTable(id INTEGER PRIMARY KEY, stringcol TEXT, intcol INTEGER, doublecol REAL, blobcol)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValue(1, undefined);
      stmt.bindValue(2, undefined);
      stmt.bindValue(3, undefined);
      stmt.bindValue(4, undefined);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValues([]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValues([undefined, undefined]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(:string,:int,:double,:blob)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValue(":string", undefined);
      stmt.bindValue(":int", undefined);
      stmt.bindValue(":double", undefined);
      stmt.bindValue(":blob", undefined);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValues({});
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValues({ ":string": undefined, ":int": undefined });
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withPreparedSqliteStatement("INSERT INTO MyTable(stringcol,intcol,doublecol,blobcol) VALUES(?,?,?,?)", (stmt: SqliteStatement) => {
      stmt.maybeBindString(1, undefined);
      stmt.maybeBindInteger(2, undefined);
      stmt.maybeBindDouble(3, undefined);
      stmt.maybeBindBlob(4, undefined);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.saveChanges();

    dmdb.withPreparedSqliteStatement("SELECT id,stringcol,intcol,doublecol,blobcol FROM MyTable", (stmt: SqliteStatement) => {
      assert.isTrue(stmt.isReadonly);
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        for (let i = 0; i < stmt.getColumnCount(); i++) {
          const sqlVal = stmt.getValue(i);
          if (i === 0) {
            assert.isFalse(sqlVal.isNull);
            assert.equal(sqlVal.type, SqliteValueType.Integer);
            assert.equal(sqlVal.getInteger(), rowCount);
          } else {
            assert.isTrue(sqlVal.isNull);
            assert.equal(sqlVal.type, SqliteValueType.Null);
          }
        }
      }

      assert.equal(rowCount, 7);
    });
  });

  it("ids and guids", () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "idsandguids.dmdb");
    assert.isTrue(dmdb.isOpen);

    dmdb.withSqliteStatement("CREATE TABLE MyTable(id INTEGER PRIMARY KEY, guid BLOB)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    dmdb.withSqliteStatement("INSERT INTO MyTable(id,guid) VALUES(?,?)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValue(1, { id: "0x11" });
      stmt.bindValue(2, { guid: "370cea34-8415-4f81-b54c-85040eb3111e" });
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues([{ id: "0x12" }, { guid: "f9f1eb6e-1171-4f45-ba90-55c856056341" }]);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();
    });

    dmdb.withSqliteStatement("INSERT INTO MyTable(id,guid) VALUES(:id,:guid)", (stmt: SqliteStatement) => {
      assert.isFalse(stmt.isReadonly);
      stmt.bindValue(":id", { id: "0x13" });
      stmt.bindValue(":guid", { guid: "370cea34-8415-4f81-b54c-85040eb3111e" });
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();

      stmt.bindValues({ ":id": { id: "0x14" }, ":guid": { guid: "f9f1eb6e-1171-4f45-ba90-55c856056341" } });
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      stmt.reset();
      stmt.clearBindings();
    });

    dmdb.withSqliteStatement("SELECT id,guid FROM MyTable", (stmt: SqliteStatement) => {
      assert.isTrue(stmt.isReadonly);
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        const expectedId = rowCount + 16;
        const idVal = stmt.getValue(0);
        assert.equal(expectedId, idVal.getInteger());
        assert.equal(typeof (idVal.value), "number");
        assert.equal(expectedId, idVal.value);
        assert.equal(expectedId, Number.parseInt(idVal.getId(), 16));

        const guidVal = stmt.getValue(1);
        assert.instanceOf(guidVal.value, Uint8Array);

        if (rowCount % 2 !== 0)
          assert.equal("370cea34-8415-4f81-b54c-85040eb3111e", guidVal.getGuid());
        else
          assert.equal("f9f1eb6e-1171-4f45-ba90-55c856056341", guidVal.getGuid());

        const row = stmt.getRow();
        assert.isDefined(row.id);
        assert.equal(typeof (row.id), "number");
        assert.equal(expectedId, row.id);

        assert.isDefined(row.guid);
        assert.instanceOf(row.guid, Uint8Array);
      }
      assert.equal(4, rowCount);
    });
    dmdb.saveChanges();
  });

  it("run cached sql", () => {
    const fileName = "sqlitesqlagainstreadonlyconnection.dmdb";
    const ecdbPath = path.join(outDir, fileName);
    {
      using testEcdb = DMDbTestHelper.createDMDb(outDir, fileName);
      assert.isTrue(testEcdb.isOpen);
    }

    using dmdb = new DMDb();
    dmdb.openDb(ecdbPath, DMDbOpenMode.Readonly);
    assert.isTrue(dmdb.isOpen);

    let stmt0: SqliteStatement | undefined;
    dmdb.withPreparedSqliteStatement("SELECT Name,StrData FROM be_Prop WHERE Namespace='dm_Db'", (stmt: SqliteStatement) => {
      stmt0 = stmt;
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        assert.equal(stmt.getColumnCount(), 2);
        const nameVal = stmt.getValue(0);
        assert.equal(nameVal.columnName, "Name");
        assert.equal(nameVal.type, SqliteValueType.String);
        assert.isFalse(nameVal.isNull);
        const name = nameVal.getString();

        const versionVal = stmt.getValue(1);
        assert.equal(versionVal.columnName, "StrData");
        assert.equal(versionVal.type, SqliteValueType.String);
        assert.isFalse(versionVal.isNull);
        const profileVersion: any = JSON.parse(versionVal.getString());

        assert.isTrue(name === "SchemaVersion" || name === "InitialSchemaVersion");
        if (name === "SchemaVersion") {
          assert.equal(profileVersion.major, 4);
          assert.equal(profileVersion.minor, 0);
          assert.equal(profileVersion.sub1, 0);
          assert.isAtLeast(profileVersion.sub2, 1);
        } else if (name === "InitialSchemaVersion") {
          assert.equal(profileVersion.major, 4);
          assert.equal(profileVersion.minor, 0);
          assert.equal(profileVersion.sub1, 0);
          assert.isAtLeast(profileVersion.sub2, 1);
        }
      }
      assert.equal(rowCount, 2);
    });
    assert.isTrue(stmt0?.isPrepared, "stmt0 is in the cache");

    dmdb.resetSqliteCache(3);  // reset the statement cache to only hold 3 members so we can exercise overflowing it
    assert.isFalse(stmt0?.isPrepared, "reset cache clears stmt0");

    let stmt1: SqliteStatement | undefined;
    let stmt2: SqliteStatement | undefined;
    let stmt2a: SqliteStatement | undefined;
    let stmt3: SqliteStatement | undefined;
    let stmt4: SqliteStatement | undefined;
    let stmt5: SqliteStatement | undefined;
    dmdb.withPreparedSqliteStatement("SELECT 1", (stmt) => stmt1 = stmt);
    assert.isTrue(stmt1?.isPrepared, "stmt1 is in the cache");
    dmdb.withPreparedSqliteStatement("SELECT 2", (stmt) => stmt2 = stmt);
    assert.isTrue(stmt2?.isPrepared, "stmt2 is in the cache");
    dmdb.withPreparedSqliteStatement("SELECT 3", (stmt) => stmt3 = stmt);
    assert.isTrue(stmt3?.isPrepared, "stmt3 is in the cache");
    dmdb.withPreparedSqliteStatement("SELECT 4", (stmt) => stmt4 = stmt);
    assert.isTrue(stmt4?.isPrepared, "stmt4 is in the cache");
    assert.isFalse(stmt1?.isPrepared, "stmt1 was cleared from the cache");
    dmdb.withPreparedSqliteStatement("SELECT 2", (stmt) => stmt2a = stmt);
    assert.equal(stmt2, stmt2a, "statement 2 gets reused, moved to most recent");
    assert.isTrue(stmt3?.isPrepared, "statement 3 is still cached");
    dmdb.withPreparedSqliteStatement("SELECT 5", (stmt) => stmt5 = stmt);
    assert.isTrue(stmt5?.isPrepared, "statement 5 is cached");
    assert.isFalse(stmt3?.isPrepared, "statement 3 was lru and was dropped");

    let nested1: SqliteStatement | undefined;
    dmdb.withPreparedSqliteStatement("SELECT 1", (stmt) => {
      stmt1 = stmt;
      dmdb.withPreparedSqliteStatement("SELECT 1", (nested) => nested1 = nested);
    });
    assert.notEqual(stmt1, nested1, "shouldn't reuse an in-use statement");
    assert.isFalse(stmt1?.isPrepared, "outer 1 is not cached");
    assert.isTrue(nested1?.isPrepared, "nested1 is cached");
    assert.isTrue(stmt2?.isPrepared, "stmt2 is in the cache");
    assert.isTrue(stmt5?.isPrepared, "stmt5 is in the cache");
  });
  // This test generate no log when run as suite but is successful when only this fixture run.
  it("check prepare logErrors flag", () => {
    const fileName = "logErrors.dmdb";
    const ecdbPath = path.join(outDir, fileName);
    {
      using testEcdb = DMDbTestHelper.createDMDb(outDir, fileName);
      assert.isTrue(testEcdb.isOpen);
    }
    using dmdb = new DMDb();
    dmdb.openDb(ecdbPath, DMDbOpenMode.Readonly);
    assert.isTrue(dmdb.isOpen);
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
    assert.throw(() => dmdb.withPreparedStatement("SELECT abc FROM abc.def", () => { }, /* logErrors = */ false), ""); // BUG: we do not see error message
    assert.isFalse(slm.finishAndDispose(), "logMatcher should not detect log");
  });
});
