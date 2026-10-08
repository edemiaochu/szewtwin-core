/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { Guid, GuidString } from "@szewtwin/core-szewec";
import {
  ChangesetFileProps, ChangesetIndex, ChangesetIndexOrId, ChangesetProps, ChangesetRange, IVaultVersion, LocalDirName,
} from "@szewtwin/core-common";
import {
  AcquireNewBriefcaseIdArg,
  BackendHubAccess, BriefcaseDbArg, BriefcaseIdArg, ChangesetArg, CreateNewIVaultProps, DownloadChangesetArg, DownloadChangesetRangeArg, IVaultIdArg, IVaultNameArg,
  LockMap, LockProps, V2CheckpointAccessProps,
} from "../BackendHubAccess";
import { CheckpointProps, DownloadRequest, MockCheckpoint, ProgressFunction, ProgressStatus, V2CheckpointManager } from "../CheckpointManager";
import { IVaultHost } from "../IVaultHost";
import { IVaultJsFs } from "../IVaultJsFs";
import { LocalHub } from "../LocalHub";
import { TokenArg } from "../IVaultDb";
import { _getHubAccess, _mockCheckpoint, _setHubAccess } from "./Symbols";
import { BriefcaseManager } from "../BriefcaseManager";
import * as path from "path";

function wasStarted(val: string | undefined): asserts val is string {
  if (undefined === val)
    throw new Error("Call HubMock.startup first");
}

function doDownload(args: { iVaultId: string, changeset: ChangesetIndexOrId, targetFile: string }) {
  HubMock.findLocalHub(args.iVaultId).downloadCheckpoint(args);
}
const mockCheckpoint: MockCheckpoint = {
  mockAttach: (checkpoint: CheckpointProps) => {
    const targetFile = path.join(BriefcaseManager.getBriefcaseBasePath(checkpoint.iVaultId), `${checkpoint.changeset.index}.bim`);
    doDownload({ ...checkpoint, targetFile })
    return targetFile;
  },

  mockDownload: (request: DownloadRequest) => {
    doDownload({ ...request.checkpoint, targetFile: request.localFile });
  }
};

/**
 * Mocks iVaultHub for testing creating Briefcases, downloading checkpoints, and simulating multiple users pushing and pulling changesets, etc.
 *
 * Generally, tests for apis that *create or modify* iVaults can and should be mocked. Otherwise they:
 * - create tremendous load on the test servers when they run on programmer's desktops and in CI jobs
 * - waste network and data center resources (i.e. $$$s),
 * - interfere with other tests running on the same or other systems, and
 * - (far worse) are the source of test flakiness outside of the api being tested.
 *
 * This class can be used to create tests that do not require authentication, are synchronous,
 * are guaranteed to be self-contained (i.e. do not interfere with other tests running at the same time or later), and do not fail for reasons outside
 * of the control of the test itself. As a bonus, in addition to making tests more reliable, mocking IVaultHub generally makes tests run *much* faster.
 *
 * On the other hand, tests that expect to find an existing iVaults, checkpoints, changesets, etc. in IVaultHub cannot be mocked. In that case, those tests
 * should be careful to NOT modify the data, since doing so causes interference with other tests running simultaneously. These tests should be limited to
 * low level testing of the core apis only.
 *
 * To initialize HubMock, call [[startup]] at the beginning of your test, usually in `describe.before`. Thereafter, all access to iVaultHub for an iVault will be
 * directed to a [[LocalHub]] - your test code does not change. After the test(s) complete, call [[shutdown]] (usually in `describe.after`) to stop mocking IVaultHub and clean
 * up any resources used by the test(s). If you want to mock a single test, call [[startup]] as the first line and [[shutdown]] as the last. If you wish to run the
 * test against a "real" IVaultHub, you can simply comment off the call [[startup]], though in that case you should make sure the name of your
 * iVault is unique so your test won't collide with other tests (iVault name uniqueness is not necessary for mocked tests.)
 *
 * Mocked tests must always start by creating a new iVault via [[IVaultHost[_hubAccess].createNewIVault]] with a `version0` iVault.
 * They use mock (aka "bogus") credentials for `AccessTokens`, which is fine since [[HubMock]] never accesses resources outside the current
 * computer.
 *
 * @note Only one HubMock at a time, *running in a single process*, may be active. The comments above about multiple simultaneous tests refer to tests
 * running on different computers, or on a single computer in multiple processes. All of those scenarios are problematic without mocking.
 *
 * @internal
 */
export class HubMock {
  private static mockRoot: LocalDirName | undefined;
  private static hubs = new Map<string, LocalHub>();
  private static _saveHubAccess: BackendHubAccess | undefined;
  private static _szewTwinId: GuidString | undefined;

