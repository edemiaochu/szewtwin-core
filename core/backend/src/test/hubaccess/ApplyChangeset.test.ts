/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { HubWrappers, IVaultTestUtils, KnownTestLocations } from "..";
import { _nativeDb, BriefcaseDb, BriefcaseManager, ChannelControl, Subject, SubjectOwnsSubjects } from "../../core-backend";
import { withEditTxn } from "../../EditTxn";
import { HubMock } from "../../internal/HubMock";
import { Suite } from "mocha";
import { IVault, SchemaState, SubjectProps } from "@szewtwin/core-common";
import { Guid } from "@szewtwin/core-szewec";
import { TestUtils } from "../TestUtils";
chai.use(chaiAsPromised);

describe("apply changesets", function (this: Suite) {
  before(async () => {
    await TestUtils.startBackend();
  });

  it("Apply changeset with no local changes, should not create new local changes", async () => {
    HubMock.startup("PullMergeMethod", KnownTestLocations.outputDir);
    let b1: BriefcaseDb | undefined;
    let b2: BriefcaseDb | undefined;
    let b3: BriefcaseDb | undefined;
    let iVaultId: string | undefined;

    try {
      iVaultId = await HubMock.createNewIVault({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultName: "Test", description: "TestSubject" });

      b1 = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId, noLock: true });
      const b1Db = b1;
      withEditTxn(b1Db, "apply changeset b1", () => {
        b1Db.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      });

      b2 = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "user2", szewTwinId: HubMock.szewTwinId, iVaultId, noLock: true });
      const b2Db = b2;
      withEditTxn(b2Db, "apply changeset b2", () => {
        b2Db.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      });

      b3 = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "user2", szewTwinId: HubMock.szewTwinId, iVaultId, noLock: true });
      const b3Db = b3;
      withEditTxn(b3Db, "apply changeset b3", () => {
        b3Db.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      });

      const schema1 = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain" alias="ts" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="a1">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
        </DMEntityClass>
        <DMEntityClass typeName="b1"> <BaseClass>a1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="b2"> <BaseClass>a1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="c1"> <BaseClass>b1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="c2"> <BaseClass>b1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="d1"> <BaseClass>b2</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="d2"> <BaseClass>b2</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="f1"> <BaseClass>d1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="f2"> <BaseClass>d1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="e1"> <BaseClass>d2</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="e2"> <BaseClass>d2</BaseClass> </DMEntityClass>
    </DMSchema>`;

      await b1.importSchemaStrings([schema1]);

      chai.expect(b1.txns.hasPendingTxns).to.be.true;
      await b1.pushChanges({ description: "schema1" });
      chai.expect(b1.txns.hasPendingTxns).to.be.false;

      chai.expect(b2.txns.hasPendingTxns).to.be.false;
      await b2.pullChanges();
      chai.expect(b2.txns.hasPendingTxns).to.be.false;

      const schema2 = `<?xml version="1.0" encoding="UTF-8"?>
    <DMSchema schemaName="TestDomain2" alias="ts1" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
        <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
        <DMEntityClass typeName="a1">
            <BaseClass>bis:GraphicalElement2d</BaseClass>
        </DMEntityClass>
        <DMEntityClass typeName="b1"> <BaseClass>a1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="b2"> <BaseClass>a1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="c1"> <BaseClass>b1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="c2"> <BaseClass>b1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="d1"> <BaseClass>b2</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="d2"> <BaseClass>b2</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="f1"> <BaseClass>d1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="f2"> <BaseClass>d1</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="e1"> <BaseClass>d2</BaseClass> </DMEntityClass>
        <DMEntityClass typeName="e2"> <BaseClass>d2</BaseClass> </DMEntityClass>
    </DMSchema>`;

      await b1.importSchemaStrings([schema2]);

      chai.expect(b1.txns.hasPendingTxns).to.be.true;
      await b1.pushChanges({ description: "schema2" });
      chai.expect(b1.txns.hasPendingTxns).to.be.false;


      chai.expect(b2.txns.hasPendingTxns).to.be.false;
      await b2.pullChanges();
      chai.expect(b2.txns.hasPendingTxns).to.be.false;


      chai.expect(b3.txns.hasPendingTxns).to.be.false;
      await b3.pullChanges();
      chai.expect(b3.txns.hasPendingTxns).to.be.false;
    } finally {
      b1?.close();
      b2?.close();
      b3?.close();
      if (iVaultId)
        await HubMock.deleteIVault({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId }).catch(() => { });
      HubMock.shutdown();
    }
  });

  it("Pulling profile upgrade before inserting element should pass", async () => {
    // startup
    HubMock.startup("ProfileUpgradeBeforeInsertElement", KnownTestLocations.outputDir);
    let b1: BriefcaseDb | undefined;
    let iVaultId: string | undefined;

    try {
      const pathname = IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw");
      iVaultId = await HubWrappers.pushIVault("user1", HubMock.szewTwinId, pathname, "Test", true);

      // inserting and updating elements in one briefcase
      b1 = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId });
      const briefcase = b1;
      withEditTxn(briefcase, "profile upgrade before insert", () => {
        briefcase.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      });

      // upgrading schemas in second briefcase
      const props = await BriefcaseManager.downloadBriefcase({ accessToken: "user2", szewTwinId: HubMock.szewTwinId, iVaultId });
      const schemaState = BriefcaseDb.validateSchemas(props.fileName, true);
      chai.assert(schemaState === SchemaState.UpgradeRecommended);
      await BriefcaseDb.upgradeSchemas({ fileName: props.fileName });
      await b1.pullChanges();

      await b1.locks.acquireLocks({
        shared: IVault.repositoryModelId,
      });
      const subjectProps: SubjectProps = {
        classFullName: Subject.classFullName,
        code: Subject.createCode(b1, IVault.rootSubjectId, "code value 1"),
        federationGuid: Guid.createValue(),
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      };
      const subjectId = withEditTxn(b1, "Inserted Subject", (txn) => txn.insertElement(subjectProps));
      await b1.pushChanges({ description: "Inserted Subject", retainLocks: true });

      const existingCode = b1.elements.getElementProps(subjectId).code;
      withEditTxn(b1, "Updated Subject", (txn) => {
        txn.updateElement({
          id: subjectId,
          code: { ...existingCode, value: "code value 2" },
        });
      });
      await b1.pushChanges({ description: "Updated Subject" });
      await b1.locks.releaseAllLocks();

    } finally {
      if (b1) {
        await b1.locks.releaseAllLocks().catch(() => { });
        b1.close();
      }
      if (iVaultId)
        await HubMock.deleteIVault({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId }).catch(() => { });
      HubMock.shutdown();
    }
  });

  it("Pulling profile upgrade after inserting element should pass", async () => {
    // startup
    HubMock.startup("ProfileUpgradeAfterInsertElement", KnownTestLocations.outputDir);
    let b1: BriefcaseDb | undefined;
    let iVaultId: string | undefined;

    try {
      const pathname = IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw");
      iVaultId = await HubWrappers.pushIVault("user1", HubMock.szewTwinId, pathname, "Test", true);

      // inserting and updating elements in one briefcase
      b1 = await HubWrappers.downloadAndOpenBriefcase({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId });
      const briefcase = b1;
      withEditTxn(briefcase, "profile upgrade after insert", () => {
        briefcase.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      });

      await b1.locks.acquireLocks({
        shared: IVault.repositoryModelId,
      });
      const subjectProps: SubjectProps = {
        classFullName: Subject.classFullName,
        code: Subject.createCode(b1, IVault.rootSubjectId, "code value 1"),
        federationGuid: Guid.createValue(),
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      };
      const subjectId = withEditTxn(b1, "Inserted Subject", (txn) => txn.insertElement(subjectProps));
      await b1.pushChanges({ description: "Inserted Subject", retainLocks: true });

      const existingCode = b1.elements.getElementProps(subjectId).code;
      withEditTxn(b1, "Updated Subject", (txn) => {
        txn.updateElement({
          id: subjectId,
          code: { ...existingCode, value: "code value 2" },
        });
      });
      await b1.pushChanges({ description: "Updated Subject" });
      await b1.locks.releaseAllLocks();

      // upgrading schemas in second briefcase
      const props = await BriefcaseManager.downloadBriefcase({ accessToken: "user2", szewTwinId: HubMock.szewTwinId, iVaultId });
      const schemaState = BriefcaseDb.validateSchemas(props.fileName, true);
      chai.assert(schemaState === SchemaState.UpgradeRecommended);
      await BriefcaseDb.upgradeSchemas({ fileName: props.fileName });
      await b1.pullChanges();

      await b1.locks.acquireLocks({
        shared: IVault.repositoryModelId,
      });
      const subjectProps2: SubjectProps = {
        classFullName: Subject.classFullName,
        code: Subject.createCode(b1, IVault.rootSubjectId, "code value 3"),
        federationGuid: Guid.createValue(),
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
      };
      withEditTxn(b1, "Inserted Subject 2", (txn) => {
        txn.insertElement(subjectProps2);
      });
      await b1.pushChanges({ description: "Inserted Subject 2", retainLocks: true });
      await b1.locks.releaseAllLocks();

    } finally {
      if (b1) {
        await b1.locks.releaseAllLocks().catch(() => { });
        b1.close();
      }
      if (iVaultId)
        await HubMock.deleteIVault({ accessToken: "user1", szewTwinId: HubMock.szewTwinId, iVaultId }).catch(() => { });
      HubMock.shutdown();
    }
  });
});
