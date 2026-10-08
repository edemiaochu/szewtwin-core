/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { convertDM2SchemasToDM3Schemas, DMDb, DMSqlStatement, upgradeCustomAttributesToDM3 } from "../core-backend";
import { KnownTestLocations } from "./KnownTestLocations";
import { DMDbTestHelper } from "./dmdb/DMDbTestHelper";
import { DbResult } from "@szewtwin/core-szewec";

describe("convertDM2Schemas", () => {
  it("verify namespace", () => {
    const dm2SchemaXml = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" version="1.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.2.0">
        <DMSchemaReference name="RefSchema" version="01.00" prefix="rs" />
        <DMClass typeName="TestEntityClass" isDomainClass="true" />
      </DMSchema>`;

    const dm2RefSchema = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="RefSchema" nameSpacePrefix="rs" version="1.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.2.0">
        <DMClass typeName="TestStructClass" isStruct="true" />
      </DMSchema>`;

    const dm3Schemas: string[] = convertDM2SchemasToDM3Schemas([dm2SchemaXml, dm2RefSchema]);
    assert.equal(dm3Schemas.length, 2);
    // converted DM3 schemas are in the same order as of input schemas
    const dm3SchemaXml = dm3Schemas[0];
    const dm3RefSchema = dm3Schemas[1];

    assert.isTrue(dm3SchemaXml.includes("http://www.szewec.com/schemas/Szewec.DMXML.3.2"));
    assert.isTrue(dm3RefSchema.includes("http://www.szewec.com/schemas/Szewec.DMXML.3.2"));
  });

  it("rename reserved words", async () => {
    const dm2SchemaXml = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" version="1.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.2.0">
        <DMClass typeName="TestEntityClass" isDomainClass="true">
          <DMProperty propertyName="Id" typeName="string" />
          <DMProperty propertyName="DMInstanceId" typeName="string" />
          <DMProperty propertyName="DMClassId" typeName="string" />
          <DMProperty propertyName="SourceDMInstanceId" typeName="string" />
          <DMProperty propertyName="SourceId" typeName="string" />
          <DMProperty propertyName="SourceDMClassId" typeName="string" />
          <DMProperty propertyName="TargetDMInstanceId" typeName="string" />
          <DMProperty propertyName="TargetId" typeName="string" />
          <DMProperty propertyName="TargetDMClassId" typeName="string" />
        </DMClass>
        <DMClass typeName="TestStructClass" isStruct="true">
          <DMProperty propertyName="Id" typeName="string" />
          <DMProperty propertyName="DMInstanceId" typeName="string" />
          <DMProperty propertyName="DMClassId" typeName="string" />
        </DMClass>
      </DMSchema>`;

    const dm3Schemas: string[] = convertDM2SchemasToDM3Schemas([dm2SchemaXml]);
    assert.equal(dm3Schemas.length, 1);
    const schemasWithUpdatedCA: string[] = upgradeCustomAttributesToDM3(dm3Schemas);
    assert.equal(schemasWithUpdatedCA.length, 1);

    const outDir = KnownTestLocations.outputDir;
    const db: DMDb = DMDbTestHelper.createDMDb(outDir, "RenameReservedWords.dmdb", schemasWithUpdatedCA[0]);
    assert.isTrue(db !== undefined);
    assert.isTrue(db.isOpen);

    const propNamesInEntityClass = [];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    let stmt: DMSqlStatement = db.prepareStatement("SELECT p.Name FROM meta.DMPropertyDef p JOIN meta.DMClassDef c USING meta.ClassOwnsLocalProperties JOIN meta.DMSchemaDef s USING meta.SchemaOwnsClasses WHERE s.Name='TestSchema' AND c.Name='TestEntityClass' ORDER BY p.Ordinal");
    let rowCount = 0;
    while (stmt.step() === DbResult.BE_SQLITE_ROW) {
      rowCount++;
      const row = stmt.getRow();
      propNamesInEntityClass.push(row.name);
    }
    stmt[Symbol.dispose]();
    assert.equal(rowCount, 9);

    assert.isFalse(propNamesInEntityClass.includes("Id"));  // The Id property is a reserved keyword and should have been renamed
    assert.isFalse(propNamesInEntityClass.includes("DMClassId")); // The DMClassId property is a reserved keyword and should have been renamed
    assert.isFalse(propNamesInEntityClass.includes("DMInstanceId"));  // The DMInstanceId property is a reserved keyword and should have been renamed
    assert.isTrue(propNamesInEntityClass.includes("TestSchema_Id_")); // The Id property is a reserved keyword and should have been renamed
    assert.isTrue(propNamesInEntityClass.includes("TestSchema_DMClassId_"));  // The DMClassId property is a reserved keyword and should have been renamed
    assert.isTrue(propNamesInEntityClass.includes("TestSchema_DMInstanceId_")); // The DMInstanceId property is a reserved keyword and should have been renamed
    assert.isTrue(propNamesInEntityClass.includes("SourceDMInstanceId")); // The SourceDMInstanceId property is allowed on Entity classes and should not be renamed
    assert.isTrue(propNamesInEntityClass.includes("SourceId")); // The SourceId property is allowed on Entity classes and should not be renamed
    assert.isTrue(propNamesInEntityClass.includes("SourceDMClassId"));  // The SourceDMClassId property is allowed on Entity classes and should not be renamed
    assert.isTrue(propNamesInEntityClass.includes("TargetDMInstanceId")); // The TargetDMInstanceId property is allowed on Entity classes and should not be renamed
    assert.isTrue(propNamesInEntityClass.includes("TargetId")); // The TargetId property is allowed on Entity classes and should not be renamed
    assert.isTrue(propNamesInEntityClass.includes("TargetDMClassId"));  // The TargetDMClassId property is allowed on Entity classes and should not be renamed

    const propNamesInStructClass = [];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    stmt = db.prepareStatement("SELECT p.Name FROM meta.DMPropertyDef p JOIN meta.DMClassDef c USING meta.ClassOwnsLocalProperties JOIN meta.DMSchemaDef s USING meta.SchemaOwnsClasses WHERE s.Name='TestSchema' AND c.Name='TestStructClass' ORDER BY p.Ordinal");
    rowCount = 0;
    while (stmt.step() === DbResult.BE_SQLITE_ROW) {
      rowCount++;
      const row = stmt.getRow();
      propNamesInStructClass.push(row.name);
    }
    stmt[Symbol.dispose]();
    assert.equal(rowCount, 3);

    assert.isTrue(propNamesInStructClass.includes("Id")); // The Id property is not a reserved keyword for Struct classes and should not be renamed
    assert.isTrue(propNamesInStructClass.includes("DMClassId"));  // The DMClassId property is not a reserved keyword for Struct classes and should not be renamed
    assert.isTrue(propNamesInStructClass.includes("DMInstanceId")); // The DMInstanceId property is not a reserved keyword for Struct classes and should not be renamed
    assert.isFalse(propNamesInStructClass.includes("TestSchema_Id_"));  // The Id property is not a reserved keyword for Struct classes and should not be renamed
    assert.isFalse(propNamesInStructClass.includes("TestSchema_DMClassId_")); // The DMClassId property is not a reserved keyword for Struct classes and should not be renamed
    assert.isFalse(propNamesInStructClass.includes("TestSchema_DMInstanceId_"));  // The DMInstanceId property is not a reserved keyword for Struct classes and should not be renamed
  });
});
