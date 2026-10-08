/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Guid, Id64String } from "@szewtwin/core-szewec";
import { BriefcaseDb } from "../IVaultDb";
import { HubWrappers, IVaultTestUtils } from "./IVaultTestUtils";
import { ChannelControl } from "../ChannelControl";
import { Code, GeometricElementProps, IVault, SubCategoryAppearance } from "@szewtwin/core-common";
import { DrawingCategory } from "../Category";
import { HubMock } from "../internal/HubMock";
import { KnownTestLocations } from "./KnownTestLocations";
import * as chai from "chai";
import { TestUtils } from "./TestUtils";
import { EditTxn, withEditTxn } from "../EditTxn";

const schemas = {
  /** Base schema v01.00.00 with classes A, C, D */
  v01x00x00: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.01 - Adds PropC2 to class C (trivial additive change) */
  v01x00x01AddPropC2: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.01" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC" typeName="string"/>
        <DMProperty propertyName="PropC2" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.02 - Adds PropD2 to class D (trivial additive change) */
  v01x00x02AddPropD2: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.02" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC" typeName="string"/>
        <DMProperty propertyName="PropC2" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
        <DMProperty propertyName="PropD2" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.02 - Moves PropC from C to A (requires data transformation) on top of v01.00.01 */
  v01x00x02MovePropCToA: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.02" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
        <DMProperty propertyName="PropC" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC2" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.03 - Builds on top of v01.00.02 and in addition moves PropD to base, so we can have incoming and local transforming changes */
  v01x00x03MovePropCAndD: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.03" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
        <DMProperty propertyName="PropC" typeName="string"/>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC2" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD2" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.01 (incompatible variant) - Adds PropC3 instead of PropC2 to class C (same version) */
  v01x00x01AddPropC3Incompatible: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.01" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC" typeName="string"/>
        <DMProperty propertyName="PropC3" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.02 (incompatible variant) - Adds PropC3 instead of PropC2 to class C (higher version) */
  v01x00x02AddPropC3Incompatible: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.02" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC" typeName="string"/>
        <DMProperty propertyName="PropC3" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,

  /** v01.00.02 (incompatible variant) - Adds PropC2 (higher version, different type) */
  v01x00x02AddPropC2Incompatible: `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="td" version="01.00.02" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      <DMSchemaReference name="BisCore" version="01.00.23" alias="bis"/>
      <DMEntityClass typeName="A">
        <BaseClass>bis:GraphicalElement2d</BaseClass>
        <DMProperty propertyName="PropA" typeName="string"/>
      </DMEntityClass>
      <DMEntityClass typeName="C">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropC" typeName="string"/>
        <DMProperty propertyName="PropC2" typeName="int"/>
      </DMEntityClass>
      <DMEntityClass typeName="D">
        <BaseClass>A</BaseClass>
        <DMProperty propertyName="PropD" typeName="string"/>
      </DMEntityClass>
    </DMSchema>`,
};

describe("SquashSchemaAndDataChanges", () => {
  let ivault: BriefcaseDb;
  let iVaultId: string;
  let drawingModelId: string;
  let drawingCategoryId: string;

  const createModelAndCategory = async (db: BriefcaseDb) => {
    const modelCode = IVaultTestUtils.getUniqueModelCode(db, "DrawingModel");
    await db.locks.acquireLocks({ shared: IVault.dictionaryId });
    return withEditTxn(db, (txn) => {
      const [, newDrawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, modelCode);
      const newDrawingCategoryId = DrawingCategory.insert(
        txn,
        IVault.dictionaryId,
        "DrawingCategory",
        new SubCategoryAppearance()
      );
      return [newDrawingModelId, newDrawingCategoryId] as const;
    });
  };

  const insertElement = (
    txn: EditTxn,
    className: string,
    properties: Record<string, any>
  ): Id64String => {
    const elementProps: GeometricElementProps = {
      classFullName: className,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      ...properties,
    };
    const element = txn.iVault.elements.createElement(elementProps);
    return txn.insertElement(element.toJSON());
  }

  before(async () => {
    HubMock.startup("MergeSchemaAndDataChanges", KnownTestLocations.outputDir);
    await TestUtils.shutdownBackend();
    await TestUtils.startBackend({ useSemanticRebase: true });
  });

  beforeEach(async () => {
    iVaultId = await HubWrappers.createIVault("user1", HubMock.szewTwinId, `Test-${Guid.createValue()}`);

    ivault = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId });

    ivault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    [drawingModelId, drawingCategoryId] = await createModelAndCategory(ivault);
    await ivault.importSchemaStrings([schemas.v01x00x00, schemas.v01x00x01AddPropC2]);
    await ivault.pushChanges({ description: "create model and category and imported schemas" });
  });

  afterEach(async () => {
    ivault.close();
    await HubMock.deleteIVault({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId });
  });

  after(async () => {
    HubMock.shutdown();
    await TestUtils.shutdownBackend();
    await TestUtils.startBackend(); // restart normal backend so subsequent test suites aren't left without IVaultHost
  });

  it("should allow schema import while an EditTxn is active", async () => {
    await ivault.locks.acquireLocks({ shared: drawingModelId });
    const txn = new EditTxn(ivault, "schema and data changes unsaved state");
    txn.start();
    try {
      txn.saveChanges("prepare for schema import");
      await ivault.importSchemaStrings([schemas.v01x00x02MovePropCToA]);
      chai.assert(ivault.containsClass("TestDomain:C"));
    } finally {
      if (txn.isActive)
        txn.end("abandon");
    }
  });

  it("should squash schema and data changes if useSemanticRebase flag is on", async () => {
    await ivault.locks.acquireLocks({ shared: drawingModelId });
    const txn = new EditTxn(ivault, "squash schema and data changes");
    txn.start();
    insertElement(txn, "TestDomain:C", {
      propA: "local_value_a",
      propC: "local_value_c",
    });
    txn.saveChanges("local data change");
    await ivault.importSchemaStrings([schemas.v01x00x02MovePropCToA]); // transforming data change

    const lastTxnProps = ivault.txns.getLastSavedTxnProps();
    chai.assert(lastTxnProps !== undefined);
    chai.assert(lastTxnProps?.type === "Schema");
    chai.assert(lastTxnProps?.prevId !== undefined);
    // both schema and data(migration) changes are merged into single txn

    const secondLastTxnProps = ivault.txns.getTxnProps(lastTxnProps.prevId);
    chai.assert(secondLastTxnProps !== undefined);
    chai.assert(secondLastTxnProps?.type === "Ddl");
    chai.assert(secondLastTxnProps?.prevId !== undefined);

    const thirdLastTxnProps = ivault.txns.getTxnProps(secondLastTxnProps.prevId);
    chai.assert(thirdLastTxnProps !== undefined);
    chai.assert(thirdLastTxnProps?.type === "Data");
    chai.assert(thirdLastTxnProps?.prevId === undefined);

    if (txn.isActive)
      txn.end("abandon");
  });
});
