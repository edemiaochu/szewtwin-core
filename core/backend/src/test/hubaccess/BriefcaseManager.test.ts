/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { Guid } from "@szewtwin/core-szewec";
import { BriefcaseIdValue } from "@szewtwin/core-common";
import { Element } from "../../Element";
import { HubWrappers, IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubMock } from "../../internal/HubMock";
import { TestChangeSetUtility } from "../TestChangeSetUtility";
import { _nativeDb, ChannelControl } from "../../core-backend";
import { withEditTxn } from "../../EditTxn";

describe("BriefcaseManager", async () => {
  const testSZEWTwinId: string = Guid.createValue();
  const managerAccessToken = "manager mock token";
  const accessToken = "access token";

  // contested version0 files can cause errors that cause tests to not call shutdown, so always do it here
  afterEach(() => HubMock.shutdown());

  it("Open iVaults with various names causing potential issues on Windows/Unix", async () => {
    HubMock.startup("bad names", KnownTestLocations.outputDir);
    let iVaultName = "iVault Name With Spaces";
    let iVaultId = await HubWrappers.createIVault(managerAccessToken, testSZEWTwinId, iVaultName);
    const args = { accessToken, szewTwinId: testSZEWTwinId, iVaultId };
    assert.isDefined(iVaultId);
    let iVault = await HubWrappers.openCheckpointUsingRpc(args);
    assert.isDefined(iVault);

    iVaultName = "iVault Name With :\/<>?* Characters";
    iVaultId = await HubWrappers.createIVault(managerAccessToken, testSZEWTwinId, iVaultName);
    assert.isDefined(iVaultId);
    iVault = await HubWrappers.openCheckpointUsingRpc(args);
    assert.isDefined(iVault);

    iVaultName = "iVault Name Thats Excessively Long " +
      "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789" +
      "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789" +
      "01234567890123456789"; // 35 + 2*100 + 20 = 255
    // Note: iVaultHub does not accept a name that's longer than 255 characters.
    assert.equal(255, iVaultName.length);
    iVaultId = await HubWrappers.createIVault(managerAccessToken, testSZEWTwinId, iVaultName);
    assert.isDefined(iVaultId);
    iVault = await HubWrappers.openCheckpointUsingRpc(args);
    assert.isDefined(iVault);
    iVault.close();
  });

  it("should set appropriate briefcase ids for FixedVersion, PullOnly and PullAndPush workflows", async () => {
    HubMock.startup("briefcaseIds", KnownTestLocations.outputDir);
    const iVaultId = await HubWrappers.createIVault(accessToken, testSZEWTwinId, "ivault1");
    const args = { accessToken, szewTwinId: testSZEWTwinId, iVaultId, deleteFirst: true };
    const iVault1 = await HubWrappers.openCheckpointUsingRpc(args);
    assert.equal(BriefcaseIdValue.Unassigned, iVault1.getBriefcaseId(), "checkpoint should be 0");

    try {
      const iVaultFailure = await HubWrappers.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVaultFailure);
      assert.fail("iVaultFailure should fail due to iVault1 already being open as a SnapshotDb");
    } catch (err: any) {
      assert.isTrue(err.message.includes("iVault is already open as a SnapshotDb"), "iVaultFailure failure must be due to db being open as a SnapshotDb");
    }
    await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVault1);
    const iVault2 = await HubWrappers.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
    assert.equal(BriefcaseIdValue.Unassigned, iVault2.briefcaseId, "pullOnly should be 0");

    const iVault2Dup = await HubWrappers.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });

    const iVault3 = await HubWrappers.openBriefcaseUsingRpc(args);
    assert.isTrue(iVault3.briefcaseId >= BriefcaseIdValue.FirstValid && iVault3.briefcaseId <= BriefcaseIdValue.LastValid, "valid briefcaseId");

    await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVault2);
    try {
      await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVault2Dup);
      assert.fail("iVault2Dup failure should fail due to already being closed when iVault2 closed");
    } catch (err: any) {
      assert.isTrue(err.message.includes("db is not open"), "iVault2Dup failure must be due to db not being open");
    }
    await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVault3);
  });

  it("should reuse a briefcaseId when re-opening iVaults for pullAndPush workflows", async () => {
    HubMock.startup("briefcaseIdsReopen", KnownTestLocations.outputDir);
    const iVaultId = await HubWrappers.createIVault(accessToken, testSZEWTwinId, "ivault1");

    const args = { accessToken, szewTwinId: testSZEWTwinId, iVaultId, deleteFirst: false };
    const iVault1 = await HubWrappers.openBriefcaseUsingRpc(args);
    const briefcaseId1 = iVault1.briefcaseId;
    iVault1.close(); // Keeps the briefcase by default

    const iVault3 = await HubWrappers.openBriefcaseUsingRpc(args);
    const briefcaseId3 = iVault3.briefcaseId;
    assert.strictEqual(briefcaseId3, briefcaseId1);

    await HubWrappers.closeAndDeleteBriefcaseDb(accessToken, iVault3);
  });

  it("should reuse a briefcaseId when re-opening iVaults of different versions for pullAndPush and pullOnly workflows", async () => {
    HubMock.startup("workflow", KnownTestLocations.outputDir);
    const userToken1 = "manager token";
    const userToken2 = "super manager token";

    // User1 creates an iVault on the Hub
    const testUtility = new TestChangeSetUtility(userToken1, IVaultTestUtils.generateUniqueName("BriefcaseReuseTest"));
    await testUtility.createTestIVault();

    // User2 opens and then closes the iVault pullOnly/pullPush, keeping the briefcase
    const args = { accessToken: userToken2, szewTwinId: testUtility.szewTwinId, iVaultId: testUtility.iVaultId };
    const iVaultPullAndPush = await HubWrappers.openBriefcaseUsingRpc(args);
    const briefcaseIdPullAndPush: number = iVaultPullAndPush.briefcaseId;
    const changesetPullAndPush = iVaultPullAndPush.changeset;
    iVaultPullAndPush.close();

    const iVaultPullOnly = await HubWrappers.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
    const briefcaseIdPullOnly: number = iVaultPullOnly.briefcaseId;
    const changesetPullOnly = iVaultPullOnly.changeset;
    iVaultPullOnly.close();

    // User1 pushes a change set
    await testUtility.pushTestChangeSet();

    // User 2 reopens the iVault pullOnly/pullPush => Expect the same briefcase to be re-used, but the changeset should have been updated!!
    const iVaultPullAndPush2 = await HubWrappers.openBriefcaseUsingRpc(args);
    const briefcaseIdPullAndPush2: number = iVaultPullAndPush2.briefcaseId;
    assert.strictEqual(briefcaseIdPullAndPush2, briefcaseIdPullAndPush);
    const changesetPullAndPush2 = iVaultPullAndPush2.changeset;
    assert.notStrictEqual(changesetPullAndPush2, changesetPullAndPush);
    await HubWrappers.closeAndDeleteBriefcaseDb(userToken2, iVaultPullAndPush2);

    const iVaultPullOnly2 = await HubWrappers.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
    const briefcaseIdPullOnly2: number = iVaultPullOnly2.briefcaseId;
    assert.strictEqual(briefcaseIdPullOnly2, briefcaseIdPullOnly);
    const changesetPullOnly2 = iVaultPullOnly2.changeset;
    assert.notStrictEqual(changesetPullOnly2, changesetPullOnly);
    await HubWrappers.closeAndDeleteBriefcaseDb(userToken2, iVaultPullOnly2);

    // Delete iVault from the Hub and disk
    await testUtility.deleteTestIVault();
  });

  it("should be able to edit a PullAndPush briefcase, reopen it as of a new version, and then push changes", async () => {
    HubMock.startup("pullPush", KnownTestLocations.outputDir);
    const userToken1 = "manager token"; // User1 is just used to create and update the iVault
    const userToken2 = "super manager token"; // User2 is used for the test

    // User1 creates an iVault on the Hub
    const testUtility = new TestChangeSetUtility(userToken1, "PullAndPushTest");
    await testUtility.createTestIVault();

    // User2 opens the iVault pullAndPush and is able to edit and save changes
    const args = { accessToken: userToken2, szewTwinId: testUtility.szewTwinId, iVaultId: testUtility.iVaultId };
    let iVaultPullAndPush = await HubWrappers.openBriefcaseUsingRpc(args);
    assert.exists(iVaultPullAndPush);
    const briefcaseId = iVaultPullAndPush.briefcaseId;
    const pathname = iVaultPullAndPush.pathName;

    iVaultPullAndPush.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    const rootEl: Element = iVaultPullAndPush.elements.getRootSubject();
    rootEl.userLabel = `${rootEl.userLabel}changed`;
    withEditTxn(iVaultPullAndPush, (txn) => txn.updateElement(rootEl.toJSON()));

    assert.isFalse(iVaultPullAndPush[_nativeDb].hasUnsavedChanges());
    assert.isTrue(iVaultPullAndPush[_nativeDb].hasPendingTxns());

    iVaultPullAndPush.close();

    // User2 should be able to re-open the iVault pullAndPush again
    // - the changes will still be there
    iVaultPullAndPush = await HubWrappers.openBriefcaseUsingRpc(args);
    const changesetPullAndPush = iVaultPullAndPush.changeset;
    assert.strictEqual(iVaultPullAndPush.briefcaseId, briefcaseId);
    assert.strictEqual(iVaultPullAndPush.pathName, pathname);
    assert.isFalse(iVaultPullAndPush[_nativeDb].hasUnsavedChanges());
    assert.isTrue(iVaultPullAndPush[_nativeDb].hasPendingTxns());

    // User1 pushes a change set
    await testUtility.pushTestChangeSet();

    // User2 should be able to re-open the iVault
    await HubWrappers.openBriefcaseUsingRpc(args);

    // User2 closes and reopens the iVault pullAndPush as of the newer version
    // - the changes will still be there, AND
    // - the briefcase will be upgraded to the newer version since it was closed and re-opened.
    iVaultPullAndPush.close();
    iVaultPullAndPush = await HubWrappers.openBriefcaseUsingRpc(args);
    const changesetPullAndPush3 = iVaultPullAndPush.changeset;
    assert.notStrictEqual(changesetPullAndPush3, changesetPullAndPush);
    assert.strictEqual(iVaultPullAndPush.briefcaseId, briefcaseId);
    assert.strictEqual(iVaultPullAndPush.pathName, pathname);
    assert.isFalse(iVaultPullAndPush[_nativeDb].hasUnsavedChanges());
    assert.isTrue(iVaultPullAndPush[_nativeDb].hasPendingTxns());

    // User2 should be able to push the changes now
    await iVaultPullAndPush.pushChanges({ accessToken: userToken2, description: "test change" });
    const changesetPullAndPush4 = iVaultPullAndPush.changeset;
    assert.notStrictEqual(changesetPullAndPush4, changesetPullAndPush3);

    // Delete iVault from the Hub and disk
    await HubWrappers.closeAndDeleteBriefcaseDb(userToken2, iVaultPullAndPush);
    await testUtility.deleteTestIVault();
  });
});
