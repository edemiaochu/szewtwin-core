/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { Id64, Id64String } from "@szewtwin/core-szewec";
import { withEditTxn } from "../../EditTxn";
import {
  BriefcaseIdValue, Code, ColorDef, GeometricElementProps, IVault,
  SubCategoryAppearance,
} from "@szewtwin/core-common";
import { _nativeDb, IVaultDb, IVaultJsFs, SnapshotDb, SpatialCategory } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";

interface TestElement extends GeometricElementProps {
  addresses: [null, { city: "Pune", zip: 28 }];
}

function initElemProps(_iVaultName: IVaultDb, modId: Id64String, catId: Id64String, autoHandledProp: any): GeometricElementProps {
  // Create props
  const elementProps: GeometricElementProps = {
    classFullName: "Test:Foo",
    model: modId,
    category: catId,
    code: Code.createEmpty(),
  };
  if (autoHandledProp)
    Object.assign(elementProps, autoHandledProp);
  return elementProps;
}

describe("Insert Null elements in Struct Array, and ensure they are returned while querying rows", () => {
  const testSchema = `<?xml version="1.0" encoding="UTF-8"?>
  <DMSchema schemaName="Test" alias="test" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
  <DMSchemaReference name="BisCore" version="01.00.04" alias="bis"/>
  <DMStructClass typeName="Location" modifier="Sealed">
    <DMProperty propertyName="City" typeName="string"/>
    <DMProperty propertyName="Zip" typeName="int"/>
  </DMStructClass>
  <DMEntityClass typeName="Foo" modifier="Sealed">
  <BaseClass>bis:PhysicalElement</BaseClass>
    <DMArrayProperty propertyName="I_Array" typeName="int"/>
    <DMArrayProperty propertyName="Dt_Array" typeName="dateTime"/>
    <DMStructArrayProperty propertyName="Addresses" typeName="Location"/>
  </DMEntityClass>
  </DMSchema>`;

  const schemaFileName = "NullStructElementTest.01.00.00.xml";
  const iVaultFileName = "NullStructElementTest.dtw";
  const categoryName = "NullStructElement";
  const subDirName = "NullStructElement";
  const iVaultPath = IVaultTestUtils.prepareOutputFile(subDirName, iVaultFileName);

  before(async () => {
    // write schema to disk as we do not have api to import xml directly
    const testSchemaPath = IVaultTestUtils.prepareOutputFile(subDirName, schemaFileName);
    IVaultJsFs.writeFileSync(testSchemaPath, testSchema);

    const ivault = SnapshotDb.createEmpty(iVaultPath, { rootSubject: { name: "InsertNullStructArrayTest" } });
    await ivault.importSchemas([testSchemaPath]);
    await withEditTxn(ivault, async (txn) => {
      ivault[_nativeDb].resetBriefcaseId(BriefcaseIdValue.Unassigned);
      IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, Code.createEmpty(), true);

      const spatialCategoryId = SpatialCategory.queryCategoryIdByName(ivault, IVault.dictionaryId, categoryName);
      if (undefined === spatialCategoryId)
        SpatialCategory.insert(txn, IVault.dictionaryId, categoryName,
          new SubCategoryAppearance({ color: ColorDef.create("rgb(255,0,0)").toJSON() }));
    });
    ivault.close();
  });

  it("Test for struct array to contain null structs", async () => {
    const testFileName = IVaultTestUtils.prepareOutputFile(subDirName, "roundtrip_correct_data.dtw");
    const ivault = IVaultTestUtils.createSnapshotFromSeed(testFileName, iVaultPath);
    const spatialCategoryId = SpatialCategory.queryCategoryIdByName(ivault, IVault.dictionaryId, categoryName);
    const [, newModelId] = withEditTxn(ivault, (txn) => IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, Code.createEmpty(), true));

    // create element with auto handled properties
    const expectedValue = initElemProps(ivault, newModelId, spatialCategoryId!, {
      addresses: [null, { city: "Pune", zip: 28 }],
    }) as TestElement;

    // insert a element
    const geomElement = ivault.elements.createElement(expectedValue);
    const id = withEditTxn(ivault, (txn) => txn.insertElement(geomElement.toJSON()));
    assert.isTrue(Id64.isValidId64(id), "insert worked");

    // verify inserted element properties
    const actualValue = ivault.elements.getElementProps<TestElement>(id);
    expect(actualValue.addresses.length).to.equal(2);
    expect(actualValue.addresses[0]).to.be.empty;

    ivault.close();
  });

});
