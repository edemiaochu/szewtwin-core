/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, GuidString, Id64, Id64String } from "@szewtwin/core-szewec";
import { Code, ColorDef, GeometryStreamProps, IVault, QueryBinder, QueryRowFormat, SubCategoryAppearance } from "@szewtwin/core-common";
import { Arc3d, IVaultJson, Point3d } from "@szewtwin/core-geometry";
import * as chai from "chai";
import { assert, expect } from "chai";
import * as path from "node:path";
import { DrawingCategory } from "../../Category";
import { ChangedDMInstance, ChangesetDMAdaptor, ChangesetDMAdaptor as DMChangesetAdaptor, DMChangeUnifierCache, PartialDMChangeUnifier } from "../../ChangesetDMAdaptor";
import { _nativeDb, ChannelControl, GraphicalElement2d, Subject, SubjectOwnsSubjects } from "../../core-backend";
import { BriefcaseDb, SnapshotDb } from "../../IVaultDb";
import { HubMock } from "../../internal/HubMock";
import { SqliteChangeOp, SqliteChangesetReader } from "../../SqliteChangesetReader";
import { HubWrappers, IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { EditTxn } from "../../EditTxn";

/* eslint-disable @typescript-eslint/no-deprecated */ // This test file will be removed subsequently, so we can allow usage of deprecated APIs within it.
// This test file also contains tests outside of the ChangesetDMAdaptor, so be cautious while removing it, remove just the tests which are related to ChangesetDMAdaptor.

function startTestTxn(iVault: BriefcaseDb | SnapshotDb, description = "changeset reader"): EditTxn {
  const txn = new EditTxn(iVault, description);
  txn.start();
  return txn;
}

async function importSchemaStrings(txn: EditTxn, schemas: string[]): Promise<void> {
  if (txn.isActive)
    txn.saveChanges();
  await txn.iVault.importSchemaStrings(schemas);
}

describe("Sqlite Changeset Reader + ChangesetDMAdaptor API", async () => {
  let szewTwinId: GuidString;

  before(() => {
    HubMock.startup("SqliteChangesetReaderAndChangesetDMAdaptorTest", KnownTestLocations.outputDir);
    szewTwinId = HubMock.szewTwinId;
  });
  after(() => HubMock.shutdown());
  it("Able to recover from when ExclusiveRootClassId is NULL for overflow table", async () => {
    /**
     * 1. Import schema with class that span overflow table.
     * 2. Insert a element for the class.
     * 3. Push changes to hub.
     * 4. Update the element.
     * 5. Push changes to hub.
     * 6. Delete the element.
     * 7. Set ExclusiveRootClassId to NULL for overflow table. (Simulate the issue)
     * 8. DMChangesetAdaptor should be able to read the changeset 2 in which element is updated against latest ivault where element is deleted.
     */
    const adminToken = "super manager token";
    const iVaultName = "test";
    const nProps = 36;
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const txn = startTestTxn(rwIVault, "recover overflow table changeset reader");
    // 1. Import schema with class that span overflow table.
    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            ${Array(nProps).fill(undefined).map((_, i) => `<DMProperty propertyName="p${i}" typeName="string"/>`).join("\n")}
        </DMEntityClass>
    </DMSchema>`;
    await importSchemaStrings(txn, [schema]);
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // Create drawing model and category
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(txn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    // Insert element with 100 properties
    const geomArray: Arc3d[] = [
      Arc3d.createXY(Point3d.create(0, 0), 5),
      Arc3d.createXY(Point3d.create(5, 5), 2),
      Arc3d.createXY(Point3d.create(-5, -5), 20),
    ];
    const geometryStream: GeometryStreamProps = [];
    for (const geom of geomArray) {
      const arcData = IVaultJson.Writer.toIVaultJson(geom);
      geometryStream.push(arcData);
    }
    const props = Array(nProps).fill(undefined).map((_, i) => {
      return { [`p${i}`]: `test_${i}` };
    }).reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});

    const geomElement = {
      classFullName: `TestDomain:Test2dElement`,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      geom: geometryStream,
      ...props,
    };

    // 2. Insert a element for the class.
    const id = txn.insertElement(geomElement);
    assert.isTrue(Id64.isValidId64(id), "insert worked");
    txn.saveChanges();

    // 3. Push changes to hub.
    await rwIVault.pushChanges({ description: "insert element", accessToken: adminToken });

    // 4. Update the element.
    const updatedElementProps = Object.assign(
      rwIVault.elements.getElementProps(id),
      Array(nProps).fill(undefined).map((_, i) => {
        return { [`p${i}`]: `updated_${i}` };
      }).reduce((acc, curr) => {
        return { ...acc, ...curr };
      }, {}));

    await rwIVault.locks.acquireLocks({ exclusive: id });
    txn.updateElement(updatedElementProps);
    txn.saveChanges();

    // 5. Push changes to hub.
    await rwIVault.pushChanges({ description: "update element", accessToken: adminToken });

    await rwIVault.locks.acquireLocks({ exclusive: id });

    // 6. Delete the element.
    txn.deleteElement(id);
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "delete element", accessToken: adminToken });

    const targetDir = path.join(KnownTestLocations.outputDir, rwIVaultId, "changesets");
    const changesets = await HubMock.downloadChangesets({ iVaultId: rwIVaultId, targetDir });
    const reader = SqliteChangesetReader.openFile({ fileName: changesets[1].pathname, db: rwIVault, disableSchemaCheck: true });

    // Set ExclusiveRootClassId to NULL for overflow table to simulate the issue
    expect(rwIVault[_nativeDb].executeSql("UPDATE dm_Table SET ExclusiveRootClassId=NULL WHERE Name='bis_GeometricElement2d_Overflow'")).to.be.eq(DbResult.BE_SQLITE_OK);

    const adaptor = new DMChangesetAdaptor(reader);
    let assertOnOverflowTable = false;
    const classId = getClassIdByName(rwIVault, "GeometricElement2d");

    while (adaptor.step()) {
      if (adaptor.op === "Updated" && adaptor.inserted?.$meta?.tables[0] === "bis_GeometricElement2d_Overflow") {

        assert.isUndefined(adaptor.inserted.DMClassId);
        assert.equal(adaptor.inserted.DMInstanceId, "");
        assert.deepEqual(adaptor.inserted.$meta?.tables, ["bis_GeometricElement2d_Overflow"]);
        assert.equal(adaptor.inserted.$meta?.op, "Updated");
        assert.equal(adaptor.inserted.$meta?.classFullName, "BisCore:GeometricElement2d");
        assert.equal(adaptor.inserted.$meta.fallbackClassId, classId);
        assert.deepEqual(adaptor.inserted.$meta?.changeIndexes, [3]);
        assert.equal(adaptor.inserted.$meta?.stage, "New");

        assert.equal(adaptor.deleted!.DMInstanceId, "");
        assert.isUndefined(adaptor.deleted!.DMClassId);
        assert.deepEqual(adaptor.deleted!.$meta?.tables, ["bis_GeometricElement2d_Overflow"]);
        assert.equal(adaptor.deleted!.$meta?.op, "Updated");
        assert.equal(adaptor.deleted!.$meta?.classFullName, "BisCore:GeometricElement2d");
        assert.equal(adaptor.deleted!.$meta!.fallbackClassId, classId);
        assert.deepEqual(adaptor.deleted!.$meta?.changeIndexes, [3]);
        assert.equal(adaptor.deleted!.$meta?.stage, "Old");

        assertOnOverflowTable = true;
      }
    }

    assert.isTrue(assertOnOverflowTable);
    txn.end();
    rwIVault.close();
  });

  function getClassIdByName(iVault: BriefcaseDb, className: string): Id64String {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return iVault.withPreparedStatement(`SELECT DMInstanceId from meta.DMClassDef where Name=?`, (stmt) => {
      stmt.bindString(1, className);
      assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
      return stmt.getValue(0).getId();
    });
  }

  async function getClassNameById(iVault: BriefcaseDb, classId: string): Promise<string | undefined> {
    const reader = iVault.createQueryReader(`select dm_classname(${classId});`);

    if (await reader.step())
      return reader.current[0] as string;

    return undefined;
  }

  it("Changeset reader / DM adaptor", async () => {
    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const txn = startTestTxn(rwIVault, "changeset reader DM adaptor");

    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="s" typeName="string"/>
        </DMEntityClass>
    </DMSchema>`;
    await importSchemaStrings(txn, [schema]);
    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ description: "push schema changeset", accessToken: adminToken });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
      rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    }
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    let totalEl = 0;
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(txn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    txn.saveChanges("user 1: create drawing partition");
    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ description: "user 1: create drawing partition", accessToken: adminToken });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
    }

    await rwIVault.locks.acquireLocks({ shared: drawingModelId });
    const insertElements = (className: string = "Test2dElement", noOfElements: number = 10, userProp: (n: number) => object) => {
      for (let m = 0; m < noOfElements; ++m) {
        const geomArray: Arc3d[] = [
          Arc3d.createXY(Point3d.create(0, 0), 5),
          Arc3d.createXY(Point3d.create(5, 5), 2),
          Arc3d.createXY(Point3d.create(-5, -5), 20),
        ];
        const geometryStream: GeometryStreamProps = [];
        for (const geom of geomArray) {
          const arcData = IVaultJson.Writer.toIVaultJson(geom);
          geometryStream.push(arcData);
        }
        const prop = userProp(++totalEl);
        // Create props
        const geomElement = {
          classFullName: `TestDomain:${className}`,
          model: drawingModelId,
          category: drawingCategoryId,
          code: Code.createEmpty(),
          geom: geometryStream,
          ...prop,
        };
        const id = txn.insertElement(geomElement);
        assert.isTrue(Id64.isValidId64(id), "insert worked");
      }
    };
    const generatedStr = new Array(10).join("x");
    insertElements("Test2dElement", 1, () => {
      return { s: generatedStr };
    });

    const updatedElements = async () => {
      await rwIVault.locks.acquireLocks({ exclusive: "0x20000000004" });
      const updatedElement = rwIVault.elements.getElementProps("0x20000000004");
      (updatedElement as any).s = "updated property";
      txn.updateElement(updatedElement);
      txn.saveChanges("user 1: updated data");
      await rwIVault.pushChanges({ description: "user 1: update property id=0x20000000004", accessToken: adminToken });
    };

    txn.saveChanges("user 1: data");

    if (true || "test local changes") {
      const testChanges = async (changes: ChangedDMInstance[]) => {
        assert.equal(changes.length, 3);

        assert.equal(changes[0].DMInstanceId, "0x20000000001");
        assert.equal(changes[0].$meta?.classFullName, "BisCore:DrawingModel");
        assert.equal(changes[0].$meta?.op, "Updated");
        assert.equal(changes[0].$meta?.stage, "New");
        assert.isNotNull(changes[0].LastMod);
        assert.isNotNull(changes[0].GeometryGuid);

        assert.equal(changes[1].DMInstanceId, "0x20000000001");
        assert.equal(changes[1].$meta?.classFullName, "BisCore:DrawingModel");
        assert.equal(changes[1].$meta?.op, "Updated");
        assert.equal(changes[1].$meta?.stage, "Old");
        assert.isNull(changes[1].LastMod);
        assert.isNull(changes[1].GeometryGuid);

        assert.equal(changes[2].DMInstanceId, "0x20000000004");
        assert.equal(changes[2].$meta?.classFullName, "TestDomain:Test2dElement");
        assert.equal(changes[2].$meta?.op, "Inserted");
        assert.equal(changes[2].$meta?.stage, "New");

        const el = changes.filter((x) => x.DMInstanceId === "0x20000000004")[0];
        assert.equal(el.Rotation, 0);
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.Origin, { X: 0, Y: 0 });
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.BBoxLow, { X: -25, Y: -25 });
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.BBoxHigh, { X: 15, Y: 15 });

        assert.equal(el.Category.Id, "0x20000000002");
        assert.isNotEmpty(el.Category.RelDMClassId);

        const categoryRelClass = await getClassNameById(rwIVault, el.Category.RelDMClassId);
        assert.equal("BisCore:GeometricElement2dIsInCategory", categoryRelClass);
        assert.equal(el.s, "xxxxxxxxx");
        assert.isNull(el.CodeValue);
        assert.isNull(el.UserLabel);
        assert.isNull(el.JsonProperties);
        assert.instanceOf(el.GeometryStream, Uint8Array);
        assert.typeOf(el.FederationGuid, "string");
        assert.typeOf(el.LastMod, "string");
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.Parent, { Id: null, RelDMClassId: null });
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.TypeDefinition, { Id: null, RelDMClassId: null });

        assert.equal(el.CodeSpec.Id, "0x1");
        assert.isNotEmpty(el.CodeSpec.RelDMClassId);

        const codeSpecRelClass = await getClassNameById(rwIVault, el.CodeSpec.RelDMClassId);
        assert.equal("BisCore:CodeSpecSpecifiesCode", codeSpecRelClass);

        assert.equal(el.CodeScope.Id, "0x1");
        assert.isNotEmpty(el.CodeScope.RelDMClassId);

        const codeScopeRelClass = await getClassNameById(rwIVault, el.CodeScope.RelDMClassId);
        assert.equal("BisCore:ElementScopesCode", codeScopeRelClass);

        assert.deepEqual(el.$meta, {
          tables: [
            "bis_GeometricElement2d",
            "bis_Element",
          ],
          op: "Inserted",
          classFullName: "TestDomain:Test2dElement",
          changeIndexes: [
            2,
            1,
          ],
          stage: "New",
        });
      }

      if (true || "test with InMemoryInstanceCache") {
        using reader = SqliteChangesetReader.openLocalChanges({ db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createInMemoryCache());
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        await testChanges(Array.from(pcu.instances));
      }

      if (true || "test with SqliteBackedInstanceCache") {
        using reader = SqliteChangesetReader.openLocalChanges({ db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createSqliteBackedCache(rwIVault));
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        await testChanges(Array.from(pcu.instances));
      }
    }

    const targetDir = path.join(KnownTestLocations.outputDir, rwIVaultId, "changesets");
    await rwIVault.pushChanges({ description: "schema changeset", accessToken: adminToken });

    await updatedElements();

    const changesets = await HubMock.downloadChangesets({ iVaultId: rwIVaultId, targetDir });
    if (true || "updated element") {
      const testChanges = (changes: ChangedDMInstance[]) => {
        assert.equal(changes.length, 4);

        const classId: Id64String = getClassIdByName(rwIVault, "Test2dElement");

        // new value
        assert.equal(changes[2].DMInstanceId, "0x20000000004");
        assert.equal(changes[2].DMClassId, classId);
        assert.equal(changes[2].s, "updated property");
        assert.equal(changes[2].$meta?.classFullName, "TestDomain:Test2dElement");
        assert.equal(changes[2].$meta?.op, "Updated");
        assert.equal(changes[2].$meta?.stage, "New");

        // old value
        assert.equal(changes[3].DMInstanceId, "0x20000000004");
        assert.equal(changes[3].DMClassId, classId);
        assert.equal(changes[3].s, "xxxxxxxxx");
        assert.equal(changes[3].$meta?.classFullName, "TestDomain:Test2dElement");
        assert.equal(changes[3].$meta?.op, "Updated");
        assert.equal(changes[3].$meta?.stage, "Old");
      };

      if (true || "test with InMemoryInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[3].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createInMemoryCache());
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }

      if (true || "test with SqliteBackedInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[3].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createSqliteBackedCache(rwIVault));
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }
    }

    if (true || "updated element when no classId") {
      const otherDb = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("test.dtw"));
      const testChanges = (changes: ChangedDMInstance[]) => {
        assert.equal(changes.length, 4);

        // new value
        assert.equal(changes[2].DMInstanceId, "0x20000000004");
        assert.isUndefined(changes[2].DMClassId);
        assert.isDefined(changes[2].$meta?.fallbackClassId);
        assert.equal(changes[2].$meta?.fallbackClassId, "0x3d");
        assert.isUndefined(changes[2].s);
        assert.equal(changes[2].$meta?.classFullName, "BisCore:GeometricElement2d");
        assert.equal(changes[2].$meta?.op, "Updated");
        assert.equal(changes[2].$meta?.stage, "New");

        // old value
        assert.equal(changes[3].DMInstanceId, "0x20000000004");
        assert.isUndefined(changes[3].DMClassId);
        assert.isDefined(changes[3].$meta?.fallbackClassId);
        assert.equal(changes[3].$meta?.fallbackClassId, "0x3d");
        assert.isUndefined(changes[3].s);
        assert.equal(changes[3].$meta?.classFullName, "BisCore:GeometricElement2d");
        assert.equal(changes[3].$meta?.op, "Updated");
        assert.equal(changes[3].$meta?.stage, "Old");
      };

      if (true || "test with InMemoryInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[3].pathname, db: otherDb, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createInMemoryCache());
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }

      if (true || "test with SqliteBackedInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[3].pathname, db: otherDb, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createSqliteBackedCache(rwIVault));
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }
    }

    if (true || "test changeset file") {
      const testChanges = async (changes: ChangedDMInstance[]) => {
        assert.equal(changes.length, 3);

        assert.equal(changes[0].DMInstanceId, "0x20000000001");
        assert.equal(changes[0].$meta?.classFullName, "BisCore:DrawingModel");
        assert.equal(changes[0].$meta?.op, "Updated");
        assert.equal(changes[0].$meta?.stage, "New");
        assert.isNotNull(changes[0].LastMod);
        assert.isNotNull(changes[0].GeometryGuid);

        assert.equal(changes[1].DMInstanceId, "0x20000000001");
        assert.equal(changes[1].$meta?.classFullName, "BisCore:DrawingModel");
        assert.equal(changes[1].$meta?.op, "Updated");
        assert.equal(changes[1].$meta?.stage, "Old");
        assert.isNull(changes[1].LastMod);
        assert.isNull(changes[1].GeometryGuid);

        assert.equal(changes[2].DMInstanceId, "0x20000000004");
        assert.equal(changes[2].$meta?.classFullName, "TestDomain:Test2dElement");
        assert.equal(changes[2].$meta?.op, "Inserted");
        assert.equal(changes[2].$meta?.stage, "New");

        const el = changes.filter((x) => x.DMInstanceId === "0x20000000004")[0];
        assert.equal(el.Rotation, 0);
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.Origin, { X: 0, Y: 0 });
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.BBoxLow, { X: -25, Y: -25 });
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.BBoxHigh, { X: 15, Y: 15 });

        assert.equal(el.Category.Id, "0x20000000002");
        assert.isNotEmpty(el.Category.RelDMClassId);

        const categoryRelClass = await getClassNameById(rwIVault, el.Category.RelDMClassId);
        assert.equal("BisCore:GeometricElement2dIsInCategory", categoryRelClass);
        assert.equal(el.s, "xxxxxxxxx");
        assert.isNull(el.CodeValue);
        assert.isNull(el.UserLabel);
        assert.isNull(el.JsonProperties);
        assert.instanceOf(el.GeometryStream, Uint8Array);
        assert.typeOf(el.FederationGuid, "string");
        assert.typeOf(el.LastMod, "string");
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.Parent, { Id: null, RelDMClassId: null });
        // eslint-disable-next-line @typescript-eslint/naming-convention
        assert.deepEqual(el.TypeDefinition, { Id: null, RelDMClassId: null });

        assert.equal(el.CodeSpec.Id, "0x1");
        assert.isNotEmpty(el.CodeSpec.RelDMClassId);

        const codeSpecRelClass = await getClassNameById(rwIVault, el.CodeSpec.RelDMClassId);
        assert.equal("BisCore:CodeSpecSpecifiesCode", codeSpecRelClass);

        assert.equal(el.CodeScope.Id, "0x1");
        assert.isNotEmpty(el.CodeScope.RelDMClassId);

        const codeScopeRelClass = await getClassNameById(rwIVault, el.CodeScope.RelDMClassId);
        assert.equal("BisCore:ElementScopesCode", codeScopeRelClass);

        assert.deepEqual(el.$meta, {
          tables: [
            "bis_GeometricElement2d",
            "bis_Element",
          ],
          op: "Inserted",
          classFullName: "TestDomain:Test2dElement",
          changeIndexes: [
            2,
            1,
          ],
          stage: "New",
        });
      }
      if (true || "test with InMemoryInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[2].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createInMemoryCache());
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        await testChanges(Array.from(pcu.instances));
      }

      if (true || "test with SqliteBackedInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[2].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createSqliteBackedCache(rwIVault));
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        await testChanges(Array.from(pcu.instances));
      }
    }
    if (true || "test ChangesetAdaptor.acceptClass()") {
      const testChanges = (changes: ChangedDMInstance[]) => {
        assert.equal(changes.length, 1);
        assert.equal(changes[0].$meta?.classFullName, "TestDomain:Test2dElement");
      };
      if (true || "test with InMemoryInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[2].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        adaptor.acceptClass("TestDomain.Test2dElement");
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createInMemoryCache());
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }

      if (true || "test with SqliteBackedInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[2].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        adaptor.acceptClass("TestDomain.Test2dElement");
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createSqliteBackedCache(rwIVault));
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }
    }
    if (true || "test ChangesetAdaptor.adaptor()") {
      const testChanges = (changes: ChangedDMInstance[]) => {
        assert.equal(changes.length, 2);
        assert.equal(changes[0].DMInstanceId, "0x20000000001");
        assert.equal(changes[0].$meta?.classFullName, "BisCore:DrawingModel");
        assert.equal(changes[0].$meta?.op, "Updated");
        assert.equal(changes[0].$meta?.stage, "New");
        assert.equal(changes[1].DMInstanceId, "0x20000000001");
        assert.equal(changes[1].$meta?.classFullName, "BisCore:DrawingModel");
        assert.equal(changes[1].$meta?.op, "Updated");
        assert.equal(changes[1].$meta?.stage, "Old");
      };
      if (true || "test with InMemoryInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[2].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        adaptor.acceptOp("Updated")
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createInMemoryCache());
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }

      if (true || "test with SqliteBackedInstanceCache") {
        using reader = SqliteChangesetReader.openFile({ fileName: changesets[2].pathname, db: rwIVault, disableSchemaCheck: true });
        using adaptor = new DMChangesetAdaptor(reader);
        adaptor.acceptOp("Updated")
        using pcu = new PartialDMChangeUnifier(reader.db, DMChangeUnifierCache.createSqliteBackedCache(rwIVault));
        while (adaptor.step()) {
          pcu.appendFrom(adaptor);
        }
        testChanges(Array.from(pcu.instances));
      }
    }
    txn.end();
    rwIVault.close();
  });
  it("revert timeline changes", async () => {
    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const txn = startTestTxn(rwIVault, "revert timeline changes");
    let nProps = 0;
    // 1. Import schema with class that span overflow table.
    const addPropertyAndImportSchema = async () => {
      await rwIVault.acquireSchemaLock();
      ++nProps;
      const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00.${nProps}" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            ${Array(nProps).fill(undefined).map((_, i) => `<DMProperty propertyName="p${i + 1}" typeName="string"/>`).join("\n")}
        </DMEntityClass>
    </DMSchema>`;
      await importSchemaStrings(txn, [schema]);
    };
    await addPropertyAndImportSchema();
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // Create drawing model and category
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(txn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    txn.saveChanges();
    await rwIVault.pushChanges({ description: "setup category", accessToken: adminToken });

    const createEl = async (args: { [key: string]: any }) => {
      await rwIVault.locks.acquireLocks({ exclusive: drawingModelId });
      const geomArray: Arc3d[] = [
        Arc3d.createXY(Point3d.create(0, 0), 5),
        Arc3d.createXY(Point3d.create(5, 5), 2),
        Arc3d.createXY(Point3d.create(-5, -5), 20),
      ];

      const geometryStream: GeometryStreamProps = [];
      for (const geom of geomArray) {
        const arcData = IVaultJson.Writer.toIVaultJson(geom);
        geometryStream.push(arcData);
      }

      const e1 = {
        classFullName: `TestDomain:Test2dElement`,
        model: drawingModelId,
        category: drawingCategoryId,
        code: Code.createEmpty(),
        geom: geometryStream,
        ...args,
      };
      return txn.insertElement(e1);;
    };
    const updateEl = async (id: Id64String, args: { [key: string]: any }) => {
      await rwIVault.locks.acquireLocks({ exclusive: id });
      const updatedElementProps = Object.assign(rwIVault.elements.getElementProps(id), args);
      txn.updateElement(updatedElementProps);
    };

    const deleteEl = async (id: Id64String) => {
      await rwIVault.locks.acquireLocks({ exclusive: id });
      txn.deleteElement(id);
    };
    const getChanges = async () => {
      return HubMock.downloadChangesets({ iVaultId: rwIVaultId, targetDir: path.join(KnownTestLocations.outputDir, rwIVaultId, "changesets") });
    };

    const findEl = (id: Id64String) => {
      try {
        return rwIVault.elements.getElementProps(id);
      } catch {
        return undefined;
      }
    };
    // 2. Insert a element for the class
    const el1 = await createEl({ p1: "test1" });
    const el2 = await createEl({ p1: "test2" });
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "insert 2 elements" });

    // 3. Update the element.
    await updateEl(el1, { p1: "test3" });
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "update element 1" });

    // 4. Delete the element.
    await deleteEl(el2);
    const el3 = await createEl({ p1: "test4" });
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "delete element 2" });

    // 5. import schema and insert element 4 & update element 3
    await addPropertyAndImportSchema();
    const el4 = await createEl({ p1: "test5", p2: "test6" });
    await updateEl(el3, { p1: "test7", p2: "test8" });
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "import schema, insert element 4 & update element 3" });

    assert.isDefined(findEl(el1));
    assert.isUndefined(findEl(el2));
    assert.isDefined(findEl(el3));
    assert.isDefined(findEl(el4));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.deepEqual(Object.getOwnPropertyNames(rwIVault.getMetaData("TestDomain:Test2dElement").properties), ["p1", "p2"]);
    // 6. Revert to timeline 2
    await rwIVault.revertAndPushChanges({ toIndex: 2, description: "revert to timeline 2" });
    assert.equal((await getChanges()).at(-1)!.description, "revert to timeline 2");

    assert.isUndefined(findEl(el1));
    assert.isUndefined(findEl(el2));
    assert.isUndefined(findEl(el3));
    assert.isUndefined(findEl(el4));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.deepEqual(Object.getOwnPropertyNames(rwIVault.getMetaData("TestDomain:Test2dElement").properties), ["p1"]);

    await rwIVault.revertAndPushChanges({ toIndex: 6, description: "reinstate last reverted changeset" });
    assert.equal((await getChanges()).at(-1)!.description, "reinstate last reverted changeset");
    assert.isDefined(findEl(el1));
    assert.isUndefined(findEl(el2));
    assert.isDefined(findEl(el3));
    assert.isDefined(findEl(el4));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.deepEqual(Object.getOwnPropertyNames(rwIVault.getMetaData("TestDomain:Test2dElement").properties), ["p1", "p2"]);

    await addPropertyAndImportSchema();
    const el5 = await createEl({ p1: "test9", p2: "test10", p3: "test11" });
    await updateEl(el1, { p1: "test12", p2: "test13", p3: "test114" });
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "import schema, insert element 5 & update element 1" });
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.deepEqual(Object.getOwnPropertyNames(rwIVault.getMetaData("TestDomain:Test2dElement").properties), ["p1", "p2", "p3"]);

    // skip schema changes & auto generated comment
    await rwIVault.revertAndPushChanges({ toIndex: 1, skipSchemaChanges: true });
    assert.equal((await getChanges()).at(-1)!.description, "Reverted changes from 8 to 1 (schema changes skipped)");
    assert.isUndefined(findEl(el1));
    assert.isUndefined(findEl(el2));
    assert.isUndefined(findEl(el3));
    assert.isUndefined(findEl(el4));
    assert.isUndefined(findEl(el5));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.deepEqual(Object.getOwnPropertyNames(rwIVault.getMetaData("TestDomain:Test2dElement").properties), ["p1", "p2", "p3"]);

    await rwIVault.revertAndPushChanges({ toIndex: 9 });
    assert.equal((await getChanges()).at(-1)!.description, "Reverted changes from 9 to 9");
    assert.isDefined(findEl(el1));
    assert.isUndefined(findEl(el2));
    assert.isDefined(findEl(el3));
    assert.isDefined(findEl(el4));
    assert.isDefined(findEl(el5));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.deepEqual(Object.getOwnPropertyNames(rwIVault.getMetaData("TestDomain:Test2dElement").properties), ["p1", "p2", "p3"]);
    txn.end();
    rwIVault.close();
  });
  it("openGroup() & writeToFile()", async () => {
    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const txn = startTestTxn(rwIVault, "openGroup writeToFile");
    // 1. Import schema with class that span overflow table.
    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="p1" typeName="string"/>
        </DMEntityClass>
    </DMSchema>`;
    await importSchemaStrings(txn, [schema]);
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // Create drawing model and category
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(txn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    txn.saveChanges();
    await rwIVault.pushChanges({ description: "setup category", accessToken: adminToken });
    const geomArray: Arc3d[] = [
      Arc3d.createXY(Point3d.create(0, 0), 5),
      Arc3d.createXY(Point3d.create(5, 5), 2),
      Arc3d.createXY(Point3d.create(-5, -5), 20),
    ];

    const geometryStream: GeometryStreamProps = [];
    for (const geom of geomArray) {
      const arcData = IVaultJson.Writer.toIVaultJson(geom);
      geometryStream.push(arcData);
    }

    const e1 = {
      classFullName: `TestDomain:Test2dElement`,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      geom: geometryStream,
      ...{ p1: "test1" },
    };

    // 2. Insert a element for the class
    await rwIVault.locks.acquireLocks({ shared: drawingModelId });
    const e1id = txn.insertElement(e1);
    assert.isTrue(Id64.isValidId64(e1id), "insert worked");
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "insert element", accessToken: adminToken });

    // 3. Update the element.
    const updatedElementProps = Object.assign(rwIVault.elements.getElementProps(e1id), { p1: "test2" });
    await rwIVault.locks.acquireLocks({ exclusive: e1id });
    txn.updateElement(updatedElementProps);
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "update element", accessToken: adminToken });

    // 4. Delete the element.
    await rwIVault.locks.acquireLocks({ exclusive: e1id });
    txn.deleteElement(e1id);
    txn.saveChanges();
    await rwIVault.pushChanges({ description: "delete element", accessToken: adminToken });

    const targetDir = path.join(KnownTestLocations.outputDir, rwIVaultId, "changesets");
    const changesets = (await HubMock.downloadChangesets({ iVaultId: rwIVaultId, targetDir })).slice(1);

    const testElementClassId: Id64String = getClassIdByName(rwIVault, "Test2dElement");
    const drawingModelClassId: Id64String = getClassIdByName(rwIVault, "DrawingModel");

    if (true || "Grouping changeset [2,3,4] should not contain TestDomain:Test2dElement as insert+update+delete=noop") {
      const reader = SqliteChangesetReader.openGroup({ changesetFiles: changesets.map((c) => c.pathname), db: rwIVault, disableSchemaCheck: true });
      const adaptor = new DMChangesetAdaptor(reader);
      const instances: ({ id: string, classId?: string, op: SqliteChangeOp, classFullName?: string })[] = [];
      while (adaptor.step()) {
        if (adaptor.inserted) {
          instances.push({ id: adaptor.inserted?.DMInstanceId, classId: adaptor.inserted.DMClassId, op: adaptor.op, classFullName: adaptor.inserted.$meta?.classFullName });
        } else if (adaptor.deleted) {
          instances.push({ id: adaptor.deleted?.DMInstanceId, classId: adaptor.deleted.DMClassId, op: adaptor.op, classFullName: adaptor.deleted.$meta?.classFullName });
        }
      }

      expect(instances.length).to.eq(1);
      expect(instances[0].id).to.eq("0x20000000001");
      expect(instances[0].classId).to.eq(drawingModelClassId);
      expect(instances[0].op).to.eq("Updated");
      expect(instances[0].classFullName).to.eq("BisCore:DrawingModel");
    }

    if (true || "Grouping changeset [3,4] should contain update+delete=delete TestDomain:Test2dElement") {
      const reader = SqliteChangesetReader.openGroup({ changesetFiles: changesets.slice(1).map((c) => c.pathname), db: rwIVault, disableSchemaCheck: true });
      const adaptor = new DMChangesetAdaptor(reader);
      const instances: ({ id: string, classId?: string, op: SqliteChangeOp, classFullName?: string })[] = [];
      while (adaptor.step()) {
        if (adaptor.inserted) {
          instances.push({ id: adaptor.inserted?.DMInstanceId, classId: adaptor.inserted.DMClassId, op: adaptor.op, classFullName: adaptor.inserted.$meta?.classFullName });
        } else if (adaptor.deleted) {
          instances.push({ id: adaptor.deleted?.DMInstanceId, classId: adaptor.deleted.DMClassId, op: adaptor.op, classFullName: adaptor.deleted.$meta?.classFullName });
        }
      }
      expect(instances.length).to.eq(3);
      expect(instances[0]).deep.eq({
        id: "0x20000000004",
        classId: testElementClassId,
        op: "Deleted",
        classFullName: "TestDomain:Test2dElement",
      });
      expect(instances[1]).deep.eq({
        id: "0x20000000004",
        classId: testElementClassId,
        op: "Deleted",
        classFullName: "TestDomain:Test2dElement",
      });
      expect(instances[2]).deep.eq({
        id: "0x20000000001",
        classId: drawingModelClassId,
        op: "Updated",
        classFullName: "BisCore:DrawingModel",
      });
    }

    const groupCsFile = path.join(KnownTestLocations.outputDir, "changeset_grouping.dm");
    if (true || "Grouping changeset [2,3] should contain insert+update=insert TestDomain:Test2dElement") {
      const reader = SqliteChangesetReader.openGroup({ changesetFiles: changesets.slice(0, 2).map((c) => c.pathname), db: rwIVault, disableSchemaCheck: true });
      const adaptor = new DMChangesetAdaptor(reader);
      const instances: ({ id: string, classId?: string, op: SqliteChangeOp, classFullName?: string })[] = [];
      while (adaptor.step()) {
        if (adaptor.inserted) {
          instances.push({ id: adaptor.inserted?.DMInstanceId, classId: adaptor.inserted.DMClassId, op: adaptor.op, classFullName: adaptor.inserted.$meta?.classFullName });
        } else if (adaptor.deleted) {
          instances.push({ id: adaptor.deleted?.DMInstanceId, classId: adaptor.deleted.DMClassId, op: adaptor.op, classFullName: adaptor.deleted.$meta?.classFullName });
        }
      }
      expect(instances.length).to.eq(3);
      expect(instances[0]).deep.eq({
        id: "0x20000000004",
        classId: testElementClassId,
        op: "Inserted",
        classFullName: "TestDomain:Test2dElement",
      });
      expect(instances[1]).deep.eq({
        id: "0x20000000004",
        classId: testElementClassId,
        op: "Inserted",
        classFullName: "TestDomain:Test2dElement",
      });
      expect(instances[2]).deep.eq({
        id: "0x20000000001",
        classId: drawingModelClassId,
        op: "Updated",
        classFullName: "BisCore:DrawingModel",
      });

      reader.writeToFile({ fileName: groupCsFile, containsSchemaChanges: false, overwriteFile: true });
    }
    if (true || "writeToFile() test") {
      const reader = SqliteChangesetReader.openFile({ fileName: groupCsFile, db: rwIVault, disableSchemaCheck: true });
      const adaptor = new DMChangesetAdaptor(reader);
      const instances: ({ id: string, classId?: string, op: SqliteChangeOp, classFullName?: string })[] = [];
      while (adaptor.step()) {
        if (adaptor.inserted) {
          instances.push({ id: adaptor.inserted?.DMInstanceId, classId: adaptor.inserted.DMClassId, op: adaptor.op, classFullName: adaptor.inserted.$meta?.classFullName });
        } else if (adaptor.deleted) {
          instances.push({ id: adaptor.deleted?.DMInstanceId, classId: adaptor.deleted.DMClassId, op: adaptor.op, classFullName: adaptor.deleted.$meta?.classFullName });
        }
      }
      expect(instances.length).to.eq(3);
      expect(instances[0]).deep.eq({
        id: "0x20000000004",
        classId: testElementClassId,
        op: "Inserted",
        classFullName: "TestDomain:Test2dElement",
      });
      expect(instances[1]).deep.eq({
        id: "0x20000000004",
        classId: testElementClassId,
        op: "Inserted",
        classFullName: "TestDomain:Test2dElement",
      });
      expect(instances[2]).deep.eq({
        id: "0x20000000001",
        classId: drawingModelClassId,
        op: "Updated",
        classFullName: "BisCore:DrawingModel",
      });
    }
    txn.end();
    rwIVault.close();
  });

  it("Delete class FK constraint violation in cache table", async () => {
    // Helper to check if TestClass exists in schema and cache table for both briefcases
    function checkClass(firstBriefcase: BriefcaseDb, isClassInFirst: boolean, secondBriefcase: BriefcaseDb, isClassInSecond: boolean) {
      const firstItems = firstBriefcase.getSchemaProps("TestSchema").items;
      assert.equal(isClassInFirst, !!firstItems?.TestClass);

      const secondItems = secondBriefcase.getSchemaProps("TestSchema").items;
      assert.equal(isClassInSecond, !!secondItems?.TestClass);

      const sql = `SELECT ch.classId FROM dm_cache_ClassHierarchy ch JOIN dm_Class c ON ch.classId = c.Id WHERE c.Name = 'TestClass'`;
      const firstStmt = firstBriefcase.prepareSqliteStatement(sql);
      assert.equal(firstStmt.step(), isClassInFirst ? DbResult.BE_SQLITE_ROW : DbResult.BE_SQLITE_DONE);
      firstStmt[Symbol.dispose]();

      const secondStmt = secondBriefcase.prepareSqliteStatement(sql);
      assert.equal(secondStmt.step(), isClassInSecond ? DbResult.BE_SQLITE_ROW : DbResult.BE_SQLITE_DONE);
      secondStmt[Symbol.dispose]();
    }

    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);

    // Open two briefcases for the same iVault
    const [firstBriefCase, secondBriefCase] = await Promise.all([
      HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken }),
      HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken })
    ]);
    const firstTxn = startTestTxn(firstBriefCase, "delete class FK constraint setup");

    // Enable shared channel for both
    [firstBriefCase, secondBriefCase].forEach(briefcase => briefcase.channels.addAllowedChannel(ChannelControl.sharedChannelName));

    await importSchemaStrings(firstTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
          <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

          <DMCustomAttributes>
              <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
          </DMCustomAttributes>

          <DMEntityClass typeName="TestClass">
              <BaseClass>bis:PhysicalElement</BaseClass>
          </DMEntityClass>
      </DMSchema>`]);

    // Push the changes to the hub
    await firstBriefCase.pushChanges({ description: "push initial schema changeset", accessToken: adminToken });

    // Sync the second briefcase with the iVault
    await secondBriefCase.pullChanges({ accessToken: adminToken });

    checkClass(firstBriefCase, true, secondBriefCase, true);

    // Import the schema
    await importSchemaStrings(firstTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="2.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

        <DMCustomAttributes>
          <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
        </DMCustomAttributes>
      </DMSchema>`]);

    // Push the changeset to the hub
    await firstBriefCase.pushChanges({ description: "Delete class major change", accessToken: adminToken });

    checkClass(firstBriefCase, false, secondBriefCase, true);

    // Apply the latest changeset to a new briefcase
    try {
      await secondBriefCase.pullChanges({ accessToken: adminToken });
    } catch (error: any) {
      assert.fail(`Should not have failed with the error: ${error.message}`);
    }

    checkClass(firstBriefCase, false, secondBriefCase, false);

    // Cleanup
    firstTxn.end();
    secondBriefCase.close();
    firstBriefCase.close();
  });


  it("Delete class FK constraint violation in cache table through a revert", async () => {
    // Helper to check if TestClass exists in schema and cache table for both briefcases
    function checkClass(className: string, firstBriefcase: BriefcaseDb, isClassInFirst: boolean, secondBriefcase: BriefcaseDb, isClassInSecond: boolean) {
      assert.equal(isClassInFirst, !!firstBriefcase.getSchemaProps("TestSchema").items?.[className]);
      assert.equal(isClassInSecond, !!secondBriefcase.getSchemaProps("TestSchema").items?.[className]);

      const sql = `SELECT ch.classId FROM dm_cache_ClassHierarchy ch JOIN dm_Class c ON ch.classId = c.Id WHERE c.Name = '${className}'`;
      const firstStmt = firstBriefcase.prepareSqliteStatement(sql);
      assert.equal(firstStmt.step(), isClassInFirst ? DbResult.BE_SQLITE_ROW : DbResult.BE_SQLITE_DONE);
      firstStmt[Symbol.dispose]();

      const secondStmt = secondBriefcase.prepareSqliteStatement(sql);
      assert.equal(secondStmt.step(), isClassInSecond ? DbResult.BE_SQLITE_ROW : DbResult.BE_SQLITE_DONE);
      secondStmt[Symbol.dispose]();
    }

    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);

    // Open two briefcases for the same iVault
    const [firstBriefCase, secondBriefCase] = await Promise.all([
      HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken }),
      HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken })
    ]);
    const firstTxn = startTestTxn(firstBriefCase, "delete class FK revert");

    // Enable shared channel for both
    [firstBriefCase, secondBriefCase].forEach(briefcase => briefcase.channels.addAllowedChannel(ChannelControl.sharedChannelName));

    await importSchemaStrings(firstTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
          <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

          <DMCustomAttributes>
              <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
          </DMCustomAttributes>

          <DMEntityClass typeName="TestClass">
              <BaseClass>bis:PhysicalElement</BaseClass>
          </DMEntityClass>
      </DMSchema>`]);

    // Push the changes to the hub
    await firstBriefCase.pushChanges({ description: "push initial schema changeset", accessToken: adminToken });
    // Sync the second briefcase
    await secondBriefCase.pullChanges({ accessToken: adminToken });

    checkClass("TestClass", firstBriefCase, true, secondBriefCase, true);

    // Import the schema
    await importSchemaStrings(firstTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="1.0.1" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
        <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

        <DMCustomAttributes>
          <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
        </DMCustomAttributes>

        <DMEntityClass typeName="TestClass">
          <BaseClass>bis:PhysicalElement</BaseClass>
        </DMEntityClass>

        <DMEntityClass typeName="AnotherTestClass">
          <BaseClass>bis:PhysicalElement</BaseClass>
        </DMEntityClass>
      </DMSchema>`]);

    // Push the changeset to the hub
    await firstBriefCase.pushChanges({ description: "Add another class change", accessToken: adminToken });
    // Sync the second briefcase
    await secondBriefCase.pullChanges({ accessToken: adminToken });

    checkClass("TestClass", firstBriefCase, true, secondBriefCase, true);
    checkClass("AnotherTestClass", firstBriefCase, true, secondBriefCase, true);

    // Revert the latest changeset from the first briefcase
    try {
      await firstBriefCase.revertAndPushChanges({ toIndex: 2, description: "Revert last changeset" });
    } catch (error: any) {
      assert.fail(`Should not have failed with the error: ${error.message}`);
    }

    checkClass("TestClass", firstBriefCase, true, secondBriefCase, true);
    checkClass("AnotherTestClass", firstBriefCase, false, secondBriefCase, true);

    try {
      await secondBriefCase.pullChanges({ accessToken: adminToken });
    } catch (error: any) {
      assert.fail(`Should not have failed with the error: ${error.message}`);
    }

    checkClass("TestClass", firstBriefCase, true, secondBriefCase, true);
    checkClass("AnotherTestClass", firstBriefCase, false, secondBriefCase, false);

    // Cleanup
    firstTxn.end();
    secondBriefCase.close();
    firstBriefCase.close();
  });

  it("Track changeset health stats", async () => {
    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);

    // Open two briefcases for the same iVault
    const [firstBriefcase, secondBriefcase] = await Promise.all([
      HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken }),
      HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken })
    ]);
    const firstTxn = startTestTxn(firstBriefcase, "track changeset health first briefcase");
    const secondTxn = startTestTxn(secondBriefcase, "track changeset health second briefcase");

    [firstBriefcase, secondBriefcase].forEach(briefcase => briefcase.channels.addAllowedChannel(ChannelControl.sharedChannelName));

    await importSchemaStrings(firstTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
        <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

        <DMCustomAttributes>
          <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
        </DMCustomAttributes>

        <DMEntityClass typeName="TestClass">
          <BaseClass>bis:PhysicalElement</BaseClass>
        </DMEntityClass>
      </DMSchema>`]);

    // Enable changeset tracking for both briefcases
    await Promise.all([firstBriefcase.enableChangesetStatTracking(), secondBriefcase.enableChangesetStatTracking()]);

    await firstBriefcase.pushChanges({ description: "push initial schema changeset", accessToken: adminToken });
    await secondBriefcase.pullChanges({ accessToken: adminToken });

    // Schema upgrade
    await importSchemaStrings(secondTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="2.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
        <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

        <DMCustomAttributes>
          <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
        </DMCustomAttributes>

        <DMEntityClass typeName="TestClass">
          <BaseClass>bis:PhysicalElement</BaseClass>
          <DMProperty propertyName="TestProperty" typeName="string"/>
        </DMEntityClass>

        <DMEnumeration typeName="TestEnum" backingTypeName="int" isStrict="true">
          <DMEnumerator name="Enumerator1" value="1" displayLabel="TestEnumerator1"/>
          <DMEnumerator name="Enumerator2" value="2" displayLabel="TestEnumerator2"/>
        </DMEnumeration>
      </DMSchema>`]);

    await secondBriefcase.pushChanges({ description: "Added a property to TestClass and an enum", accessToken: adminToken });
    await firstBriefcase.pullChanges({ accessToken: adminToken });

    // Major schema change
    await importSchemaStrings(firstTxn, [`<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="2.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA" />

        <DMCustomAttributes>
          <DynamicSchema xmlns = 'CoreCustomAttributes.1.0.0' />
        </DMCustomAttributes>

        <DMEnumeration typeName="TestEnum" backingTypeName="int" isStrict="true">
          <DMEnumerator name="Enumerator1" value="1" displayLabel="TestEnumerator1"/>
          <DMEnumerator name="Enumerator2" value="2" displayLabel="TestEnumerator2"/>
        </DMEnumeration>
      </DMSchema>`]);

    await firstBriefcase.pushChanges({ description: "Deleted TestClass", accessToken: adminToken });
    await secondBriefcase.pullChanges({ accessToken: adminToken });

    const firstBriefcaseChangesets = await firstBriefcase.getAllChangesetHealthData();
    const secondBriefcaseChangesets = await secondBriefcase.getAllChangesetHealthData();

    assert.equal(firstBriefcaseChangesets.length, 1);
    const firstBriefcaseChangeset = firstBriefcaseChangesets[0];

    expect(firstBriefcaseChangeset.changesetIndex).to.be.eql(2);
    expect(firstBriefcaseChangeset.uncompressedSizeBytes).to.be.greaterThan(300);
    expect(firstBriefcaseChangeset.insertedRows).to.be.greaterThanOrEqual(4);
    expect(firstBriefcaseChangeset.updatedRows).to.be.greaterThanOrEqual(1);
    expect(firstBriefcaseChangeset.deletedRows).to.be.eql(0);
    expect(firstBriefcaseChangeset.totalFullTableScans).to.be.eql(0);
    expect(firstBriefcaseChangeset.perStatementStats.length).to.be.eql(5);

    assert.equal(secondBriefcaseChangesets.length, 2);
    const [secondBriefcaseChangeset1, secondBriefcaseChangeset2] = secondBriefcaseChangesets;

    expect(secondBriefcaseChangeset1.changesetIndex).to.be.eql(1);
    expect(secondBriefcaseChangeset1.uncompressedSizeBytes).to.be.greaterThan(40000);
    expect(secondBriefcaseChangeset1.insertedRows).to.be.eql(52);
    expect(secondBriefcaseChangeset1.updatedRows).to.be.greaterThanOrEqual(921);
    expect(secondBriefcaseChangeset1.deletedRows).to.be.greaterThanOrEqual(0)
    expect(secondBriefcaseChangeset1.totalFullTableScans).to.be.eql(0);
    expect(secondBriefcaseChangeset1.perStatementStats.length).to.be.eql(11);

    expect(secondBriefcaseChangeset2.changesetIndex).to.be.eql(3);
    expect(secondBriefcaseChangeset2.uncompressedSizeBytes).to.be.greaterThan(40000);
    expect(secondBriefcaseChangeset2.insertedRows).to.be.greaterThanOrEqual(0);
    expect(secondBriefcaseChangeset2.updatedRows).to.be.greaterThanOrEqual(921);
    expect(secondBriefcaseChangeset2.deletedRows).to.be.eql(52);
    expect(secondBriefcaseChangeset2.totalFullTableScans).to.be.eql(0);
    expect(secondBriefcaseChangeset2.perStatementStats.length).to.be.eql(11);

    // Cleanup
    secondTxn.end();
    firstTxn.end();
    secondBriefcase.close();
    firstBriefcase.close();
  });
  it("openInMemory() & step()", async () => {
    const adminToken = "super manager token";
    const iVaultName = "test";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const txn = startTestTxn(rwIVault, "openInMemory step");
    // 1. Import schema with class that span overflow table.
    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="p1" typeName="string"/>
        </DMEntityClass>
    </DMSchema>`;
    await importSchemaStrings(txn, [schema]);
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // Create drawing model and category
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(txn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    txn.saveChanges();
    await rwIVault.pushChanges({ description: "setup category", accessToken: adminToken });

    const geomArray: Arc3d[] = [
      Arc3d.createXY(Point3d.create(0, 0), 5),
      Arc3d.createXY(Point3d.create(5, 5), 2),
      Arc3d.createXY(Point3d.create(-5, -5), 20),
    ];

    const geometryStream: GeometryStreamProps = [];
    for (const geom of geomArray) {
      const arcData = IVaultJson.Writer.toIVaultJson(geom);
      geometryStream.push(arcData);
    }

    const e1 = {
      classFullName: `TestDomain:Test2dElement`,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      geom: geometryStream,
      ...{ p1: "test1" },
    };

    // 2. Insert a element for the class
    await rwIVault.locks.acquireLocks({ shared: drawingModelId });
    const e1id = txn.insertElement(e1);
    assert.isTrue(Id64.isValidId64(e1id), "insert worked");
    const testElClassId: Id64String = getClassIdByName(rwIVault, "Test2dElement");

    if (true) {
      const reader = SqliteChangesetReader.openInMemory({ db: rwIVault, disableSchemaCheck: true });
      const adaptor = new ChangesetDMAdaptor(reader);
      const unifier = new PartialDMChangeUnifier(rwIVault)
      while (adaptor.step()) {
        unifier.appendFrom(adaptor);
      }
      reader.close();

      // verify the inserted element's properties
      const instances = Array.from(unifier.instances);
      expect(instances.length).to.equals(1);
      const testEl = instances[0];
      expect(testEl.$meta?.op).to.equals("Inserted");
      expect(testEl.$meta?.classFullName).to.equals("TestDomain:Test2dElement");
      expect(testEl.$meta?.stage).to.equals("New");
      expect(testEl.DMClassId).to.equals(testElClassId);
      expect(testEl.DMInstanceId).to.equals(e1id);
      expect(testEl.Model.Id).to.equals(drawingModelId);
      expect(testEl.Category.Id).to.equals(drawingCategoryId);
      expect(testEl.Origin.X).to.equals(0);
      expect(testEl.Origin.Y).to.equals(0);
      expect(testEl.Rotation).to.equals(0);
      expect(testEl.BBoxLow.X).to.equals(-25);
      expect(testEl.BBoxLow.Y).to.equals(-25);
      expect(testEl.BBoxHigh.X).to.equals(15);
      expect(testEl.BBoxHigh.Y).to.equals(15);
      expect(testEl.p1).to.equals("test1");
    }

    // save changes and verify the the txn
    txn.saveChanges();

    if (true) {
      const txnId = rwIVault.txns.getLastSavedTxnProps()?.id as string;
      expect(txnId).to.not.be.undefined;
      const reader = SqliteChangesetReader.openTxn({ db: rwIVault, disableSchemaCheck: true, txnId });
      const adaptor = new ChangesetDMAdaptor(reader);
      const unifier = new PartialDMChangeUnifier(rwIVault)
      while (adaptor.step()) {
        unifier.appendFrom(adaptor);
      }
      reader.close();

      // verify the inserted element's properties
      const instances = Array.from(unifier.instances);
      expect(instances.length).to.equals(3);
      const drawingModelClassId: Id64String = getClassIdByName(rwIVault, "DrawingModel");

      // DrawingModel new instance
      const drawingModelElNew = instances[0];
      expect(drawingModelElNew.$meta?.op).to.equals("Updated");
      expect(drawingModelElNew.$meta?.classFullName).to.equals("BisCore:DrawingModel");
      expect(drawingModelElNew.$meta?.stage).to.equals("New");
      expect(drawingModelElNew.DMClassId).to.equals(drawingModelClassId);
      expect(drawingModelElNew.DMInstanceId).to.equals(drawingModelId);
      expect(drawingModelElNew.LastMod).to.exist;
      expect(drawingModelElNew.GeometryGuid).to.exist;

      // DrawingModel old instance
      const drawingModelElOld = instances[1];
      expect(drawingModelElOld.$meta?.op).to.equals("Updated");
      expect(drawingModelElOld.$meta?.classFullName).to.equals("BisCore:DrawingModel");
      expect(drawingModelElOld.$meta?.stage).to.equals("Old");
      expect(drawingModelElOld.DMClassId).to.equals(drawingModelClassId);
      expect(drawingModelElOld.DMInstanceId).to.equals(drawingModelId);
      expect(drawingModelElOld.LastMod).to.null;
      expect(drawingModelElOld.GeometryGuid).to.null;

      // Test element instance
      const testEl = instances[2];
      expect(testEl.$meta?.op).to.equals("Inserted");
      expect(testEl.$meta?.classFullName).to.equals("TestDomain:Test2dElement");
      expect(testEl.$meta?.stage).to.equals("New");
      expect(testEl.DMClassId).to.equals(testElClassId);
      expect(testEl.DMInstanceId).to.equals(e1id);
      expect(testEl.Model.Id).to.equals(drawingModelId);
      expect(testEl.Category.Id).to.equals(drawingCategoryId);
      expect(testEl.Origin.X).to.equals(0);
      expect(testEl.Origin.Y).to.equals(0);
      expect(testEl.Rotation).to.equals(0);
      expect(testEl.BBoxLow.X).to.equals(-25);
      expect(testEl.BBoxLow.Y).to.equals(-25);
      expect(testEl.BBoxHigh.X).to.equals(15);
      expect(testEl.BBoxHigh.Y).to.equals(15);
      expect(testEl.p1).to.equals("test1");
    }
    await rwIVault.pushChanges({ description: "insert element", accessToken: adminToken });
    txn.end();
    rwIVault.close();
  });
  it("Instance update to a different class (bug)", async () => {
    /**
     * Test scenario: Verifies changeset reader behavior when an instance ID is reused with a different class.
     *
     * Steps:
     * 1. Import schema with two classes (T1 and T2) that inherit from GraphicalElement2d.
     *    - T1 has property 'p' of type string
     *    - T2 has property 'p' of type long
     * 2. Insert an element of type T1 with id=elId and property p="wwww"
     * 3. Push changeset #1: "insert element"
     * 4. Delete the T1 element
     * 5. Manipulate the element ID sequence to force reuse of the same ID
     * 6. Insert a new element of type T2 with the same id=elId but property p=1111
     * 7. Push changeset #2: "buggy changeset"
     *
     * Verification:
     * - Changeset #2 should show an "Updated" operation (not Delete+Insert)
     * - In bis_Element table: DMClassId changes from T1 to T2
     * - In bis_GeometricElement2d table: DMClassId changes from T1 to T2
     * - Property 'p' changes from string "wwww" to integer 1111
     *
     * This tests the changeset reader's ability to handle instance class changes,
     * which can occur in edge cases where IDs are reused with different types.
     */
    const adminToken = "super manager token";
    const iVaultName = "test";
    const modelId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(modelId);
    let b1 = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: modelId, accessToken: adminToken });
    let txn = startTestTxn(b1, "instance update to different class");
    // 1. Import schema with classes that span overflow table.
    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="T1">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
              <DMProperty propertyName="p" typeName="string"/>
        </DMEntityClass>
        <DMEntityClass typeName="T2">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
              <DMProperty propertyName="p" typeName="long"/>
        </DMEntityClass>
    </DMSchema>`;

    await importSchemaStrings(txn, [schema]);
    b1.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // Create drawing model and category
    await b1.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(txn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(b1, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(txn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));


    const geomArray: Arc3d[] = [
      Arc3d.createXY(Point3d.create(0, 0), 5),
      Arc3d.createXY(Point3d.create(5, 5), 2),
      Arc3d.createXY(Point3d.create(-5, -5), 20),
    ];

    const geometryStream: GeometryStreamProps = [];
    for (const geom of geomArray) {
      const arcData = IVaultJson.Writer.toIVaultJson(geom);
      geometryStream.push(arcData);
    }

    const geomElementT1 = {
      classFullName: `TestDomain:T1`,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      geom: geometryStream,
      p: "wwww",
    };

    const elId = txn.insertElement(geomElementT1);
    assert.isTrue(Id64.isValidId64(elId), "insert worked");
    txn.saveChanges();
    await b1.pushChanges({ description: "insert element" });

    await b1.locks.acquireLocks({ shared: drawingModelId, exclusive: elId });
    await b1.locks.acquireLocks({ shared: IVault.dictionaryId });
    txn.deleteElement(elId);
    txn.saveChanges();

    // Force id set to reproduce same instance with different classid
    const bid = BigInt(elId) - 1n
    b1[_nativeDb].saveLocalValue("bis_elementidsequence", bid.toString());
    txn.saveChanges();
    const fileName = b1[_nativeDb].getFilePath();
    txn.end();
    b1.close();

    b1 = await BriefcaseDb.open({ fileName });
    b1.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    txn = startTestTxn(b1, "instance update to different class reopened briefcase");


    const geomElementT2 = {
      classFullName: `TestDomain:T2`,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      geom: geometryStream,
      p: 1111,
    };

    const elId2 = txn.insertElement(geomElementT2);
    chai.expect(elId).equals(elId2);

    txn.saveChanges();
    await b1.pushChanges({ description: "buggy changeset" });

    const getChanges = async () => {
      return HubMock.downloadChangesets({ iVaultId: modelId, targetDir: path.join(KnownTestLocations.outputDir, modelId, "changesets") });
    };


    const changesets = await getChanges();
    chai.expect(changesets.length).equals(2);
    chai.expect(changesets[0].description).equals("insert element");
    chai.expect(changesets[1].description).equals("buggy changeset");

    const getClassId = async (name: string) => {
      const r = b1.createQueryReader("SELECT FORMAT('0x%x', dm_classid(?))", QueryBinder.from([name]));
      if (await r.step()) {
        return r.current[0];
      }
    }

    const t1ClassId = await getClassId("TestDomain:T1");
    const t2ClassId = await getClassId("TestDomain:T2");

    const reader = SqliteChangesetReader.openFile({ fileName: changesets[1].pathname, disableSchemaCheck: true, db: b1 });
    let bisElementAsserted = false;
    let bisGeometricElement2dAsserted = false;
    while (reader.step()) {
      if (reader.tableName === "bis_Element" && reader.op === "Updated") {
        bisElementAsserted = true;
        chai.expect(reader.getColumnNames(reader.tableName)).deep.equals([
          "Id",
          "DMClassId",
          "ModelId",
          "LastMod",
          "CodeSpecId",
          "CodeScopeId",
          "CodeValue",
          "UserLabel",
          "ParentId",
          "ParentRelDMClassId",
          "FederationGuid",
          "JsonProperties",
        ]);

        const oldId = reader.getChangeValueId(0, "Old");
        const newId = reader.getChangeValueId(0, "New");
        chai.expect(oldId).equals(elId);
        chai.expect(newId).to.be.undefined;

        const oldClassId = reader.getChangeValueId(1, "Old");
        const newClassId = reader.getChangeValueId(1, "New");
        chai.expect(oldClassId).equals(t1ClassId);
        chai.expect(newClassId).equals(t2ClassId);
        chai.expect(oldClassId).is.not.equal(newClassId);
      }
      if (reader.tableName === "bis_GeometricElement2d" && reader.op === "Updated") {
        bisGeometricElement2dAsserted = true;
        chai.expect(reader.getColumnNames(reader.tableName)).deep.equals([
          "ElementId",
          "DMClassId",
          "CategoryId",
          "Origin_X",
          "Origin_Y",
          "Rotation",
          "BBoxLow_X",
          "BBoxLow_Y",
          "BBoxHigh_X",
          "BBoxHigh_Y",
          "GeometryStream",
          "TypeDefinitionId",
          "TypeDefinitionRelDMClassId",
          "js1",
          "js2",
        ]);

        // DMInstanceId
        const oldId = reader.getChangeValueId(0, "Old");
        const newId = reader.getChangeValueId(0, "New");
        chai.expect(oldId).equals(elId);
        chai.expect(newId).to.be.undefined;

        // DMClassId (changed)
        const oldClassId = reader.getChangeValueId(1, "Old");
        const newClassId = reader.getChangeValueId(1, "New");
        chai.expect(oldClassId).equals(t1ClassId);
        chai.expect(newClassId).equals(t2ClassId);
        chai.expect(oldClassId).is.not.equal(newClassId);

        // Property 'p' changed type and value.
        const oldP = reader.getChangeValueText(13, "Old");
        const newP = reader.getChangeValueInteger(13, "New");
        chai.expect(oldP).equals("wwww");
        chai.expect(newP).equals(1111);
      }
    }

    chai.expect(bisElementAsserted).to.be.true;
    chai.expect(bisGeometricElement2dAsserted).to.be.true;
    reader.close();


    // ChangesetDMAdaptor works incorrectly as it does not expect DMClassId to change in an update.
    const adaptor = new ChangesetDMAdaptor(
      SqliteChangesetReader.openFile({ fileName: changesets[1].pathname, disableSchemaCheck: true, db: b1 })
    );

    adaptor.acceptClass(GraphicalElement2d.classFullName)
    adaptor.acceptOp("Updated");

    let dmChangeForElementAsserted = false;
    let dmChangeForGeometricElement2dAsserted = false;
    while (adaptor.step()) {
      if (adaptor.reader.tableName === "bis_Element") {
        dmChangeForElementAsserted = true;
        chai.expect(adaptor.inserted?.$meta?.classFullName).equals("TestDomain:T1"); // WRONG should be TestDomain:T2
        chai.expect(adaptor.deleted?.$meta?.classFullName).equals("TestDomain:T1"); // WRONG should be TestDomain:T2
      }
      if (adaptor.reader.tableName === "bis_GeometricElement2d") {
        dmChangeForGeometricElement2dAsserted = true;
        chai.expect(adaptor.inserted?.$meta?.classFullName).equals("TestDomain:T1"); // WRONG should be TestDomain:T2
        chai.expect(adaptor.deleted?.$meta?.classFullName).equals("TestDomain:T1"); // WRONG should be TestDomain:T2
        chai.expect(adaptor.inserted?.p).equals("0x457"); // CORRECT p in T2 is integer
        chai.expect(adaptor.deleted?.p).equals("wwww"); // CORRECT p in T1 is string
      }
    }
    chai.expect(dmChangeForElementAsserted).to.be.true;
    chai.expect(dmChangeForGeometricElement2dAsserted).to.be.true;
    adaptor.close();

    // PartialDMChangeUnifier fail to combine changes correctly when DMClassId is updated.
    const adaptor2 = new ChangesetDMAdaptor(
      SqliteChangesetReader.openFile({ fileName: changesets[1].pathname, disableSchemaCheck: true, db: b1 })
    );
    const unifier = new PartialDMChangeUnifier(b1);
    adaptor2.acceptClass(GraphicalElement2d.classFullName)
    adaptor2.acceptOp("Updated");
    while (adaptor2.step()) {
      unifier.appendFrom(adaptor2);
    }

    chai.expect(unifier.getInstanceCount()).to.be.equals(2); // WRONG should be 1

    txn.end();
    b1.close();
  });

});

