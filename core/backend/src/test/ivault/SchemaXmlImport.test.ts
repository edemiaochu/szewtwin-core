/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { PhysicalElement, SnapshotDb } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { Logger, LogLevel } from "@szewtwin/core-szewec";
import { KnownTestLocations } from "../KnownTestLocations";
import { DMSpecVersion, EntityClass, Format } from "@szewtwin/dmschema-metadata";

describe("Schema XML Import Tests", () => {
  before(() => {
    // initialize logging
    if (false) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
    }
  });

  it("should import schema XML", async () => {
    const testFileName = IVaultTestUtils.prepareOutputFile("SchemaXMLImport", "SchemaXMLImport.dtw");
    const ivault = SnapshotDb.createEmpty(testFileName, { rootSubject: { name: "SchemaXMLImportTest" } });

    try {
      const schemaFilePath = path.join(KnownTestLocations.assetsDir, "Test3.dmschema.xml");
      const schemaString = fs.readFileSync(schemaFilePath, "utf8");

      await ivault.importSchemaStrings([schemaString]); // will throw an exception if import fails

      const testDomainClass = await ivault.schemaContext.getSchemaItem("Test3.Test3Element", EntityClass);
      assert.isDefined(testDomainClass);

      assert.isDefined(testDomainClass?.baseClass);

      assert.equal(testDomainClass?.baseClass?.fullName, PhysicalElement.classFullName.replace(":", "."));
    } finally {
      ivault.close();
    }
  });

  it("Schema import for newer DMXml Versions", async () => {
    const testFileName = IVaultTestUtils.prepareOutputFile("SchemaXMLImport", "SchemaVersionTest.dtw");
    const ivault = SnapshotDb.createEmpty(testFileName, { rootSubject: { name: "SchemaVersionTest" } });

    try {
      const helperFunction = async (ivaultDb: SnapshotDb, xmlSchema: string[], importSchema: boolean) => {
        try {
          // DMObjects is expected to throw for schemas that fail to import
          if (importSchema)
            await ivaultDb.importSchemaStrings(xmlSchema);
          else
            ivaultDb.getSchemaProps(xmlSchema[0]);
        } catch {
          return false;
        }
        return true;
      };

      // Incrementing major DMXml version is not supported
      for (const testCase of [`4.1`, `5.10`]) {
        assert(!(await helperFunction(ivault, [`<DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.${testCase}"/>`], true)), `Schema ${testCase} import should not have succeeded.`);
        assert(!(await helperFunction(ivault, [`TestSchema`], false)), `Schema ${testCase} test should not have succeeded.`);
      }

      // Importing a set of schemas should all fail if any one of them fails
      {
        const schemaXmls = [`<DMSchema schemaName="TestSchema1" alias="ts1" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2"/>`,
          `<DMSchema schemaName="TestSchema2" alias="ts2" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.8"/>`,
          `<DMSchema schemaName="TestSchema3" alias="ts3" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.4.5"/>`];

        assert(!(await helperFunction(ivault, schemaXmls, true)), `Schema import should not have succeeded.`);
        assert(!(await helperFunction(ivault, [`TestSchema1`], false)), `Schema TestSchema1 import should not have succeeded.`);
        assert(!(await helperFunction(ivault, [`TestSchema2`], false)), `Schema TestSchema2 import should not have succeeded.`);
        assert(!(await helperFunction(ivault, [`TestSchema3`], false)), `Schema TestSchema3 import should not have succeeded.`);
      }

      // Schema should be imported successfully
      for (const testCase of [`3.2`, `3.5`]) {
        assert(await helperFunction(ivault, [`<DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.${testCase}"/>`], true), `Schema ${testCase} import should have succeeded.`);
        assert(await helperFunction(ivault, [`TestSchema`], false), `Schema ${testCase} test should have succeeded.`);
      }
    } finally {
      ivault.close();
    }
  });

  it.skip("should roundtrip ratio format properties", async () => {
    // Create a separate iVault for this test
    const testFileName = IVaultTestUtils.prepareOutputFile("SchemaXMLImport", "RatioFormatRoundtrip.dtw");
    const testIVault = SnapshotDb.createEmpty(testFileName, { rootSubject: { name: "RatioFormatTest" } });

    try {
      const schemaXml = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="RatioFormatTest" alias="rft" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="Units" version="01.00.09" alias="u"/>
        <Format typeName="TestRatioFormat" type="Ratio" ratioType="OneToN" ratioSeparator=":" ratioFormatType="Decimal" precision="4" formatTraits="trailZeroes|showUnitLabel">
          <Composite>
            <Unit>u:M</Unit>
          </Composite>
        </Format>
        <Format typeName="TestRatioFormat2" type="Ratio" ratioType="NToOne" ratioSeparator="=" ratioFormatType="Fractional" precision="8" formatTraits="keepSingleZero">
          <Composite>
            <Unit>u:M</Unit>
          </Composite>
        </Format>
      </DMSchema>`;

      // Import schema into iVault
      await testIVault.importSchemaStrings([schemaXml]);

      // Read back the format from the iVault's schema context
      const format1 = await testIVault.schemaContext.getSchemaItem("RatioFormatTest.TestRatioFormat", Format);
      assert.isDefined(format1);
      assert.strictEqual(format1?.ratioType, "OneToN");
      assert.strictEqual(format1?.ratioSeparator, ":");
      assert.strictEqual(format1?.ratioFormatType, "Decimal");

      const format2 = await testIVault.schemaContext.getSchemaItem("RatioFormatTest.TestRatioFormat2", Format);
      assert.isDefined(format2);
      assert.strictEqual(format2?.ratioType, "NToOne");
      assert.strictEqual(format2?.ratioSeparator, "=");
      assert.strictEqual(format2?.ratioFormatType, "Fractional");
    } finally {
      testIVault.close();
    }
  });
});

describe("exportSchemaXmlString", () => {
  const schemaXml32 = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="1.0.23" alias="bis"/>

      <DMEntityClass typeName="TestClass">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="Name" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`;

  let ivault: SnapshotDb;

  before(async () => {
    const filePath = IVaultTestUtils.prepareOutputFile("exportSchemaXmlString", "exportSchemaXmlString.dtw");
    ivault = SnapshotDb.createEmpty(filePath, { rootSubject: { name: "exportSchemaXmlStringTest" } });
    await ivault.importSchemaStrings([schemaXml32]);
  });

  after(() => {
    ivault.close();
  });

  it("default DMSpecVersion arg return an 3.2 XML", () => {
    const xml = ivault.exportSchemaXmlString("TestSchema");
    assert.isDefined(xml, "expected a non-undefined result for an existing schema");
    assert.include(xml, "Szewec.DMXML.3.2", "expected DM 3.2 namespace when no version is supplied");
    assert.include(xml, "TestSchema", "schema name should be present in output");
  });

  it("returns undefined for a schema that does not exist", () => {
    const xml = ivault.exportSchemaXmlString("NonExistentSchema");
    assert.isUndefined(xml, "expected undefined for an unknown schema name");
  });

  it("test returned XML contains the entity class", () => {
    const xml = ivault.exportSchemaXmlString("TestSchema");
    assert.isDefined(xml);
    assert.match(xml!, /^<\?xml|^<DMSchema/, "output should start with an XML declaration or root element");
    assert.include(xml, "TestClass", "DMEntityClass 'TestClass' should be present in serialised output");
    assert.include(xml, "Name", "property 'Name' should be present in serialised output");
  });

  it("DMSpecVersion 3.2 version returns 3.2 XML", () => {
    const version: DMSpecVersion = { readVersion: 3, writeVersion: 2 };
    const xml = ivault.exportSchemaXmlString("TestSchema", version);
    assert.isDefined(xml);
    assert.include(xml, "Szewec.DMXML.3.2");
    assert.include(xml, "TestSchema");
  });

  it("DMSpecVersion 3.1 version returns 3.1 XML", () => {
    const version: DMSpecVersion = { readVersion: 3, writeVersion: 1 };
    const xml = ivault.exportSchemaXmlString("TestSchema", version);
    assert.isDefined(xml);
    assert.include(xml, "Szewec.DMXML.3.1", "expected DM 3.1 namespace");
    assert.notInclude(xml, "Szewec.DMXML.3.2", "should not contain 3.2 namespace when requesting 3.1");
  });

  it("DMSpecVersion 3.0 version returns 3.0 XML", () => {
    const version: DMSpecVersion = { readVersion: 3, writeVersion: 0 };
    const xml = ivault.exportSchemaXmlString("TestSchema", version);
    assert.isDefined(xml);
    assert.include(xml, "Szewec.DMXML.3.0", "expected DM 3.0 namespace");
    assert.notInclude(xml, "Szewec.DMXML.3.2", "should not contain 3.2 namespace when requesting 3.0");
  });

  it("DMSpecVersion 2.0 version returns 2.0 XML", () => {
    const version: DMSpecVersion = { readVersion: 2, writeVersion: 0 };
    const xml = ivault.exportSchemaXmlString("TestSchema", version);
    assert.isDefined(xml, "expected a result for DM 2.0 export");
    assert.notInclude(xml, "Szewec.DMXML.3.", "DM 2.0 output should not contain an DM 3.x namespace URI");
  });
});
