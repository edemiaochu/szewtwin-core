/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AccessToken, GuidString } from "@szewtwin/core-szewec";
import { ColorDef, IVault, SubCategoryAppearance } from "@szewtwin/core-common";
import { BriefcaseDb, ChannelControl, SpatialCategory } from "../core-backend";
import { HubMock } from "../internal/HubMock";
import { HubWrappers, IVaultTestUtils } from "./IVaultTestUtils";
import { withEditTxn } from "../EditTxn";

/** Test utility to push an iVault and ChangeSets */
export class TestChangeSetUtility {
  private readonly _iVaultName: string;

  public szewTwinId!: GuidString;
  public iVaultId!: GuidString;
  private _iVault!: BriefcaseDb;
  private _accessToken: AccessToken;

  private _modelId!: string;
  private _categoryId!: string;

  constructor(accessToken: AccessToken, iVaultName: string) {
    this._accessToken = accessToken;
    this._iVaultName = IVaultTestUtils.generateUniqueName(iVaultName); // Generate a unique name for the iVault (so that this test can be run simultaneously by multiple users+hosts simultaneously)
  }

  private async addTestModel(): Promise<void> {
    withEditTxn(this._iVault, "Added test model", (txn) => {
      [, this._modelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, IVaultTestUtils.getUniqueModelCode(txn.iVault, "TestPhysicalModel"), true);
    });
  }

  private async addTestCategory(): Promise<void> {
    withEditTxn(this._iVault, "Added test category", (txn) => {
      this._categoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "TestSpatialCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));
    });
  }

  private async addTestElements(): Promise<void> {
    withEditTxn(this._iVault, "Added test elements", (txn) => {
      txn.insertElement(IVaultTestUtils.createPhysicalObject(txn.iVault, this._modelId, this._categoryId).toJSON());
      txn.insertElement(IVaultTestUtils.createPhysicalObject(txn.iVault, this._modelId, this._categoryId).toJSON());
    });
  }

  /** Create a new iVault, populate it, push the changes and returns the opened db.
   * Uses the szewTwinId from HubMock.
   */
  public async createTestIVault(): Promise<BriefcaseDb> {
    this.szewTwinId = HubMock.szewTwinId;

    // Re-create iVault on iVaultHub
    this.iVaultId = await HubWrappers.recreateIVault({ accessToken: this._accessToken, szewTwinId: this.szewTwinId, iVaultName: this._iVaultName, noLocks: true });

    this._iVault = await HubWrappers.downloadAndOpenBriefcase({ accessToken: this._accessToken, szewTwinId: this.szewTwinId, iVaultId: this.iVaultId });
    this._iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);

    // Populate sample data
    await this.addTestModel();
    await this.addTestCategory();
    await this.addTestElements();

    // Push changes to the hub
    await this._iVault.pushChanges({ accessToken: this._accessToken, description: "Setup test model" });
    return this._iVault;
  }

  public async pushTestChangeSet() {
    if (!this._iVault)
      throw new Error("Must first call createTestIVault");
    await this.addTestElements();
    await this._iVault.pushChanges({ accessToken: this._accessToken, description: "Added test elements" });
  }

  public async deleteTestIVault(): Promise<void> {
    if (!this._iVault)
      throw new Error("Must first call createTestIVault");
    await HubWrappers.closeAndDeleteBriefcaseDb(this._accessToken, this._iVault);
    await HubMock.deleteIVault({ accessToken: this._accessToken, szewTwinId: this.szewTwinId, iVaultId: this.iVaultId });
  }
}