  /** Determine whether a test us currently being run under HubMock */
  public static get isValid() { return undefined !== this.mockRoot; }
  public static get szewTwinId() {
    wasStarted(this._szewTwinId);
    return this._szewTwinId;
  }

  /**
   * Begin mocking IVaultHub access. After this call, all access to IVaultHub will be directed to a [[LocalHub]].
   * @param mockName a unique name (e.g. "MyTest") for this HubMock to disambiguate tests when more than one is simultaneously active.
   * It is used to create a private directory used by the HubMock for a test. That directory is removed when [[shutdown]] is called.
   */
  public static startup(mockName: LocalDirName, outputDir: string) {
    if (this.isValid)
      throw new Error("Either a previous test did not call HubMock.shutdown() properly, or more than one test is simultaneously attempting to use HubMock, which is not allowed");

    this.hubs.clear();
    this.mockRoot = join(outputDir, "HubMock", mockName);
    IVaultJsFs.recursiveMkDirSync(this.mockRoot);
    IVaultJsFs.purgeDirSync(this.mockRoot);
    this._saveHubAccess = IVaultHost[_getHubAccess]();

    IVaultHost[_setHubAccess](this);
    HubMock._szewTwinId = Guid.createValue(); // all iVaults for this test get the same "szewTwinId"

    V2CheckpointManager[_mockCheckpoint] = mockCheckpoint;
  }

  /** Stop a HubMock that was previously started with [[startup]]
   * @note this function throws an exception if any of the iVaults used during the tests are left open.
   */
  public static shutdown() {
    if (this.mockRoot === undefined)
      return;

    V2CheckpointManager[_mockCheckpoint] = undefined;

    HubMock._szewTwinId = undefined;
    for (const hub of this.hubs)
      hub[1].cleanup();

    this.hubs.clear();
    IVaultJsFs.purgeDirSync(this.mockRoot);
    IVaultJsFs.removeSync(this.mockRoot);
    IVaultHost[_setHubAccess](this._saveHubAccess);
    this.mockRoot = undefined;
  }

  public static findLocalHub(iVaultId: GuidString): LocalHub {
    const hub = this.hubs.get(iVaultId);
    if (!hub)
      throw new Error(`local hub for iVault ${iVaultId} not created`);
    return hub;
  }

  /** create a [[LocalHub]] for an iVault.  */
  public static async createNewIVault(arg: CreateNewIVaultProps): Promise<GuidString> {
    wasStarted(this.mockRoot);
    const props = { ...arg, iVaultId: Guid.createValue() };
    const mock = new LocalHub(join(this.mockRoot, props.iVaultId), props);
    this.hubs.set(props.iVaultId, mock);
    return props.iVaultId;
  }

  /** remove the [[LocalHub]] for an iVault */
  public static destroy(iVaultId: GuidString) {
    this.findLocalHub(iVaultId).cleanup();
    this.hubs.delete(iVaultId);
  }

  /** All methods below are mocks of the [[BackendHubAccess]] interface */

