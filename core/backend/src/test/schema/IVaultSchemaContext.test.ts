/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import * as fs from "fs";
import { Code } from "@szewtwin/core-common";
import {
  DefinitionElement,
  DMDb,
  Element,
  IVaultHost,
  IVaultJsFs,
  InformationContentElement,
  RepositoryLink,
  SnapshotDb, SpatialViewDefinition, UrlLink, ViewDefinition3d,
} from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { TestUtils } from "../TestUtils";
import { EntityClass, SchemaContext, SchemaJsonLocater, SchemaKey, SchemaMatchType } from "@szewtwin/dmschema-metadata";

describe("IVault Schema Context", () => {
  let ivault: SnapshotDb;

  before(() => {
    const seedFileName = IVaultTestUtils.resolveAssetFile("test.dtw");
    const testFileName = IVaultTestUtils.prepareOutputFile("IVaultSchemaContext", "IVaultSchemaContext.dtw");
    ivault = IVaultTestUtils.createSnapshotFromSeed(testFileName, seedFileName);
    assert.exists(ivault);
  });

  after(() => {
    ivault?.close();
  });

  it("should verify the Entity metadata of known element subclasses", async () => {
    const code1 = new Code({ spec: "0x10", scope: "0x11", value: "RF1.bld" });
    const el = ivault.elements.getElement(code1);
    assert.exists(el);
    if (el) {
      const dmClass = await el.getMetaData();
      assert.exists(dmClass);
      assert.equal(dmClass.schema.name, el.schemaName);
      assert.equal(dmClass.name, el.className);

      // I happen to know that this is a BisCore:RepositoryLink
      assert.equal(dmClass.fullName, RepositoryLink.schemaItemKey.fullName);
      //  Check the metadata on the class itself
      const baseClass = await dmClass.baseClass;
      assert.exists(dmClass.baseClass);
      if (undefined === baseClass)
        return;

      assert.equal(baseClass.fullName, UrlLink.schemaItemKey.fullName);
      assert.exists(dmClass.customAttributes);
      assert.isTrue(dmClass.customAttributes?.has("BisCore.ClassHasHandler"));
      //  Check the metadata on the one property that RepositoryLink defines, RepositoryGuid
      const property = await dmClass.getProperty("repositoryGuid");
      assert.exists(property);
      if (undefined === property)
        return;

      if (!property.isPrimitive())
        assert.fail("Property is not primitive");

      assert.equal(property.extendedTypeName, "BeGuid");
      assert.isTrue(property.customAttributes?.has("CoreCustomAttributes.HiddenProperty"));
    }
    const el2 = ivault.elements.getElement("0x34");
    assert.exists(el2);
    if (el2) {
      const metaData = await el2.getMetaData();
      assert.exists(metaData);
      if (undefined === metaData)
        return;
      assert.equal(metaData.fullName, el2.schemaItemKey.fullName);
      // I happen to know that this is a BisCore.SpatialViewDefinition
      assert.equal(metaData.fullName, SpatialViewDefinition.schemaItemKey.fullName);

      const baseClass = await metaData.baseClass;
      assert.exists(metaData.baseClass);
      if (undefined === baseClass)
        return;

      assert.equal(baseClass.fullName, ViewDefinition3d.schemaItemKey.fullName);
      const prop = metaData.getPropertySync("modelSelector");
      assert.isDefined(prop);
      if (!prop?.isNavigation())
        assert.fail("Property is not navigation property");

      assert.equal((await prop.relationshipClass).fullName, "BisCore.SpatialViewDefinitionUsesModelSelector");
    }
  });

  it("should verify Entity metadata with both base class and mixin properties", async () => {
    const schemaPathname = path.join(KnownTestLocations.assetsDir, "TestDomain.dmschema.xml");
    await ivault.importSchemas([schemaPathname]); // will throw an exception if import fails

    const testDomain = await ivault.schemaContext.getSchema(new SchemaKey("TestDomain", 1, 0, 0));
    const testDomainClass = await testDomain!.getEntityClass("TestDomainClass");
    const baseClassFullNames = Array.from(testDomainClass!.getAllBaseClassesSync() ?? []).map(baseClass => baseClass.fullName);
    assert.equal(baseClassFullNames.length, 4);
    assert.equal(baseClassFullNames[0], DefinitionElement.schemaItemKey.fullName);
    assert.equal(baseClassFullNames[1], InformationContentElement.schemaItemKey.fullName);
    assert.equal(baseClassFullNames[2], Element.schemaItemKey.fullName);
    assert.equal(baseClassFullNames[3], "TestDomain.IMixin");

    // Verify that the forEach method which is called when constructing an entity
    // is picking up all expected properties.
    const properties = Array.from(await testDomainClass!.getProperties());
    const testData = properties.map(property => property.name);
    const expectedString = testData.find((testString: string) => {
      return testString === "TestMixinProperty";
    });

    assert.isDefined(expectedString);
  });
});