describe("PRAGMA DMSQL Functions", async () => {
  let szewTwinId: GuidString;
  let iVault: BriefcaseDb;

  before(() => {
    HubMock.startup("SqliteChangesetReaderAndChangesetDMAdaptorTest", KnownTestLocations.outputDir);
    szewTwinId = HubMock.szewTwinId;
  });

  after(() => HubMock.shutdown());

  beforeEach(async () => {
    // Create new iVault
    const adminToken = "super manager token";
    const iVaultName = "PRAGMA_test";
    const iVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(iVaultId);
    iVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId, accessToken: adminToken });
  });

  afterEach(() => {
    // Cleanup
    iVault.close();
  });

  it("should call PRAGMA integrity_check on a new iVault and return no errors", async () => {
    // Call PRAGMA integrity_check
    const query = "PRAGMA integrity_check DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES";
    const result = iVault.createQueryReader(query, undefined, undefined);
    const results = await result.toArray();

    // Verify no errors
    assert(results.length > 0, "Results should be returned from PRAGMA integrity_check");
    assert(results[0][2] === true, "'check_data_columns' check should be true");
    assert(results[1][2] === true, "'check_dm_profile' check should be true")
    assert(results[2][2] === true, "'check_nav_class_ids' check should be true")
    assert(results[3][2] === true, "'check_nav_ids' check should be true")
    assert(results[4][2] === true, "'check_linktable_fk_class_ids' check should be true")
    assert(results[5][2] === true, "'check_linktable_fk_ids' check should be true")
    assert(results[6][2] === true, "'check_class_ids' check should be true")
    assert(results[7][2] === true, "'check_data_schema' check should be true")
    assert(results[8][2] === true, "'check_schema_load' check should be true")
  });

  it("should call PRAGMA integrity_check individual checks on a new iVault and return no errors", async () => {
    // Call check_dm_profile
    let query = "pragma integrity_check(check_dm_profile) options enable_experimental_features";
    let result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    let resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_data_schema
    query = "pragma integrity_check(check_data_schema) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_data_columns
    query = "pragma integrity_check(check_data_columns) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_nav_class_ids
    query = "pragma integrity_check(check_nav_class_ids) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_nav_ids
    query = "pragma integrity_check(check_nav_ids) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_linktable_fk_class_ids
    query = "pragma integrity_check(check_linktable_fk_class_ids) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_linktable_fk_ids
    query = "pragma integrity_check(check_linktable_fk_ids) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_class_ids
    query = "pragma integrity_check(check_class_ids) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected

    // Call check_schema_load
    query = "pragma integrity_check(check_schema_load) options enable_experimental_features";
    result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    resultArray = await result.toArray();
    expect(resultArray.length).to.equal(0); // No errors expected
  });

  it("should call PRAGMA integrity_check on a corrupted iVault and return an error", async () => {
    // Insert two elements
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });
    const txn = startTestTxn(iVault, "PRAGMA integrity check corrupted iVault");

    const element1Id = txn.insertElement({
      classFullName: Subject.classFullName,
      model: IVault.repositoryModelId,
      parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject1"),
    });

    const element2Id = txn.insertElement({
      classFullName: Subject.classFullName,
      model: IVault.repositoryModelId,
      parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject2"),
    });
    txn.saveChanges();

    // Create a relationship between them
    await iVault.locks.acquireLocks({ exclusive: Id64.toIdSet([element1Id, element2Id]) });
    const relationship = iVault.relationships.createInstance({
      classFullName: "BisCore:SubjectRefersToSubject",
      sourceId: element1Id,
      targetId: element2Id,
    });
    const relationshipId = txn.insertRelationship(relationship.toJSON());
    assert.isTrue(Id64.isValidId64(relationshipId));
    txn.saveChanges();

    // Delete one element without deleting the relationship to corrupt the iVault
    const deleteResult = iVault[_nativeDb].executeSql(`DELETE FROM bis_Element WHERE Id=${element2Id}`);
    expect(deleteResult).to.equal(DbResult.BE_SQLITE_OK);
    txn.saveChanges();

    // Call PRAGMA integrity_check
    const query = "PRAGMA integrity_check DMSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES";
    const result = iVault.createQueryReader(query, undefined, undefined);
    const results = await result.toArray();

    // Verify error is reported
    assert(results.length > 0, "Results should be returned from PRAGMA integrity_check");
    assert(results[0][2] === true, "'check_data_columns' check should be true");
    assert(results[1][2] === true, "'check_dm_profile' check should be true")
    assert(results[2][2] === true, "'check_nav_class_ids' check should be true")
    assert(results[3][2] === true, "'check_nav_ids' check should be true")
    assert(results[4][2] === true, "'check_linktable_fk_class_ids' check should be true")
    assert(results[5][2] === false, "'check_linktable_fk_ids' check should be false") // Expecting error report here
    assert(results[6][2] === true, "'check_class_ids' check should be true")
    assert(results[7][2] === true, "'check_data_schema' check should be true")
    assert(results[8][2] === true, "'check_schema_load' check should be true")
    txn.end();
  });

  it("should call PRAGMA integrity_check(check_linktable_fk_class_ids) on a corrupted iVault and return an error", async () => {
    // Insert two elements
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });
    const txn = startTestTxn(iVault, "PRAGMA integrity check corrupted linktable fk ids");

    const element1Id = txn.insertElement({
      classFullName: Subject.classFullName,
      model: IVault.repositoryModelId,
      parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject1"),
    });

    const element2Id = txn.insertElement({
      classFullName: Subject.classFullName,
      model: IVault.repositoryModelId,
      parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject2"),
    });
    txn.saveChanges();

    // Create a relationship between them
    await iVault.locks.acquireLocks({ exclusive: Id64.toIdSet([element1Id, element2Id]) });
    const relationship = iVault.relationships.createInstance({
      classFullName: "BisCore:SubjectRefersToSubject",
      sourceId: element1Id,
      targetId: element2Id,
    });
    const relationshipId = txn.insertRelationship(relationship.toJSON());
    assert.isTrue(Id64.isValidId64(relationshipId));
    txn.saveChanges();

    // Delete one element without deleting the relationship to corrupt the iVault
    const deleteResult = iVault[_nativeDb].executeSql(`DELETE FROM bis_Element WHERE Id=${element2Id}`);
    expect(deleteResult).to.equal(DbResult.BE_SQLITE_OK);
    txn.saveChanges();

    // Call PRAGMA integrity_check
    const query = "pragma integrity_check(check_linktable_fk_ids) options enable_experimental_features";
    const result = iVault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseDMSqlPropertyNames });
    const resultArray = await result.toArray();
    expect(resultArray.length).to.equal(1); // 1 error report expected
    expect(resultArray[0].id).to.equal("0x20000000001");
    expect(resultArray[0].key_id).to.equal("0x20000000002");
    txn.end();
  });
});