  public static async getChangesetFromNamedVersion(arg: IVaultIdArg & { versionName: string }): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iVaultId).findNamedVersion(arg.versionName);
  }

  private static changesetIndexFromArg(arg: ChangesetArg) {
    return (undefined !== arg.changeset.index) ? arg.changeset.index : this.findLocalHub(arg.iVaultId).getChangesetIndex(arg.changeset.id);
  }

  public static async getChangesetFromVersion(arg: IVaultIdArg & { version: IVaultVersion }): Promise<ChangesetProps> {
    const hub = this.findLocalHub(arg.iVaultId);
    const version = arg.version;
    if (version.isFirst)
      return hub.getChangesetByIndex(0);

    const asOf = version.getAsOfChangeSet();
    if (asOf)
      return hub.getChangesetById(asOf);

    const versionName = version.getName();
    if (versionName)
      return hub.findNamedVersion(versionName);

    return hub.getLatestChangeset();
  }

  public static async getLatestChangeset(arg: IVaultIdArg): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iVaultId).getLatestChangeset();
  }

  private static async getAccessToken(arg: TokenArg) {
    return arg.accessToken ?? await IVaultHost.getAccessToken();
  }

  public static async getMyBriefcaseIds(arg: IVaultIdArg): Promise<number[]> {
    const accessToken = await this.getAccessToken(arg);
    return this.findLocalHub(arg.iVaultId).getBriefcaseIds(accessToken);
  }

  public static async acquireNewBriefcaseId(arg: AcquireNewBriefcaseIdArg): Promise<number> {
    const accessToken = await this.getAccessToken(arg);
    return this.findLocalHub(arg.iVaultId).acquireNewBriefcaseId(accessToken, arg.briefcaseAlias);
  }

  /** Release a briefcaseId. After this call it is illegal to generate changesets for the released briefcaseId. */
  public static async releaseBriefcase(arg: BriefcaseIdArg): Promise<void> {
    return this.findLocalHub(arg.iVaultId).releaseBriefcaseId(arg.briefcaseId);
  }

  public static async downloadChangeset(arg: DownloadChangesetArg): Promise<ChangesetFileProps> {
    const changesetProps = this.findLocalHub(arg.iVaultId).downloadChangeset({ index: this.changesetIndexFromArg(arg), targetDir: arg.targetDir });

    if (arg.progressCallback) {
      const totalSize = IVaultJsFs.lstatSync(changesetProps.pathname)?.size;
      if (totalSize)
        await HubMock.mockProgressReporting(arg.progressCallback, totalSize);
    }

    return changesetProps;
  }

  public static async downloadChangesets(arg: DownloadChangesetRangeArg): Promise<ChangesetFileProps[]> {
    const changesetProps = this.findLocalHub(arg.iVaultId).downloadChangesets({ range: arg.range, targetDir: arg.targetDir });

    if (arg.progressCallback) {
      const totalSize = changesetProps.reduce((sum, props) => sum + (IVaultJsFs.lstatSync(props.pathname)?.size ?? 0), 0);
      await HubMock.mockProgressReporting(arg.progressCallback, totalSize);
    }

    return changesetProps;
  }

  public static async queryChangeset(arg: ChangesetArg): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iVaultId).getChangesetByIndex(this.changesetIndexFromArg(arg));
  }

  public static async queryChangesets(arg: IVaultIdArg & { range?: ChangesetRange }): Promise<ChangesetProps[]> {
    return this.findLocalHub(arg.iVaultId).queryChangesets(arg.range);
  }

  public static async pushChangeset(arg: IVaultIdArg & { changesetProps: ChangesetFileProps }): Promise<ChangesetIndex> {
    return this.findLocalHub(arg.iVaultId).addChangeset(arg.changesetProps);
  }

  public static async queryV2Checkpoint(arg: CheckpointProps): Promise<V2CheckpointAccessProps | undefined> {
    return {
      accountName: "none",
      sasToken: "none",
      containerId: Guid.createValue(),
      dbName: `${arg.changeset.index ?? 0}.bim`,
      storageType: "mock",
      isMock: true,
      checkpoint: arg,
    } as V2CheckpointAccessProps;
  }

  public static async releaseAllLocks(arg: BriefcaseDbArg) {
    const hub = this.findLocalHub(arg.iVaultId);
    hub.releaseAllLocks({ briefcaseId: arg.briefcaseId, changesetIndex: hub.getIndexFromChangeset(arg.changeset) });
  }

  public static async abandonAllLocks(arg: BriefcaseIdArg): Promise<void> {
    const hub = this.findLocalHub(arg.iVaultId);
    hub.abandonAllLocks(arg);
  }

  public static async queryAllLocks(_arg: BriefcaseDbArg): Promise<LockProps[]> {
    return [];
  }

  public static async acquireLocks(arg: BriefcaseDbArg, locks: LockMap): Promise<void> {
    this.findLocalHub(arg.iVaultId).acquireLocks(locks, arg);
  }

  public static async abandonLocks(arg: BriefcaseIdArg, locks: LockMap): Promise<void> {
    this.findLocalHub(arg.iVaultId).abandonLocks(locks, arg);
  }

  public static async queryIVaultByName(arg: IVaultNameArg): Promise<GuidString | undefined> {
    for (const hub of this.hubs) {
      const localHub = hub[1];
      if (localHub.szewTwinId === arg.szewTwinId && localHub.iVaultName === arg.iVaultName)
        return localHub.iVaultId;
    }
    return undefined;
  }

  public static async deleteIVault(arg: IVaultIdArg & { szewTwinId: GuidString }): Promise<void> {
    return this.destroy(arg.iVaultId);
  }

  private static async mockProgressReporting(progressCallback: ProgressFunction, totalSize: number): Promise<void> {
    await new Promise((resolve, reject) => {
      let rejected = false;

      const mockProgress = (index: number) => {
        const bytesDownloaded = Math.floor(totalSize * (index / 4));
        if (!rejected && progressCallback(bytesDownloaded, totalSize) === ProgressStatus.Abort) {
          rejected = true;
          reject(new Error("AbortError"));
        }
      };

      mockProgress(1);
      setTimeout(() => mockProgress(2), 50);
      setTimeout(() => mockProgress(3), 100);
      setTimeout(() => {
        mockProgress(4);
        resolve(undefined);
      }, 150);
    });
  }
}
