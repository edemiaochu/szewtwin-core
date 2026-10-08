/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { DbResult, Id64, Id64String, Logger, LogLevel } from "@szewtwin/core-szewec";
import { IVaultJsFs } from "../../IVaultJsFs";
import { DMDb, DMDbOpenMode, DMSqlInsertResult, DMSqlStatement, DMSqlWriteStatement, SqliteStatement, SqliteValue, SqliteValueType } from "../../core-backend";
import { KnownTestLocations } from "../KnownTestLocations";
import { DMDbTestHelper } from "./DMDbTestHelper";
import { QueryOptionsBuilder } from "@szewtwin/core-common";
import { EntityClass, SchemaContext, SchemaJsonLocater, SchemaKey } from "@szewtwin/dmschema-metadata";

describe("DMDb", () => {
  const outDir = KnownTestLocations.outputDir;

  it("should be able to create a new DMDb", () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "create.dmdb");
    assert.isTrue(dmdb.isOpen);
  });

  it("should be able to close an DMDb", () => {
    const dmdb: DMDb = DMDbTestHelper.createDMDb(outDir, "close.dmdb");
    assert.isTrue(dmdb.isOpen);
    dmdb.closeDb();
    assert.isFalse(dmdb.isOpen);
  });

  it("should be able to open an DMDb", () => {
    const fileName = "open.dmdb";
    const ecdbPath: string = path.join(outDir, fileName);
    {
      using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName);
      assert.isTrue(testDMDb.isOpen);
    }

    using dmdb = new DMDb();
    dmdb.openDb(ecdbPath, DMDbOpenMode.ReadWrite);
    assert.isTrue(dmdb.isOpen);
  });

  it("Open DMDb with upgrade option", () => {
    const fileName = "open.dmdb";
    const ecdbPath: string = path.join(outDir, fileName);
    {
      using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName);
      assert.isTrue(testDMDb.isOpen);
    }
    {
      using dmdb = new DMDb();
      assert.doesNotThrow(() => dmdb.openDb(ecdbPath, DMDbOpenMode.Readonly));
    }
    {
      using dmdb = new DMDb();
      assert.doesNotThrow(() => dmdb.openDb(ecdbPath, DMDbOpenMode.ReadWrite));
    }
    {
      using dmdb = new DMDb();
      assert.doesNotThrow(() => dmdb.openDb(ecdbPath, DMDbOpenMode.FileUpgrade));
    }

  });
  it("attach/detach newer profile version", async () => {
    const fileName1 = "source_file.dmdb";
    const ecdbPath1: string = path.join(outDir, fileName1);
    using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName1,
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMEntityClass typeName="Person" modifier="Sealed">
        <DMProperty propertyName="Name" typeName="string"/>
        <DMProperty propertyName="Age" typeName="int"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(testDMDb.isOpen);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    testDMDb.withPreparedStatement("INSERT INTO test.Person(Name,Age) VALUES('Mary', 45)", (stmt: DMSqlStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      assert.isTrue(Id64.isValidId64(res.id!));
      return res.id!;
    });

    // override profile version to 55.0.0 which is currently not supported
    testDMDb.withSqliteStatement(`
        UPDATE be_Prop SET
          StrData = '{"major":55,"minor":0,"sub1":0,"sub2":0}'
        WHERE Namespace = 'dm_Db' AND Name = 'SchemaVersion'`,
      (stmt: SqliteStatement) => { stmt.step(); });
    testDMDb.saveChanges();

    const runDbListPragmaUsingStatement = (dmdb: DMDb) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return dmdb.withPreparedStatement("PRAGMA db_list", (stmt: DMSqlStatement) => {
        const result: { alias: string, filename: string, profile: string }[] = [];
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          result.push(stmt.getRow());
        }
        return result;
      });
    }
    const runDbListPragmaCCQ = async (dmdb: DMDb) => {
      const reader = dmdb.createQueryReader("PRAGMA db_list");
      const result: { alias: string, filename: string, profile: string }[] = [];
      while (await reader.step()) {
        result.push(reader.current.toRow());
      }
      return result;
    }
    using testDMDb0 = DMDbTestHelper.createDMDb(outDir, "file2.dmdb");
    // following call will not fail but unknow DMDb profile will cause it to be attach as SQLite.
    testDMDb0.attachDb(ecdbPath1, "source");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(() => testDMDb0.withPreparedStatement("SELECT Name, Age FROM source.test.Person", () => { })).to.throw("DMClass 'source.test.Person' does not exist or could not be loaded.");
    expect(runDbListPragmaUsingStatement(testDMDb0)).deep.equals([
      {
        sno: 0,
        alias: "main",
        fileName: path.join(outDir, "file2.dmdb"),
        profile: "DMDb"
      },
      {
        sno: 1,
        alias: "source",
        fileName: path.join(outDir, "source_file.dmdb"),
        profile: "SQLite"
      }
    ]);
    testDMDb0.detachDb("source");
    expect(runDbListPragmaUsingStatement(testDMDb0)).deep.equals([
      {
        sno: 0,
        alias: "main",
        fileName: path.join(outDir, "file2.dmdb"),
        profile: "DMDb"
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(() => testDMDb0.withPreparedStatement("SELECT Name, Age FROM source.test.Person", () => { })).to.throw("DMClass 'source.test.Person' does not exist or could not be loaded.");

    using testDMDb1 = DMDbTestHelper.createDMDb(outDir, "file4.dmdb");
    testDMDb1.attachDb(ecdbPath1, "source");
    const reader1 = testDMDb1.createQueryReader("SELECT Name, Age FROM source.test.Person");
    let expectThrow = false;
    try {
      await reader1.step();
    } catch (err) {
      if (err instanceof Error) {
        assert.equal(err.message, "DMClass 'source.test.Person' does not exist or could not be loaded.");
        expectThrow = true;
      }
    }
    assert.isTrue(expectThrow);
    expect(await runDbListPragmaCCQ(testDMDb1)).deep.equals([
      {
        sno: 0,
        alias: "main",
        fileName: path.join(outDir, "file4.dmdb"),
        profile: "DMDb"
      },
      {
        sno: 1,
        alias: "source",
        fileName: path.join(outDir, "source_file.dmdb"),
        profile: "SQLite"
      }
    ]);
    testDMDb1.detachDb("source");
    expect(await runDbListPragmaCCQ(testDMDb1)).deep.equals([
      {
        sno: 0,
        alias: "main",
        fileName: path.join(outDir, "file4.dmdb"),
        profile: "DMDb"
      },
    ]);
  });
  it("attach/detach file & db_list pragma", async () => {
    const fileName1 = "source_file.dmdb";
    const ecdbPath1: string = path.join(outDir, fileName1);
    using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName1,
      `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMEntityClass typeName="Person" modifier="Sealed">
        <DMProperty propertyName="Name" typeName="string"/>
        <DMProperty propertyName="Age" typeName="int"/>
      </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(testDMDb.isOpen);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    testDMDb.withPreparedStatement("INSERT INTO test.Person(Name,Age) VALUES('Mary', 45)", (stmt: DMSqlStatement) => {
      const res: DMSqlInsertResult = stmt.stepForInsert();
      assert.equal(res.status, DbResult.BE_SQLITE_DONE);
      assert.isDefined(res.id);
      assert.isTrue(Id64.isValidId64(res.id!));
      return res.id!;
    });
    testDMDb.saveChanges();

    const runDbListPragma = (dmdb: DMDb) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return dmdb.withPreparedStatement("PRAGMA db_list", (stmt: DMSqlStatement) => {
        const result: { alias: string, filename: string, profile: string }[] = [];
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          result.push(stmt.getRow());
        }
        return result;
      });
    }
    using testDMDb0 = DMDbTestHelper.createDMDb(outDir, "file2.dmdb");
    testDMDb0.attachDb(ecdbPath1, "source");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    testDMDb0.withPreparedStatement("SELECT Name, Age FROM source.test.Person", (stmt: DMSqlStatement) => {
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.name, "Mary");
      assert.equal(row.age, 45);
    });
    expect(runDbListPragma(testDMDb0)).deep.equals([
      {
        sno: 0,
        alias: "main",
        fileName: path.join(outDir, "file2.dmdb"),
        profile: "DMDb"
      },
      {
        sno: 1,
        alias: "source",
        fileName: path.join(outDir, "source_file.dmdb"),
        profile: "DMDb"
      }
    ]);
    testDMDb0.detachDb("source");
    expect(runDbListPragma(testDMDb0)).deep.equals([
      {
        sno: 0,
        alias: "main",
        fileName: path.join(outDir, "file2.dmdb"),
        profile: "DMDb"
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(() => testDMDb0.withPreparedStatement("SELECT Name, Age FROM source.test.Person", () => { })).to.throw("DMClass 'source.test.Person' does not exist or could not be loaded.");

    using testDMDb1 = DMDbTestHelper.createDMDb(outDir, "file3.dmdb");
    testDMDb1.attachDb(ecdbPath1, "source");
    const reader1 = testDMDb1.createQueryReader("SELECT Name, Age FROM source.test.Person", undefined, new QueryOptionsBuilder().setUsePrimaryConnection(true).getOptions());
    assert.equal(await reader1.step(), true);
    assert.equal(reader1.current.name, "Mary");
    assert.equal(reader1.current.age, 45);
    testDMDb1.detachDb("source");


    using testDMDb2 = DMDbTestHelper.createDMDb(outDir, "file4.dmdb");
    testDMDb2.attachDb(ecdbPath1, "source");
    const reader2 = testDMDb2.createQueryReader("SELECT Name, Age FROM source.test.Person");
    assert.equal(await reader2.step(), true);
    assert.equal(reader2.current.name, "Mary");
    assert.equal(reader2.current.age, 45);
    testDMDb2.detachDb("source");
    const reader3 = testDMDb2.createQueryReader("SELECT Name, Age FROM source.test.Person");
    let expectThrow = false;
    try {
      await reader3.step();
    } catch (err) {
      if (err instanceof Error) {
        assert.equal(err.message, "DMClass 'source.test.Person' does not exist or could not be loaded.");
        expectThrow = true;
      }
    }
    assert.isTrue(expectThrow);
  });
  it("should be able to import a schema", () => {
    const fileName = "schemaimport.dmdb";
    const ecdbPath: string = path.join(outDir, fileName);
    let id: Id64String;
    {
      using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName,
        `<DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
      <DMEntityClass typeName="Person" modifier="Sealed">
      <DMProperty propertyName="Name" typeName="string"/>
        <DMProperty propertyName="Age" typeName="int"/>
        </DMEntityClass>
        </DMSchema>`);
      assert.isTrue(testDMDb.isOpen);
      id = testDMDb.withCachedWriteStatement("INSERT INTO test.Person(Name,Age) VALUES('Mary', 45)", (stmt: DMSqlWriteStatement) => {
        const res: DMSqlInsertResult = stmt.stepForInsert();
        assert.equal(res.status, DbResult.BE_SQLITE_DONE);
        assert.isDefined(res.id);
        assert.isTrue(Id64.isValidId64(res.id!));
        return res.id!;
      });
      testDMDb.saveChanges();
    }

    using dmdb = new DMDb();
    dmdb.openDb(ecdbPath, DMDbOpenMode.Readonly);
    assert.isTrue(dmdb.isOpen);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withPreparedStatement("SELECT Name, Age FROM test.Person WHERE DMInstanceId=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, id);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      const row = stmt.getRow();
      assert.equal(row.name, "Mary");
      assert.equal(row.age, 45);
    });
  });

  it("should be able to get schema props", () => {
    const fileName = "schema-props.dmdb";
    const ecdbPath: string = path.join(outDir, fileName);
    {
      using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName);
      assert.isTrue(testDMDb.isOpen);
    }
    using dmdb = new DMDb();
    dmdb.openDb(ecdbPath);
    const schema = dmdb.getSchemaProps("DMDbMeta");
    assert.equal(schema.name, "DMDbMeta");
  });

  it("Run plain SQL", () => {
    const fileName = "plainseql.dmdb";
    const ecdbPath: string = path.join(outDir, fileName);
    {
      using testDMDb = DMDbTestHelper.createDMDb(outDir, fileName);
      assert.isTrue(testDMDb.isOpen);

      testDMDb.withPreparedSqliteStatement("CREATE TABLE Test(Id INTEGER PRIMARY KEY, Name TEXT NOT NULL, Code INTEGER)", (stmt: SqliteStatement) => {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      testDMDb.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(?,?)", (stmt: SqliteStatement) => {
        stmt.bindValue(1, "Dummy 1");
        stmt.bindValue(2, 100);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      testDMDb.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(?,?)", (stmt: SqliteStatement) => {
        stmt.bindValues(["Dummy 2", 200]);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      testDMDb.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(:p1,:p2)", (stmt: SqliteStatement) => {
        stmt.bindValue(":p1", "Dummy 3");
        stmt.bindValue(":p2", 300);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      testDMDb.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(:p1,:p2)", (stmt: SqliteStatement) => {
        stmt.bindValues({ ":p1": "Dummy 4", ":p2": 400 });
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      testDMDb.saveChanges();
    }

    using dmdb = new DMDb();
    dmdb.openDb(ecdbPath, DMDbOpenMode.Readonly);
    assert.isTrue(dmdb.isOpen);

    dmdb.withPreparedSqliteStatement("SELECT Id,Name,Code FROM Test ORDER BY Id", (stmt: SqliteStatement) => {
      for (let i: number = 1; i <= 4; i++) {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        assert.equal(stmt.getColumnCount(), 3);
        const val0: SqliteValue = stmt.getValue(0);
        assert.equal(val0.columnName, "Id");
        assert.equal(val0.type, SqliteValueType.Integer);
        assert.isFalse(val0.isNull);
        assert.equal(val0.getInteger(), i);

        const val1: SqliteValue = stmt.getValue(1);
        assert.equal(val1.columnName, "Name");
        assert.equal(val1.type, SqliteValueType.String);
        assert.isFalse(val1.isNull);
        assert.equal(val1.getString(), `Dummy ${i}`);

        const val2: SqliteValue = stmt.getValue(2);
        assert.equal(val2.columnName, "Code");
        assert.equal(val2.type, SqliteValueType.Integer);
        assert.isFalse(val2.isNull);
        assert.equal(val2.getInteger(), i * 100);

        const row: any = stmt.getRow();
        assert.equal(row.id, i);
        assert.equal(row.name, `Dummy ${i}`);
        assert.equal(row.code, i * 100);
      }
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });
  });

  it("test unit labels in composite formats", () => {
    const dmdb: DMDb = DMDbTestHelper.createDMDb(outDir, "TestCompositeFormats.dmdb");
    const xmlpathOriginal = path.join(outDir, "compositeFormats1.dmschema.xml");

    IVaultJsFs.writeFileSync(xmlpathOriginal, `<?xml version="1.0" encoding="utf-8" ?>
    <DMSchema schemaName="TestCompositeFormats" alias="tcf" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="Units" version="01.00.00" alias="u" />
      <Unit typeName="TestUnit" displayLabel="Test Unit" definition="u:M" numerator="1.0" phenomenon="u:LENGTH" unitSystem="u:METRIC" />
      <Format typeName="TestFormat" displayLabel="TestFormat" roundFactor="0.3" type="Fractional" showSignOption="OnlyNegative" formatTraits="TrailZeroes|KeepSingleZero" precision="4" decimalSeparator="." thousandSeparator="," uomSeparator=" ">
        <Composite>
          <Unit>u:KM</Unit>
          <Unit label="m">TestUnit</Unit>
          <Unit label="">u:CM</Unit>
          <Unit label="mm">u:MM</Unit>
        </Composite>
      </Format>
      <KindOfQuantity typeName="TestKOQ2" description="Test KOQ2" displayLabel="TestKOQ2" persistenceUnit="u:M" presentationUnits="TestFormat" relativeError="10e-3" />
    </DMSchema>`);
    dmdb.importSchema(xmlpathOriginal);
    dmdb.saveChanges();

    const expectedLabels = [undefined, "m", "", "mm"];
    let index = 0;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withStatement("select label from meta.FormatCompositeUnitDef where Format.Id=0x1", (stmt: DMSqlStatement) => {
      for (let i: number = 1; i <= 4; i++) {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        expect(stmt.getRow().label).to.eql(expectedLabels[index++]);
      }
    });

    const xmlpathUpdated = path.join(outDir, "compositeFormats2.dmschema.xml");
    IVaultJsFs.writeFileSync(xmlpathUpdated, `<?xml version="1.0" encoding="utf-8" ?>
    <DMSchema schemaName="TestCompositeFormats" alias="tcf" version="1.0.1" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="Units" version="01.00.00" alias="u" />
      <Unit typeName="TestUnit" displayLabel="Test Unit" definition="u:M" numerator="1.0" phenomenon="u:LENGTH" unitSystem="u:METRIC" />
      <Format typeName="TestFormat" displayLabel="TestFormat" roundFactor="0.3" type="Fractional" showSignOption="OnlyNegative" formatTraits="TrailZeroes|KeepSingleZero" precision="4" decimalSeparator="." thousandSeparator="," uomSeparator=" ">
        <Composite spacer="=" includeZero="False">
          <Unit label="">u:KM</Unit>
          <Unit label="m">TestUnit</Unit>
          <Unit>u:CM</Unit>
          <Unit label="mm">u:MM</Unit>
        </Composite>
      </Format>
      <KindOfQuantity typeName="TestKOQ2" description="Test KOQ2" displayLabel="TestKOQ2" persistenceUnit="u:M" presentationUnits="TestFormat" relativeError="10e-3" />
    </DMSchema>`);

    dmdb.importSchema(xmlpathUpdated);
    dmdb.saveChanges();

    const expectedLabelsUpdated = ["", "m", undefined, "mm"];
    index = 0;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    dmdb.withStatement("select label from meta.FormatCompositeUnitDef where Format.Id=0x1", (stmt: DMSqlStatement) => {
      for (let i: number = 1; i <= 4; i++) {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        expect(stmt.getRow().label).to.eql(expectedLabelsUpdated[index++]);
      }
    });

    dmdb.closeDb();
  });

  it("should log warning but continue if new schema changes are observed without version bump", async () => {
    const dmdb: DMDb = DMDbTestHelper.createDMDb(outDir, "importSchemaNoVersionBump.dmdb");
    const xmlpathOriginal = path.join(outDir, "importSchemaNoVersionBump1.dmschema.xml");

    IVaultJsFs.writeFileSync(xmlpathOriginal, `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMEntityClass typeName="Person" modifier="Sealed">
        <DMProperty propertyName="Name" typeName="string"/>
        <DMProperty propertyName="Age" typeName="int"/>
      </DMEntityClass>
    </DMSchema>`);
    dmdb.importSchema(xmlpathOriginal);
    dmdb.saveChanges();

    const xmlpathUpdated = path.join(outDir, "importSchemaNoVersionBump2.dmschema.xml");
    IVaultJsFs.writeFileSync(xmlpathUpdated, `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMEntityClass typeName="Person" modifier="Sealed">
        <DMProperty propertyName="Name" typeName="string"/>
        <DMProperty propertyName="Age" typeName="int"/>
        <DMProperty propertyName="Height" typeName="int"/>
      </DMEntityClass>
    </DMSchema>`);

    let calledCategory = "";
    let calledMessage = "";
    const stubbedLogWarning = sinon.stub(Logger, "logWarning").callsFake((category: string, message: string) => {
      calledCategory = category;
      calledMessage = message;
    });
    const prevLevel = Logger.getLevel("DMDb");

    try {
      Logger.setLevel("DMDb", LogLevel.Warning);
      // We do not want this behavior (just logs a warning and proceeds), initially we intended to throw an error
      // We will wait for the next major change to make this a hard error
      expect(dmdb.importSchema(xmlpathUpdated)).to.not.throw;
      expect(calledCategory).to.equal("DMDb");
      expect(calledMessage).to.equal("Schema 'Test' has changes but its version was not incremented. Proceeding with import, but this may lead to unexpected behavior.");
      stubbedLogWarning.restore();
    }
    finally {
      if (prevLevel !== undefined)
        Logger.setLevel("DMDb", prevLevel);
      else
        delete (Logger as any)._categoryFilter.DMDb;
    }

    const context = new SchemaContext();
    const locater = new SchemaJsonLocater((name) => dmdb.getSchemaProps(name));
    context.addLocater(locater);
    const schema = await context.getSchema(new SchemaKey("Test", 1, 0, 0));
    assert.isDefined(schema);
    const personClass = await schema!.getItem("Person", EntityClass);
    assert.isDefined(personClass);
    const heightProp = personClass!.getProperty("Height");
    assert.isDefined(heightProp);

    dmdb.closeDb();
  });

  it("should drop a single schema", () => {
    using dmdb = DMDbTestHelper.createDMDb(outDir, "test.dmdb",
      `<DMSchema schemaName="Test" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="Foo" modifier="Sealed">
          <DMProperty propertyName="n" typeName="int"/>
        </DMEntityClass>
      </DMSchema>`);
    assert.isTrue(dmdb.isOpen);
    dmdb.saveChanges();
    const schemaProps = dmdb.getSchemaProps("Test");
    expect(schemaProps.name).to.equal("Test");

    dmdb.dropSchemas(["Test"]);
    expect(() => dmdb.getSchemaProps("Test")).to.throw();
  });

  it("should drop multiple schemas", () => {
    const testSchema1Xml = `<?xml version="1.0" encoding="utf-8"?>
      <DMSchema schemaName="TestSchema1" alias="ts1" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMEntityClass typeName="TestClass1">
          <DMProperty propertyName="Prop1" typeName="string"/>
        </DMEntityClass>
      </DMSchema>`;

    const testSchema2Xml = `<?xml version="1.0" encoding="utf-8"?>
      <DMSchema schemaName="TestSchema2" alias="ts2" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="TestSchema1" version="01.00.00" alias="ts1"/>
        <DMEntityClass typeName="TestClass2">
          <DMProperty propertyName="Prop2" typeName="string"/>
        </DMEntityClass>
      </DMSchema>`;

    using dmdb = DMDbTestHelper.createDMDb(outDir, "drop-multiple-schemas.dmdb");
    assert.isTrue(dmdb.isOpen);

    const schema1Path = path.join(outDir, "TestSchema1.dmschema.xml");
    IVaultJsFs.writeFileSync(schema1Path, testSchema1Xml);
    dmdb.importSchema(schema1Path);

    const schema2Path = path.join(outDir, "TestSchema2.dmschema.xml");
    IVaultJsFs.writeFileSync(schema2Path, testSchema2Xml);
    dmdb.importSchema(schema2Path);

    dmdb.saveChanges();

    const schema1Props = dmdb.getSchemaProps("TestSchema1");
    expect(schema1Props.name).to.equal("TestSchema1");
    const schema2Props = dmdb.getSchemaProps("TestSchema2");
    expect(schema2Props.name).to.equal("TestSchema2");

    expect(() => dmdb.dropSchemas(["TestSchema1"])).to.throw();

    const stillExistsSchema1 = dmdb.getSchemaProps("TestSchema1");
    expect(stillExistsSchema1.name).to.equal("TestSchema1");

    dmdb.dropSchemas(["TestSchema2", "TestSchema1"]);

    expect(() => dmdb.getSchemaProps("TestSchema2")).to.throw();
    expect(() => dmdb.getSchemaProps("TestSchema1")).to.throw();

    IVaultJsFs.removeSync(schema1Path);
    IVaultJsFs.removeSync(schema2Path);
  });
});
