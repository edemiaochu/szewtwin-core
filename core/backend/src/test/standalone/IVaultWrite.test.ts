/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AccessToken, DbResult, GuidString, Id64, Id64String } from "@szewtwin/core-szewec";
import { EditTxn, withEditTxn } from "../../EditTxn";
import {
  ChangesetIdWithIndex, Code, ColorDef,
  GeometricElement2dProps, GeometryStreamProps, IVault, IVaultVersion, LockState, QueryRowFormat, RequestNewBriefcaseProps, SchemaState, SubCategoryAppearance,
} from "@szewtwin/core-common";
import { Arc3d, IVaultJson, Point2d, Point3d } from "@szewtwin/core-geometry";
import * as chai from "chai";
import { assert, expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as semver from "semver";
import * as sinon from "sinon";
import { HubWrappers, KnownTestLocations } from "../";
import { DrawingCategory } from "../../Category";
import { DMSqlStatement } from "../../DMSqlStatement";
import { HubMock } from "../../internal/HubMock";
import {
  _nativeDb,
  BriefcaseDb,
  BriefcaseManager,
  ChannelControl,
  CodeService, DefinitionModel, DictionaryModel, DocumentListModel, Drawing, DrawingGraphic, OpenBriefcaseArgs, SpatialCategory, Subject,
} from "../../core-backend";
import { IVaultTestUtils, TestUserType } from "../IVaultTestUtils";
import { ServerBasedLocks } from "../../internal/ServerBasedLocks";

chai.use(chaiAsPromised);


export async function createNewModelAndCategory(txn: EditTxn, parent?: Id64String) {
  const rwIVault = txn.iVault as BriefcaseDb;
  // Create a new physical model.
  const [, modelId] = await IVaultTestUtils.createAndInsertPhysicalPartitionAndModelAsync(txn, IVaultTestUtils.getUniqueModelCode(rwIVault, "newPhysicalModel"), true, parent);

  // Find or create a SpatialCategory.
  const dictionary: DictionaryModel = rwIVault.models.getModel<DictionaryModel>(IVault.dictionaryId);
  const newCategoryCode = IVaultTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
  const category = SpatialCategory.create(rwIVault, IVault.dictionaryId, newCategoryCode.value);
  const spatialCategoryId = txn.insertElement(category.toJSON());
  category.setDefaultAppearance(txn, new SubCategoryAppearance({ color: 0xff0000 }));
  // const spatialCategoryId: Id64String = SpatialCategory.insert(rwIVault, IVault.dictionaryId, newCategoryCode.value!, new SubCategoryAppearance({ color: 0xff0000 }));

  return { modelId, spatialCategoryId };
}

describe("IVaultWriteTest", () => {
  let managerAccessToken: AccessToken;
  let superAccessToken: AccessToken;
  let szewTwinId: GuidString;

  before(async () => {
    HubMock.startup("IVaultWriteTest", KnownTestLocations.outputDir);
    szewTwinId = HubMock.szewTwinId;
    managerAccessToken = await HubWrappers.getAccessToken(TestUserType.Manager);
    superAccessToken = await HubWrappers.getAccessToken(TestUserType.SuperManager);
  });
  after(() => HubMock.shutdown());

  it("Check busyTimeout option", async () => {
    const iVaultProps = {
      iVaultName: "ReadWriteTest",
      szewTwinId,
    };

    const iVaultId = await HubMock.createNewIVault(iVaultProps);
    const briefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: "test token", szewTwinId, iVaultId });

    const tryOpen = async (args: OpenBriefcaseArgs) => {
      const start = performance.now();
      let didThrow = false;
      try {
        await BriefcaseDb.open(args);

      } catch (e: any) {
        assert.strictEqual(e.errorNumber, DbResult.BE_SQLITE_BUSY, "Expect error 'Db is busy'");
        didThrow = true;
      }
      assert.isTrue(didThrow);
      return performance.now() - start;
    };
    const seconds = (s: number) => s * 1000;

    const db = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });
    const dbTxn = new EditTxn(db, "ivault write");
    dbTxn.start();
    dbTxn.saveChanges();
    // lock db so another connection cannot write to it.
    dbTxn.saveFileProperty({ name: "test", namespace: "test" }, "");

    assert.isAtMost(await tryOpen({ fileName: briefcaseProps.fileName, busyTimeout: seconds(0) }), seconds(1), "open should fail with busy error instantly");
    assert.isAtLeast(await tryOpen({ fileName: briefcaseProps.fileName, busyTimeout: seconds(1) }), seconds(1), "open should fail with atleast 1 sec delay due to retry");
    assert.isAtLeast(await tryOpen({ fileName: briefcaseProps.fileName, busyTimeout: seconds(2) }), seconds(2), "open should fail with atleast 2 sec delay due to retry");
    assert.isAtLeast(await tryOpen({ fileName: briefcaseProps.fileName, busyTimeout: seconds(3) }), seconds(3), "open should fail with atleast 3 sec delay due to retry");

    dbTxn.end("abandon");
    db.close();
  });

  it("WatchForChanges", async () => {
    const iVaultProps = {
      iVaultName: "ReadWriteTest",
      szewTwinId,
    };

    const iVaultId = await HubMock.createNewIVault(iVaultProps);
    const briefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: "test token", szewTwinId, iVaultId });

    let nClosed = 0;
    const fsWatcher = {
      callback: () => { },
      close: () => ++nClosed,
    };
    const watchStub: any = (_filename: fs.PathLike, _opts: fs.WatchOptions, fn: () => void) => {
      fsWatcher.callback = fn;
      return fsWatcher;
    };
    const watchStubResult = sinon.stub(fs, "watch").callsFake(watchStub);
    let bc: BriefcaseDb | undefined;
    let roBC: BriefcaseDb | undefined;
    try {
      bc = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });
      bc.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      roBC = await BriefcaseDb.open({ fileName: briefcaseProps.fileName, watchForChanges: true });
      const bcTxn = new EditTxn(bc, "ivault write");
      bcTxn.start();

      const code1 = IVaultTestUtils.getUniqueModelCode(bc, "newPhysicalModel1");
      await IVaultTestUtils.createAndInsertPhysicalPartitionAndModelAsync(bcTxn, code1, true);
      bcTxn.end();

      // immediately after save changes the current txnId in the writeable briefcase changes, but it isn't reflected
      // in the readonly briefcase until the file watcher fires.
      expect(bc[_nativeDb].getCurrentTxnId()).not.equal(roBC[_nativeDb].getCurrentTxnId());

      // trigger watcher via stub
      fsWatcher.callback();

      // now they should match because restartDefaultTxn in the readonly briefcase reads the changes from the writeable connection
      expect(bc[_nativeDb].getCurrentTxnId()).equal(roBC[_nativeDb].getCurrentTxnId());
    } finally {
      roBC?.close();
      bc?.close();
      // NOTE: Since HubMock.startup() is called in the before() block and not beforeEach(), we CANNOT
      // call sinon.restore() here. This is because sinon.restore() will restore the stubs for
      // CloudSqlite that HubMock.startup() put in place.
      watchStubResult.restore();
    }

    expect(nClosed).equal(1);
  });

  function expectEqualChangesets(a: ChangesetIdWithIndex, b: ChangesetIdWithIndex): void {
    expect(a.id).to.equal(b.id);
    expect(a.index).to.equal(b.index);
  }

  it("WatchForChanges - push", async () => {
    const adminAccessToken = await HubWrappers.getAccessToken(TestUserType.SuperManager);
    const iVaultProps = {
      iVaultName: "ReadWriteTest",
      szewTwinId,
    };

    const iVaultId = await HubMock.createNewIVault(iVaultProps);
    const briefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: adminAccessToken, szewTwinId, iVaultId });

    let nClosed = 0;
    const fsWatcher = {
      callback: () => { },
      close: () => ++nClosed,
    };
    const watchStub: any = (_filename: fs.PathLike, _opts: fs.WatchOptions, fn: () => void) => {
      fsWatcher.callback = fn;
      return fsWatcher;
    };
    const watchStubResult = sinon.stub(fs, "watch").callsFake(watchStub);
    let bc: BriefcaseDb | undefined;
    let roBC: BriefcaseDb | undefined;
    try {
      bc = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });
      bc.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      roBC = await BriefcaseDb.open({ fileName: briefcaseProps.fileName, watchForChanges: true });
      const bcTxn = new EditTxn(bc, "ivault write");
      bcTxn.start();

      const code1 = IVaultTestUtils.getUniqueModelCode(bc, "newPhysicalModel1");
      await IVaultTestUtils.createAndInsertPhysicalPartitionAndModelAsync(bcTxn, code1, true);
      bcTxn.end();

      // immediately after save changes the current txnId in the writeable briefcase changes, but it isn't reflected
      // in the readonly briefcase until the file watcher fires.
      expect(bc[_nativeDb].getCurrentTxnId()).not.equal(roBC[_nativeDb].getCurrentTxnId());

      // trigger watcher via stub
      fsWatcher.callback();

      // now they should match because restartDefaultTxn in the readonly briefcase reads the changes from the writeable connection
      expect(bc[_nativeDb].getCurrentTxnId()).equal(roBC[_nativeDb].getCurrentTxnId());

      const prePushChangeset = bc.changeset;
      let eventRaised = false;
      roBC.onChangesetChanged.addOnce((prevCS) => {
        expectEqualChangesets(prevCS, prePushChangeset);
        eventRaised = true;
      });

      await bc.pushChanges({ accessToken: adminAccessToken, description: "test" });
      const postPushChangeset = bc.changeset;
      assert(!!postPushChangeset);
      expect(prePushChangeset !== postPushChangeset, "changes should be pushed");

      // trigger watcher via stub
      fsWatcher.callback();

      expectEqualChangesets(roBC.changeset, postPushChangeset);
      expect(roBC[_nativeDb].getCurrentTxnId(), "txn should be updated").equal(bc[_nativeDb].getCurrentTxnId());
      expect(eventRaised).to.be.true;
    } finally {
      roBC?.close();
      bc?.close();
      // NOTE: Since HubMock.startup() is called in the before() block and not beforeEach(), we CANNOT
      // call sinon.restore() here. This is because sinon.restore() will restore the stubs for
      // CloudSqlite that HubMock.startup() put in place.
      watchStubResult.restore();
    }

    expect(nClosed).equal(1);
  });

  it("WatchForChanges - pull", async () => {
    const adminAccessToken = await HubWrappers.getAccessToken(TestUserType.SuperManager);

    const pathname = IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw");
    const hubName = "CompatibilityTest";
    const iVaultId = await HubWrappers.pushIVault(managerAccessToken, szewTwinId, pathname, hubName, true);

    // Download two copies of the briefcase - manager and super
    const args: RequestNewBriefcaseProps = { szewTwinId, iVaultId };
    const initialDb = await BriefcaseManager.downloadBriefcase({ accessToken: adminAccessToken, ...args });
    const briefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: adminAccessToken, ...args });

    let nClosed = 0;
    const fsWatcher = {
      callback: () => { },
      close: () => ++nClosed,
    };
    const watchStub: any = (_filename: fs.PathLike, _opts: fs.WatchOptions, fn: () => void) => {
      fsWatcher.callback = fn;
      return fsWatcher;
    };

    // Push some changes - prep for pull workflow.
    let bc1: BriefcaseDb | undefined;
    let bc: BriefcaseDb | undefined;
    let roBC: BriefcaseDb | undefined;
    const watchStubResult = sinon.stub(fs, "watch").callsFake(watchStub);
    try {
      bc1 = await BriefcaseDb.open({ fileName: initialDb.fileName });
      bc1.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      const bc1Txn = new EditTxn(bc1, "ivault write");
      bc1Txn.start();
      const code2 = IVaultTestUtils.getUniqueModelCode(bc1, "newPhysicalModel2");
      await IVaultTestUtils.createAndInsertPhysicalPartitionAndModelAsync(bc1Txn, code2, true);
      const prePushChangeset = bc1.changeset;
      bc1Txn.end();
      await bc1.pushChanges({ accessToken: adminAccessToken, description: "test" });
      const postPushChangeset = bc1.changeset;
      assert(!!prePushChangeset);
      expect(prePushChangeset !== postPushChangeset, "changes should be pushed");

      bc = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });
      bc.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      roBC = await BriefcaseDb.open({ fileName: briefcaseProps.fileName, watchForChanges: true });

      const prePullChangeset = bc.changeset;
      let eventRaised = false;
      roBC.onChangesetChanged.addOnce((prevCS) => {
        expectEqualChangesets(prevCS, prePushChangeset);
        eventRaised = true;
      });

      await bc.pullChanges();

      const postPullChangeset = bc.changeset;
      assert(!!postPullChangeset);
      expect(prePullChangeset !== postPullChangeset, "changes should be pulled");

      // trigger watcher via stub
      fsWatcher.callback();

      expectEqualChangesets(roBC.changeset, postPullChangeset);
      expect(roBC[_nativeDb].getCurrentTxnId(), "txn should be updated").equal(bc[_nativeDb].getCurrentTxnId());
      expect(eventRaised).to.be.true;
    } finally {
      roBC?.close();
      bc?.close();
      bc1?.close();
      // NOTE: Since HubMock.startup() is called in the before() block and not beforeEach(), we CANNOT
      // call sinon.restore() here. This is because sinon.restore() will restore the stubs for
      // CloudSqlite that HubMock.startup() put in place.
      watchStubResult.restore();
    }

    expect(nClosed).equal(1);
  });

  it("should handle undo/redo", async () => {
    const adminAccessToken = await HubWrappers.getAccessToken(TestUserType.SuperManager);
    // Delete any existing iVaults with the same name as the read-write test iVault
    const iVaultName = "CodesUndoRedoPushTest";

    // Create a new empty iVault on the Hub & obtain a briefcase
    const rwIVaultId = await HubMock.createNewIVault({ accessToken: adminAccessToken, szewTwinId, iVaultName, description: "TestSubject" });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ accessToken: adminAccessToken, szewTwinId, iVaultId: rwIVaultId });
    const rwTxn = new EditTxn(rwIVault, "ivault write");
    rwTxn.start();
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // create and insert a new model with code1
    const code1 = IVaultTestUtils.getUniqueModelCode(rwIVault, "newPhysicalModel1");
    await IVaultTestUtils.createAndInsertPhysicalPartitionAndModelAsync(rwTxn, code1, true);
    assert.isTrue(rwIVault.elements.getElement(code1) !== undefined); // throws if element is not found

    // create a local txn with that change
    rwTxn.saveChanges("inserted newPhysicalModel");

    // Reverse that local txn
    rwIVault.txns.reverseSingleTxn();

    try {
      //  The model that I just created with code1 should no longer be there.
      const theNewModel = rwIVault.elements.getElement(code1); // throws if element is not found
      assert.isTrue(theNewModel === undefined); // really should not be here.
      assert.fail(); // should not be here.
    } catch {
      // this is what I expect
    }

    // Create and insert a model with code2
    const code2 = IVaultTestUtils.getUniqueModelCode(rwIVault, "newPhysicalModel2");
    await IVaultTestUtils.createAndInsertPhysicalPartitionAndModelAsync(rwTxn, code2, true);
    rwTxn.end("save", "inserted generic objects");

    // The iVault should have a model with code1 and not code2
    assert.isTrue(rwIVault.elements.getElement(code2) !== undefined); // throws if element is not found

    // Push the changes to the hub
    const prePushChangeset = rwIVault.changeset;
    await rwIVault.pushChanges({ accessToken: adminAccessToken, description: "test" });
    const postPushChangeset = rwIVault.changeset;
    assert(!!postPushChangeset);
    expect(prePushChangeset !== postPushChangeset);

    rwIVault.close();
  });

  it("should be able to upgrade a briefcase with an older schema", async () => {
    /**
     * Test validates that -
     * - User "manager" upgrades the BisCore schema in the briefcase from version 1.0.0 to 1.0.10+
     * - User "super" can get the upgrade "manager" made
     */

    /* Setup test - Push an iVault with an old BisCore schema up to the Hub */
    const pathname = IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw");
    const hubName = "CompatibilityTest";
    const iVaultId = await HubWrappers.pushIVault(managerAccessToken, szewTwinId, pathname, hubName, true);

    // Download two copies of the briefcase - manager and super
    const args: RequestNewBriefcaseProps = { szewTwinId, iVaultId };
    const managerBriefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: managerAccessToken, ...args });
    const superBriefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: superAccessToken, ...args });

    /* User "manager" upgrades the briefcase */

    // Validate the original state of the BisCore schema in the briefcase
    let iVault = await BriefcaseDb.open({ fileName: managerBriefcaseProps.fileName });
    const beforeVersion = iVault.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(beforeVersion!, "= 1.0.0"));
    assert.isFalse(iVault[_nativeDb].hasPendingTxns());
    iVault.close();

    // Validate that the BisCore schema is recognized as a recommended upgrade
    let schemaState = BriefcaseDb.validateSchemas(managerBriefcaseProps.fileName, true);
    assert.strictEqual(schemaState, SchemaState.UpgradeRecommended);

    // Upgrade the schemas
    await BriefcaseDb.upgradeSchemas(managerBriefcaseProps);

    // Validate state after upgrade
    iVault = await BriefcaseDb.open({ fileName: managerBriefcaseProps.fileName });
    const afterVersion = iVault.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(afterVersion!, ">= 1.0.10"));
    assert.isFalse(iVault[_nativeDb].hasPendingTxns());
    assert.isFalse(iVault.holdsSchemaLock);
    assert.isFalse(iVault[_nativeDb].hasUnsavedChanges());
    iVault.close();

    /* User "super" can get the upgrade "manager" made */

    // Validate that the BisCore schema is recognized as a recommended upgrade
    schemaState = BriefcaseDb.validateSchemas(superBriefcaseProps.fileName, true);
    assert.strictEqual(schemaState, SchemaState.UpgradeRecommended);

    // Open briefcase and pull change sets to upgrade
    const superIVault = await BriefcaseDb.open({ fileName: superBriefcaseProps.fileName });
    (superBriefcaseProps.changeset as any) = await superIVault.pullChanges({ accessToken: superAccessToken });
    const superVersion = superIVault.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(superVersion!, ">= 1.0.10"));
    assert.isFalse(superIVault[_nativeDb].hasUnsavedChanges()); // Validate no changes were made
    assert.isFalse(superIVault[_nativeDb].hasPendingTxns()); // Validate no changes were made
    superIVault.close();

    // Validate that there are no upgrades required
    schemaState = BriefcaseDb.validateSchemas(superBriefcaseProps.fileName, true);
    assert.strictEqual(schemaState, SchemaState.UpToDate);

    // Upgrade the schemas - ensure this is a no-op
    await BriefcaseDb.upgradeSchemas(superBriefcaseProps);
    await HubMock.deleteIVault({ accessToken: managerAccessToken, szewTwinId, iVaultId });
  });

  it("changeset size and dm schema version change", async () => {
    const adminToken = "super manager token";
    const iVaultName = "changeset_size";
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const rwTxn = new EditTxn(rwIVault, "ivault write");
    assert.equal(rwIVault[_nativeDb].enableChangesetSizeStats(true), DbResult.BE_SQLITE_OK);
    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="s" typeName="string"/>
        </DMEntityClass>
    </DMSchema>`;
    await rwIVault.importSchemaStrings([schema]);
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    rwTxn.start();
    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ description: "push schema changeset", accessToken: adminToken });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
      const changesets = await HubMock.queryChangesets({ iVaultId: rwIVaultId, accessToken: superAccessToken });
      assert.equal(changesets.length, 1);
    }
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    let totalEl = 0;
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(rwTxn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(rwTxn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    const insertElements = (txn: EditTxn, className: string = "Test2dElement", noOfElements: number = 10, userProp: (n: number) => object) => {
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
    const str = new Array(1024).join("x");
    insertElements(rwTxn, "Test2dElement", 1024, () => {
      return { s: str };
    });
    assert.equal(1357648, rwIVault[_nativeDb].getChangesetSize());

    rwTxn.saveChanges("user 1: data");
    assert.equal(0, rwIVault[_nativeDb].getChangesetSize());
    await rwIVault.pushChanges({ description: "schema changeset", accessToken: adminToken });
    rwIVault.close();
  });

  it("should set a fake verifyCode for codeService that throws error for operations that affect code, if failed to open codeService ", async () => {
    const iVaultProps = {
      iVaultName: "codeServiceTest",
      szewTwinId,
    };
    const iVaultId = await HubMock.createNewIVault(iVaultProps);
    const briefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: "codeServiceTest", szewTwinId, iVaultId });
    const originalCreateForIVault = CodeService.createForIVault;
    // can be any errors except 'NoCodeIndex'
    CodeService.createForIVault = async () => {
      throw new CodeService.Error("MissingCode", 0x10000 + 1, " ");
    };
    const briefcaseDb = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });
    briefcaseDb.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    const briefcaseDbTxn = new EditTxn(briefcaseDb, "ivault write");
    briefcaseDbTxn.start();
    let firstNonRootElement = { id: undefined, codeValue: "test" };
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    briefcaseDb.withPreparedStatement("SELECT * from Bis.Element LIMIT 1 OFFSET 1", (stmt: DMSqlStatement) => {
      if (stmt.step() === DbResult.BE_SQLITE_ROW) {
        firstNonRootElement = stmt.getRow();
      }
    });
    // make change to the briefcaseDb that does not affect code, e.g., save file property
    // expect no error from verifyCode
    expect(() => briefcaseDbTxn.saveFileProperty({ name: "codeServiceProp", namespace: "codeService", id: 1, subId: 1 }, "codeService test")).to.not.throw();
    // make change to the briefcaseDb that affects code that will invoke verifyCode, e.g., update an element with a non-null code
    // expect error from verifyCode
    let newProps = { id: firstNonRootElement.id, code: { ...Code.createEmpty(), value: firstNonRootElement.codeValue }, classFullName: undefined, model: undefined };
    await briefcaseDb.locks.acquireLocks({ exclusive: firstNonRootElement.id });
    expect(() => briefcaseDbTxn.updateElement(newProps)).to.throw(CodeService.Error);
    // make change to the briefcaseDb that will invoke verifyCode with a null(empty) code, e.g., update an element with a null(empty) code
    // expect no error from verifyCode
    newProps = { id: firstNonRootElement.id, code: Code.createEmpty(), classFullName: undefined, model: undefined };
    expect(() => briefcaseDbTxn.updateElement(newProps)).to.not.throw();
    briefcaseDb.close();
    // throw "NoCodeIndex", this error should get ignored because it means the iVault isn't enforcing codes. updating an element with an empty code and a non empty code should work without issue.
    CodeService.createForIVault = async () => {
      throw new CodeService.Error("NoCodeIndex", 0x10000 + 1, " ");
    };
    const briefcaseDb2 = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });
    briefcaseDb2.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    const briefcaseDb2Txn = new EditTxn(briefcaseDb2, "ivault write");
    briefcaseDb2Txn.start();
    await briefcaseDb2.locks.acquireLocks({ exclusive: firstNonRootElement.id });
    // expect no error from verifyCode for empty code
    expect(() => briefcaseDb2Txn.updateElement(newProps)).to.not.throw();
    newProps = { id: firstNonRootElement.id, code: { ...Code.createEmpty(), value: firstNonRootElement.codeValue }, classFullName: undefined, model: undefined };
    // make change to the briefcaseDb that affects code that will invoke verifyCode, e.g., update an element with a non-null code
    // expect no error from verifyCode
    expect(() => briefcaseDb2Txn.updateElement(newProps)).to.not.throw();
    // clean up
    CodeService.createForIVault = originalCreateForIVault;
    briefcaseDb2.close();
  });

  it("clear cache on schema changes", async () => {
    const adminToken = await HubWrappers.getAccessToken(TestUserType.SuperManager);
    const userToken = await HubWrappers.getAccessToken(TestUserType.Super);
    // Delete any existing iVaults with the same name as the OptimisticConcurrencyTest iVault
    const iVaultName = "SchemaChanges";

    // Create a new empty iVault on the Hub & obtain a briefcase
    const rwIVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject" });
    assert.isNotEmpty(rwIVaultId);
    const rwIVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: adminToken });
    const rwTxn = new EditTxn(rwIVault, "ivault write");

    const rwIVault2 = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId: rwIVaultId, accessToken: userToken });
    const rwTxn2 = new EditTxn(rwIVault2, "ivault write");
    rwTxn2.start();

    // enable change tracking
    assert.equal(rwIVault[_nativeDb].enableChangesetSizeStats(true), DbResult.BE_SQLITE_OK);
    assert.equal(rwIVault2[_nativeDb].enableChangesetSizeStats(true), DbResult.BE_SQLITE_OK);

    const schema = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="s" typeName="string"/>
        </DMEntityClass>
    </DMSchema>`;
    await rwIVault.importSchemaStrings([schema]);
    rwIVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    rwIVault2.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    rwTxn.start();
    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ description: "schema changeset", accessToken: adminToken });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
      const changesets = await HubMock.queryChangesets({ iVaultId: rwIVaultId, accessToken: superAccessToken });
      assert.equal(changesets.length, 1);
    }
    const codeProps = Code.createEmpty();
    codeProps.value = "DrawingModel";
    let totalEl = 0;
    await rwIVault.locks.acquireLocks({ shared: IVault.dictionaryId });
    const [, drawingModelId] = IVaultTestUtils.createAndInsertDrawingPartitionAndModel(rwTxn, codeProps, true);
    let drawingCategoryId = DrawingCategory.queryCategoryIdByName(rwIVault, IVault.dictionaryId, "MyDrawingCategory");
    if (undefined === drawingCategoryId)
      drawingCategoryId = DrawingCategory.insert(rwTxn, IVault.dictionaryId, "MyDrawingCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

    const insertElements = (txn: EditTxn, className: string = "Test2dElement", noOfElements: number = 10, userProp: (n: number) => object) => {
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

    insertElements(rwTxn, "Test2dElement", 10, (n: number) => {
      return { s: `s-${n}` };
    });

    assert.equal(3889, rwIVault[_nativeDb].getChangesetSize());
    rwTxn.saveChanges("user 1: data changeset");

    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ description: "10 instances of test2dElement", accessToken: adminToken });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
      const changesets = await HubMock.queryChangesets({ iVaultId: rwIVaultId, accessToken: superAccessToken });
      assert.equal(changesets.length, 2);
    }
    let rows: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    rwIVault.withPreparedStatement("SELECT * FROM TestDomain.Test2dElement", (stmt: DMSqlStatement) => {
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rows.push(stmt.getRow());
      }
    });
    assert.equal(rows.length, 10);
    assert.equal(rows.map((r) => r.s).filter((v) => v).length, 10);
    rows = [];
    for await (const queryRow of rwIVault.createQueryReader("SELECT * FROM TestDomain.Test2dElement", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      rows.push(queryRow.toRow());
    }
    assert.equal(rows.length, 10);
    assert.equal(rows.map((r) => r.s).filter((v) => v).length, 10);
    if (true || "user pull/merge") {
      // pull and merge changes
      await rwIVault2.pullChanges({ accessToken: userToken });
      rows = [];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      rwIVault2.withPreparedStatement("SELECT * FROM TestDomain.Test2dElement", (stmt: DMSqlStatement) => {
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          rows.push(stmt.getRow());
        }
      });
      assert.equal(rows.length, 10);
      assert.equal(rows.map((r) => r.s).filter((v) => v).length, 10);
      rows = [];
      for await (const queryRow of rwIVault2.createQueryReader("SELECT * FROM TestDomain.Test2dElement", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
        rows.push(queryRow.toRow());
      }
      assert.equal(rows.length, 10);
      assert.equal(rows.map((r) => r.s).filter((v) => v).length, 10);
      // create some element and push those changes
      await rwIVault2.locks.acquireLocks({ shared: drawingModelId });
      insertElements(rwTxn2, "Test2dElement", 10, (n: number) => {
        return { s: `s-${n}` };
      });
      assert.equal(0, rwIVault[_nativeDb].getChangesetSize());
      rwTxn2.saveChanges("user 2: data changeset");

      if (true || "push changes") {
        // Push the changes to the hub
        const prePushChangeSetId = rwIVault2.changeset.id;
        await rwIVault2.pushChanges({ accessToken: userToken, description: "10 instances of test2dElement" });
        const postPushChangeSetId = rwIVault2.changeset.id;
        assert(!!postPushChangeSetId);
        expect(prePushChangeSetId !== postPushChangeSetId);
        const changesets = await HubMock.queryChangesets({ iVaultId: rwIVaultId, accessToken: userToken });
        assert.equal(changesets.length, 3);
      }
    }
    await rwIVault.pullChanges({ accessToken: adminToken });
    // second schema import ==============================================================
    const schemaV2 = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.01" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="Test2dElement">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="s" typeName="string"/>
            <DMProperty propertyName="v" typeName="string"/>
        </DMEntityClass>
        <DMEntityClass typeName="Test2dElement2nd">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
            <DMProperty propertyName="t" typeName="string"/>
            <DMProperty propertyName="r" typeName="string"/>
        </DMEntityClass>
    </DMSchema>`;
    await rwIVault.importSchemaStrings([schemaV2]);
    assert.equal(0, rwIVault[_nativeDb].getChangesetSize());
    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ accessToken: adminToken, description: "schema changeset" });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
      const changesets = await HubMock.queryChangesets({ iVaultId: rwIVaultId, accessToken: superAccessToken });
      assert.equal(changesets.length, 4);
    }
    // create some element and push those changes
    await rwIVault.locks.acquireLocks({ shared: drawingModelId });
    insertElements(rwTxn, "Test2dElement", 10, (n: number) => {
      return {
        s: `s-${n}`, v: `v-${n}`,
      };
    });

    // create some element and push those changes
    insertElements(rwTxn, "Test2dElement2nd", 10, (n: number) => {
      return {
        t: `t-${n}`, r: `r-${n}`,
      };
    });
    assert.equal(6266, rwIVault[_nativeDb].getChangesetSize());
    rwTxn.saveChanges("user 1: data changeset");

    if (true || "push changes") {
      // Push the changes to the hub
      const prePushChangeSetId = rwIVault.changeset.id;
      await rwIVault.pushChanges({ accessToken: adminToken, description: "10 instances of test2dElement" });
      const postPushChangeSetId = rwIVault.changeset.id;
      assert(!!postPushChangeSetId);
      expect(prePushChangeSetId !== postPushChangeSetId);
      const changesets = await HubMock.queryChangesets({ iVaultId: rwIVaultId, accessToken: superAccessToken });
      assert.equal(changesets.length, 5);
    }
    rows = [];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    rwIVault.withPreparedStatement("SELECT * FROM TestDomain.Test2dElement", (stmt: DMSqlStatement) => {
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rows.push(stmt.getRow());
      }
    });
    assert.equal(rows.length, 30);
    assert.equal(rows.map((r) => r.s).filter((v) => v).length, 30);
    assert.equal(rows.map((r) => r.v).filter((v) => v).length, 10);
    rows = [];
    for await (const queryRow of rwIVault.createQueryReader("SELECT * FROM TestDomain.Test2dElement", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      rows.push(queryRow.toRow());
    }
    assert.equal(rows.length, 30);
    assert.equal(rows.map((r) => r.s).filter((v) => v).length, 30);
    assert.equal(rows.map((r) => r.v).filter((v) => v).length, 10);

    rows = [];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    rwIVault.withPreparedStatement("SELECT * FROM TestDomain.Test2dElement2nd", (stmt: DMSqlStatement) => {
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rows.push(stmt.getRow());
      }
    });
    assert.equal(rows.length, 10);
    assert.equal(rows.map((r) => r.t).filter((v) => v).length, 10);
    assert.equal(rows.map((r) => r.r).filter((v) => v).length, 10);
    rows = [];
    for await (const queryRow of rwIVault.createQueryReader("SELECT * FROM TestDomain.Test2dElement2nd", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      rows.push(queryRow.toRow());
    }
    assert.equal(rows.length, 10);
    assert.equal(rows.map((r) => r.t).filter((v) => v).length, 10);
    assert.equal(rows.map((r) => r.r).filter((v) => v).length, 10);

    if (true || "user pull/merge") {
      // pull and merge changes
      await rwIVault2.pullChanges({ accessToken: userToken });
      rows = [];
      // Following fail without the fix in briefcase manager where we clear statement cache on schema changeset apply
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      rwIVault2.withPreparedStatement("SELECT * FROM TestDomain.Test2dElement", (stmt: DMSqlStatement) => {
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          rows.push(stmt.getRow());
        }
      });
      assert.equal(rows.length, 30);
      assert.equal(rows.map((r) => r.s).filter((v) => v).length, 30);
      assert.equal(rows.map((r) => r.v).filter((v) => v).length, 10);
      rows = [];
      // Following fail without native side fix where we clear concurrent query cache on schema changeset apply
      for await (const queryRow of rwIVault2.createQueryReader("SELECT * FROM TestDomain.Test2dElement", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
        rows.push(queryRow.toRow());
      }
      assert.equal(rows.length, 30);
      assert.equal(rows.map((r) => r.s).filter((v) => v).length, 30);
      assert.equal(rows.map((r) => r.v).filter((v) => v).length, 10);
      for (const row of rows) {
        const el: any = rwIVault2.elements.getElementProps(row.id);
        assert.isDefined(el);
        if (row.s) {
          assert.equal(row.s, el.s);
        } else {
          assert.isUndefined(el.s);
        }
        if (row.v) {
          assert.equal(row.v, el.v);
        } else {
          assert.isUndefined(el.v);
        }
      }
      rows = [];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      rwIVault2.withPreparedStatement("SELECT * FROM TestDomain.Test2dElement2nd", (stmt: DMSqlStatement) => {
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          rows.push(stmt.getRow());
        }
      });
      assert.equal(rows.length, 10);
      assert.equal(rows.map((r) => r.t).filter((v) => v).length, 10);
      assert.equal(rows.map((r) => r.r).filter((v) => v).length, 10);
      for (const row of rows) {
        const el: any = rwIVault2.elements.getElementProps(row.id);
        assert.isDefined(el);
        if (row.s) {
          assert.equal(row.s, el.s);
        } else {
          assert.isUndefined(el.s);
        }
        if (row.v) {
          assert.equal(row.v, el.v);
        } else {
          assert.isUndefined(el.v);
        }
      }
      rows = [];
      for await (const queryRow of rwIVault2.createQueryReader("SELECT * FROM TestDomain.Test2dElement2nd", undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
        rows.push(queryRow.toRow());
      }
      assert.equal(rows.length, 10);
      assert.equal(rows.map((r) => r.t).filter((v) => v).length, 10);
      assert.equal(rows.map((r) => r.r).filter((v) => v).length, 10);
      for (const row of rows) {
        const el: any = rwIVault2.elements.getElementProps(row.id);
        assert.isDefined(el);
        if (row.t) {
          assert.equal(row.t, el.t);
        } else {
          assert.isUndefined(el.t);
        }
        if (row.r) {
          assert.equal(row.r, el.r);
        } else {
          assert.isUndefined(el.r);
        }
      }
    }
    rwIVault.close();
    rwIVault2.close();
  });

  it("pulling a changeset with extents changes should update the extents of the opened ivault", async () => {
    const accessToken = await HubWrappers.getAccessToken(TestUserType.Regular);
    const version0 = IVaultTestUtils.resolveAssetFile("mirukuru.ibim");
    const iVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName: "projectExtentsTest", version0 });
    const iVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId });
    const changesetIdBeforeExtentsChange = iVault.changeset.id;
    const extents = iVault.projectExtents;
    const newExtents = extents.clone();
    newExtents.low.x += 100;
    newExtents.low.y += 100;
    newExtents.high.x += 100;
    newExtents.high.y += 100;
    withEditTxn(iVault, "update project extents", (txn) => txn.updateProjectExtents(newExtents));
    await iVault.pushChanges({ description: "update project extents" });
    await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVault);
    const iVaultBeforeExtentsChange = await HubWrappers.downloadAndOpenBriefcase({ accessToken, szewTwinId, iVaultId, asOf: IVaultVersion.asOfChangeSet(changesetIdBeforeExtentsChange).toJSON() });
    const extentsBeforePull = iVaultBeforeExtentsChange.projectExtents;
    // Read the extents fileProperty.
    const extentsStrBeforePull = iVaultBeforeExtentsChange.queryFilePropertyString({ name: "Extents", namespace: "bld_Db" });
    const ecefLocationBeforeExtentsChange = iVaultBeforeExtentsChange.ecefLocation;
    await iVaultBeforeExtentsChange.pullChanges(); // Pulls the extents change.
    const extentsAfterPull = iVaultBeforeExtentsChange.projectExtents;
    const extentsStrAfterPull = iVaultBeforeExtentsChange.queryFilePropertyString({ name: "Extents", namespace: "bld_Db" });
    const ecefLocationAfterExtentsChange = iVaultBeforeExtentsChange.ecefLocation;

    expect(ecefLocationBeforeExtentsChange).to.not.be.undefined;
    expect(ecefLocationAfterExtentsChange).to.not.be.undefined;
    expect(ecefLocationBeforeExtentsChange?.isAlmostEqual(ecefLocationAfterExtentsChange!)).to.be.false;
    expect(extentsStrAfterPull).to.not.equal(extentsStrBeforePull);
    expect(extentsAfterPull.isAlmostEqual(extentsBeforePull)).to.be.false;
    await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVaultBeforeExtentsChange);
  });

  it("parent lock should suffice when inserting into deeply nested sub-model", async () => {
    const version0 = IVaultTestUtils.resolveAssetFile("test.dtw");
    const iVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName: "subModelCoveredByParentLockTest", version0 });
    let iVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId });
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    const iVaultTxn = new EditTxn(iVault, "ivault write");
    iVaultTxn.start();

    /*
    Job Subject
      +- DefinitionPartition  --  [DefinitionModel]
  */

    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });
    const jobSubjectId = IVaultTestUtils.createJobSubjectElement(iVault, "JobSubject").insert(iVaultTxn);
    const definitionModelId = DefinitionModel.insert(iVaultTxn, jobSubjectId, "Definition");

    iVaultTxn.end();
    const locks = iVault.locks;
    expect(locks.isServerBased).true;
    await iVault.pushChanges({ description: "create model" });
    expect(iVault.locks).equal(locks); // pushing should not change your locks

    /*
    Job Subject                                           <--- Lock this
      +- DefinitionPartition  --  [DefinitionModel]
                                      SpatialCategory     <=== insert this
                                      DrawingCategory             "
  */
    assert.isFalse(iVault.locks.holdsExclusiveLock(jobSubjectId));
    assert.isFalse(iVault.locks.holdsExclusiveLock(definitionModelId));
    assert.isFalse(iVault.locks.holdsSharedLock(definitionModelId));
    iVaultTxn.start();
    await iVault.locks.acquireLocks({ exclusive: jobSubjectId });
    iVault.locks.checkExclusiveLock(jobSubjectId, "", "");
    iVault.locks.checkSharedLock(jobSubjectId, "", "");
    iVault.locks.checkSharedLock(definitionModelId, "", "");
    iVault.locks.checkExclusiveLock(definitionModelId, "", "");

    const spatialCategoryId = SpatialCategory.insert(iVaultTxn, definitionModelId, "SpatialCategory", new SubCategoryAppearance()); // throws if we get locking error
    const drawingCategoryId = DrawingCategory.insert(iVaultTxn, definitionModelId, "DrawingCategory", new SubCategoryAppearance());

    assert.isTrue(iVault.elements.getElement(spatialCategoryId).model === definitionModelId);
    assert.isTrue(iVault.elements.getElement(drawingCategoryId).model === definitionModelId);

    iVaultTxn.end();
    await iVault.pushChanges({ description: "insert category" });

    /*
    Create some more nesting.

    Job Subject                                           <--- Lock this
      +- DefinitionPartition  --  [DefinitionModel]
        |                             SpatialCategory
        +- Child Subject                                                            <== Insert
            +- DocumentList         --    [DocumentListModel]                           "
                                            Drawing             -- [DrawingModel]       "
  */
    assert.isFalse(iVault.locks.holdsExclusiveLock(jobSubjectId));
    assert.isFalse(iVault.locks.holdsExclusiveLock(definitionModelId));
    assert.isFalse(iVault.locks.holdsSharedLock(definitionModelId));
    iVaultTxn.start();
    await iVault.locks.acquireLocks({ exclusive: jobSubjectId });
    iVault.locks.checkExclusiveLock(jobSubjectId, "", "");
    iVault.locks.checkSharedLock(IVault.repositoryModelId, "", "");

    const childSubjectId = Subject.insert(iVaultTxn, jobSubjectId, "Child Subject");

    const documentListModelId = DocumentListModel.insert(iVaultTxn, childSubjectId, "Document"); // creates DocumentList and DocumentListModel
    assert.isTrue(Id64.isValidId64(documentListModelId));
    const drawingModelId = Drawing.insert(iVaultTxn, documentListModelId, "Drawing"); // creates Drawing and DrawingModel

    assert.isTrue(iVault.elements.getElement(childSubjectId).parent?.id === jobSubjectId);
    assert.isTrue(iVault.elements.getElement(childSubjectId).model === IVault.repositoryModelId);
    assert.isTrue(iVault.elements.getElement(documentListModelId).parent?.id === childSubjectId);
    assert.isTrue(iVault.elements.getElement(documentListModelId).model === IVault.repositoryModelId);
    assert.isTrue(iVault.elements.getElement(drawingModelId).model === documentListModelId);

    iVaultTxn.end();
    await iVault.pushChanges({ description: "insert doc list with nested drawing model" });

    /*
    Verify that even a deeply nested insertion is covered by the exclusive lock on the top-level parent.

    Job Subject                                           <--- Lock this
      +- DefinitionPartition  --  DefinitionModel
        |                             SpatialCategory
        +- Child Subject
            +- DocumentList         --    [DocumentListModel]
                                            Drawing             -- [DrawingModel]
                                                                      DrawingGraphic   <== Insert this
  */
    assert.isFalse(iVault.locks.holdsExclusiveLock(jobSubjectId));
    assert.isFalse(iVault.locks.holdsExclusiveLock(definitionModelId));
    assert.isFalse(iVault.locks.holdsSharedLock(definitionModelId));
    assert.isFalse(iVault.locks.holdsSharedLock(documentListModelId));
    assert.isFalse(iVault.locks.holdsSharedLock(drawingModelId));
    iVaultTxn.start();
    await iVault.locks.acquireLocks({ exclusive: jobSubjectId });
    iVault.locks.checkExclusiveLock(jobSubjectId, "", "");
    iVault.locks.checkSharedLock(IVault.repositoryModelId, "", "");
    iVault.locks.checkSharedLock(documentListModelId, "", "");
    iVault.locks.checkSharedLock(drawingModelId, "", "");

    const drawingGraphicProps1: GeometricElement2dProps = {
      classFullName: DrawingGraphic.classFullName,
      model: drawingModelId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      userLabel: "DrawingGraphic1",
      geom: IVaultTestUtils.createRectangle(Point2d.create(1, 1)),
      placement: { origin: Point2d.create(2, 2), angle: 0 },
    };
    const drawingGraphicId1 = iVaultTxn.insertElement(drawingGraphicProps1);

    assert.isTrue(iVault.elements.getElement(drawingGraphicId1).model === drawingModelId);
    iVaultTxn.end();
    expect(iVault.locks.holdsExclusiveLock(drawingModelId)).true;

    const fileName = iVault[_nativeDb].getFilePath();
    iVault.close(); // close rw
    iVault = await BriefcaseDb.open({ fileName, readonly: true }); // reopen readonly
    expect(iVault.locks.isServerBased).false; // readonly sessions should not have server based locks

    // verify we can push changes from a readonly briefcase
    await iVault.pushChanges({ description: "insert graphic into nested sub-model" });

    // try it again to verify we can get the ServerBasedLocks again
    await iVault.pushChanges({ description: "should do nothing" });
    iVault.close();

    // reopen readwrite to verify we released all locks from readonly briefcase
    iVault = await BriefcaseDb.open({ fileName });
    expect(iVault.locks.isServerBased).true;
    const serverLocks = iVault.locks as ServerBasedLocks;
    expect(serverLocks.holdsExclusiveLock(drawingModelId)).false;
    expect(serverLocks.getLockCount(LockState.Shared)).equal(0);
    expect(serverLocks.getLockCount(LockState.Exclusive)).equal(0);
    iVault.close();

  });

});