// --- Reproduction Test for Issue #8047 ---
describe("getDerivedClasses returns only loaded schemas", () => {
  const outputDir = path.join(__dirname, "output_8047");
  const ecdbPath = path.join(outputDir, "test_8047.dmdb");

  before(async () => {
    // Ensure IVaultHost is startup (idempotent check)
    if (!IVaultHost.isValid) {
      await TestUtils.startBackend();
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    if (fs.existsSync(ecdbPath)) {
      IVaultJsFs.unlinkSync(ecdbPath);
    }
  });

  after(async () => {
    if (fs.existsSync(outputDir)) {
      IVaultJsFs.removeSync(outputDir);
    }
  });

  it("should find derived classes in referencing schemas ONLY if referencing schema is loaded", async () => {
    const dmdb = new DMDb();
    dmdb.createDb(ecdbPath);

    // 1. Create Schema 1 (The Parent)
    const schemaXml1 = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema1" alias="Test1" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMEntityClass typeName="ParentClass" />
      </DMSchema>`;
    const schemaPath1 = path.join(outputDir, "TestSchema1.01.00.00.xml");
    fs.writeFileSync(schemaPath1, schemaXml1);
    dmdb.importSchema(schemaPath1);

    // 2. Create Schema 2 (The Child) - References Schema 1
    const schemaXml2 = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema2" alias="Test2" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="TestSchema1" version="01.00.00" alias="t1" />
        <DMEntityClass typeName="ChildClass">
          <BaseClass>t1:ParentClass</BaseClass>
        </DMEntityClass>
      </DMSchema>`;
    const schemaPath2 = path.join(outputDir, "TestSchema2.01.00.00.xml");
    fs.writeFileSync(schemaPath2, schemaXml2);
    dmdb.importSchema(schemaPath2);
    dmdb.saveChanges();

    // 3. Setup the Context
    const context = new SchemaContext();
    const locater = new SchemaJsonLocater((name: string) => dmdb.getSchemaProps(name));
    context.addLocater(locater);

    // 4. Get the Parent Class
    const testSchema1 = await context.getSchema(new SchemaKey("TestSchema1"), SchemaMatchType.Latest);
    if (!testSchema1) throw new Error("Failed to load TestSchema1");
    const parentClass = await testSchema1.getItem("ParentClass", EntityClass);
    if (!parentClass) throw new Error("Failed to load ParentClass");

    // TEST CASE A: Verify it returns 0 when Schema 2 is unloaded (Reproducing the "Bug")
    let derivedClasses = await parentClass.getDerivedClasses();
    const countUnloaded = derivedClasses ? derivedClasses.length : 0;
    assert.equal(countUnloaded, 0, "Should verify that 0 classes are found when referencing schema is unloaded");

    // TEST CASE B: Verify the workaround (Load Schema 2)
    await context.getSchema(new SchemaKey("TestSchema2"), SchemaMatchType.Latest);

    derivedClasses = await parentClass.getDerivedClasses();

    // This confirms the system works as intended IF you load the schema
    assert.isDefined(derivedClasses);
    assert.equal(derivedClasses!.length, 1, "Should find 1 derived class after referencing schema is loaded");
    assert.equal(derivedClasses![0].name, "ChildClass");

    dmdb.closeDb();
  });
});

