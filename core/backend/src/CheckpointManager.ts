/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */

// cspell:ignore BLOCKCACHE

import * as path from "path";
import { NativeLoggerCategory } from "@szewec/ivaultjs-native";
import { AccessToken, BeEvent, ChangeSetStatus, Guid, GuidString, IVaultStatus, Logger, LogLevel, Mutable, OpenMode, StopWatch } from "@szewtwin/core-szewec";
import {
  BriefcaseIdValue, ChangesetId, ChangesetIdWithIndex, ChangesetIndexAndId, IVaultError, IVaultVersion, LocalDirName, LocalFileName, OpenCheckpointArgs,
} from "@szewtwin/core-common";
import { V2CheckpointAccessProps } from "./BackendHubAccess";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BriefcaseManager } from "./BriefcaseManager";
import { CloudSqlite } from "./CloudSqlite";
import { IVaultHost } from "./IVaultHost";
import { IVaultJsFs } from "./IVaultJsFs";
import { SnapshotDb, TokenArg } from "./IVaultDb";
import { IVaultNative } from "./internal/NativePlatform";
import { _hubAccess, _mockCheckpoint, _nativeDb } from "./internal/Symbols";

const loggerCategory = BackendLoggerCategory.IVaultDb;

/** @internal */
export interface MockCheckpoint {
  mockAttach(checkpoint: CheckpointProps): string;
  mockDownload(_request: DownloadRequest): void;
}

/**
 * Properties of a checkpoint
 * @public
 */
export interface CheckpointProps extends TokenArg {
  readonly expectV2?: boolean;

  /** szewTwin that the iVault belongs to */
  readonly szewTwinId: GuidString;

  /** Id of the iVault */
  readonly iVaultId: GuidString;

  /** changeset for the checkpoint */
  readonly changeset: ChangesetIdWithIndex;

  /** If true, then the latest successful v2 checkpoint at or before the provided changeset will be returned when calling queryV2Checkpoint.  */
  readonly allowPreceding?: boolean;

  /** The number of seconds before the current token expires to attempt to reacquire a new token. Default is 1 hour. */
  readonly reattachSafetySeconds?: number;
}

/** Return value from [[ProgressFunction]].
 *  @public
 */
export enum ProgressStatus {
  /** Continue download. */
  Continue = 0,
  /** Abort download. */
  Abort = 1,
}

/** Called to show progress during a download. If this function returns non-zero, the download is aborted.
 *  @public
 */
export type ProgressFunction = (loaded: number, total: number) => ProgressStatus;

/** The parameters that specify a request to download a checkpoint file from iVaultHub.
 * @internal
 */
export interface DownloadRequest {
  /** name of local file to hold the downloaded data. */
  localFile: LocalFileName;

  /** A list of full fileName paths to test before downloading. If a valid file exists by one of these names,
   * no download is performed and `localFile` is updated to reflect the fact that the file exists with that name.
   * This can be used, for example, to look for checkpoints from previous versions if the naming strategy changes.
   */
  readonly aliasFiles?: ReadonlyArray<string>;

  /** Properties of the checkpoint to be downloaded */
  readonly checkpoint: CheckpointProps;

  /** If present, this function will be called to indicate progress as the briefcase is downloaded. If this
   * function returns a non-zero value, the download is aborted.
   */
  readonly onProgress?: ProgressFunction;
}

/** @internal */
export interface DownloadJob {
  request: DownloadRequest;
  promise?: Promise<any>;
}

/** @internal */
export class Downloads {
  private static _active = new Map<string, DownloadJob>();

  private static async process<T>(job: DownloadJob, fn: (job: DownloadJob) => Promise<T>) {
    const jobName = job.request.localFile; // save this, it can change inside call to `fn`!
    this._active.set(jobName, job);
    try {
      return await fn(job);
    } finally {
      this._active.delete(jobName);
    }
  }

  public static isInProgress(pathName: LocalFileName): DownloadJob | undefined {
    return this._active.get(pathName);
  }

  public static async download<T>(request: DownloadRequest, downloadFn: (job: DownloadJob) => Promise<T>) {
    const pathName = request.localFile;
    let job = this.isInProgress(pathName);
    if (undefined !== job)
      return job.promise;

    IVaultJsFs.recursiveMkDirSync(path.dirname(pathName));
    job = { request };
    return job.promise = this.process(job, downloadFn);
  }
}

/**
 * Utility class for opening V2 checkpoints from cloud containers, and also for downloading them.
 * @internal
*/
export class V2CheckpointManager {
  public static readonly cloudCacheName = "Checkpoints";
  private static _cloudCache?: CloudSqlite.CloudCache;
  private static containers = new Map<string, CloudSqlite.CloudContainer>();

  /** used by HubMock
   * @internal
   */
  public static [_mockCheckpoint]?: MockCheckpoint;


  public static getFolder(): LocalDirName {
    const cloudCachePath = path.join(BriefcaseManager.cacheDir, V2CheckpointManager.cloudCacheName);
    if (!(IVaultJsFs.existsSync(cloudCachePath))) {
      IVaultJsFs.recursiveMkDirSync(cloudCachePath);
    }
    return cloudCachePath;
  }

  /* only used by tests that reset the state of the v2CheckpointManager. all dbs should be closed before calling this function. */
  public static cleanup(): void {
    for (const [_, value] of this.containers.entries()) {
      if (value.isConnected)
        value.disconnect({ detach: true });
    }

    CloudSqlite.CloudCaches.dropCache(this.cloudCacheName)?.destroy();
    this._cloudCache = undefined;
    this.containers.clear();
  }

  private static get cloudCache(): CloudSqlite.CloudCache {
    if (!this._cloudCache) {
      let cacheDir: string | undefined = process.env.CHECKPOINT_CACHE_DIR ?? this.getFolder();
      // See if there is a daemon running, otherwise use profile directory for cloudCache
      if (!(IVaultJsFs.existsSync(path.join(cacheDir, "portnumber.bcv"))))
        cacheDir = undefined; // no daemon running, use profile directory

      this._cloudCache = CloudSqlite.CloudCaches.getCache({ cacheName: this.cloudCacheName, cacheDir, cacheSize: "50G" });
    }
    return this._cloudCache;
  }

  /** Member names differ slightly between the V2Checkpoint api and the CloudSqlite api. Add aliases `accessName` for `accountName` and `accessToken` for `sasToken` */
  private static toCloudContainerProps(from: V2CheckpointAccessProps): CloudSqlite.ContainerAccessProps {
    return { ...from, baseUri: `https://${from.accountName}.blob.core.windows.net`, accessToken: from.sasToken, storageType: "azure" };
  }

  private static getContainer(v2Props: V2CheckpointAccessProps, checkpoint: CheckpointProps) {
    let container = this.containers.get(v2Props.containerId);
    if (undefined === container) {
      let tokenFn: ((args: CloudSqlite.RequestTokenArgs) => Promise<AccessToken>) | undefined;
      let tokenRefreshSeconds: number | undefined = -1;
      // from Rpc, the accessToken in the checkpoint request is from the current user. It is used to request the sasToken for the container and
      // the sasToken is checked for refresh (before it expires) on every Rpc request using that user's accessToken. For Ipc, the
      // accessToken in the checkpoint request is undefined, and the sasToken is requested by IVaultHost.getAccessToken(). It is refreshed on a timer.
      if (undefined === checkpoint.accessToken) {
        tokenFn = async () => (await IVaultHost[_hubAccess].queryV2Checkpoint(checkpoint))?.sasToken ?? "";
        tokenRefreshSeconds = undefined;
      }
      container = CloudSqlite.createCloudContainer({ ...this.toCloudContainerProps(v2Props), tokenRefreshSeconds, logId: process.env.POD_NAME, tokenFn });
      this.containers.set(v2Props.containerId, container);
    }
    return container;
  }

  public static async attach(checkpoint: CheckpointProps): Promise<{ dbName: string, container: CloudSqlite.CloudContainer | undefined }> {
    if (this[_mockCheckpoint]) // used by HubMock
      return { dbName: this[_mockCheckpoint].mockAttach(checkpoint), container: undefined };

    let v2props: V2CheckpointAccessProps | undefined;
    try {
      v2props = await IVaultHost[_hubAccess].queryV2Checkpoint(checkpoint);
      if (!v2props)
        throw new Error("no checkpoint");
    } catch (err: any) {
      throw new IVaultError(IVaultStatus.NotFound, `V2 checkpoint not found: err: ${err.message}`);
    }

    try {
      const container = this.getContainer(v2props, checkpoint);
      const dbName = v2props.dbName;
      // Use the new token from the recently queried v2 checkpoint just incase the one we currently have is expired.
      container.accessToken = v2props.sasToken;
      if (!container.isConnected)
        container.connect(this.cloudCache);
      container.checkForChanges();
      const dbStats = container.queryDatabase(dbName);
      if (IVaultHost.appWorkspace.settings.getBoolean("Checkpoints/prefetch", false)) {
        const getPrefetchConfig = (name: string, defaultVal: number) => IVaultHost.appWorkspace.settings.getNumber(`Checkpoints/prefetch/${name}`, defaultVal);
        const minRequests = getPrefetchConfig("minRequests", 3);
        const maxRequests = getPrefetchConfig("maxRequests", 6);
        const timeout = getPrefetchConfig("timeout", 100);
        const maxBlocks = getPrefetchConfig("maxBlocks", 500); // default size of 2GB. Assumes a checkpoint block size of 4MB.
        if (dbStats?.totalBlocks !== undefined && dbStats.totalBlocks <= maxBlocks && dbStats.nPrefetch === 0) {
          const logPrefetch = async (prefetch: CloudSqlite.CloudPrefetch) => {
            const stopwatch = new StopWatch(`[${container.containerId}/${dbName}]`, true);
            Logger.logInfo(loggerCategory, `Starting prefetch of ${stopwatch.description}`, { minRequests, maxRequests, timeout });
            const done = await prefetch.promise;
            Logger.logInfo(loggerCategory, `Prefetch of ${stopwatch.description} complete=${done} (${stopwatch.elapsedSeconds} seconds)`, { minRequests, maxRequests, timeout });
          };
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          logPrefetch(CloudSqlite.startCloudPrefetch(container, dbName, { minRequests, nRequests: maxRequests, timeout }));
        } else {
          Logger.logInfo(loggerCategory, `Skipping prefetch due to size limits or ongoing prefetch.`, { maxBlocks, numPrefetches: dbStats?.nPrefetch, totalBlocksInDb: dbStats?.totalBlocks, v2props });
        }
      }
      return { dbName, container };
    } catch (e: any) {
      const error = `Cloud cache connect failed: ${e.message}`;
      if (checkpoint.expectV2)
        Logger.logError(loggerCategory, error);

      throw new IVaultError(e.errorNumber, error);
    }
  }

  /** @internal */
  private static async performDownload(job: DownloadJob): Promise<ChangesetId> {
    const request = job.request;
    if (this[_mockCheckpoint])
      this[_mockCheckpoint].mockDownload(request);
    else {
      const v2props: V2CheckpointAccessProps | undefined = await IVaultHost[_hubAccess].queryV2Checkpoint({ ...request.checkpoint, allowPreceding: true });
      if (!v2props)
        throw new IVaultError(IVaultStatus.NotFound, "V2 checkpoint not found");

      CheckpointManager.onDownloadV2.raiseEvent(job);
      const container = CloudSqlite.createCloudContainer(this.toCloudContainerProps(v2props));
      await CloudSqlite.transferDb("download", container, { dbName: v2props.dbName, localFileName: request.localFile, onProgress: request.onProgress });
    }
    return request.checkpoint.changeset.id;
  }

  /** Fully download a V2 checkpoint to a local file that can be used to create a briefcase or to work offline.
   * @returns a Promise that is resolved when the download completes with the changesetId of the downloaded checkpoint (which will
   * be the same as the requested changesetId or the most recent checkpoint before it.)
   */
  public static async downloadCheckpoint(request: DownloadRequest): Promise<ChangesetId> {
    return Downloads.download(request, async (job: DownloadJob) => this.performDownload(job));
  }
}

/** @internal  */
export class CheckpointManager {
  public static readonly onDownloadV2 = new BeEvent<(job: DownloadJob) => void>();
  public static getKey(checkpoint: CheckpointProps) { return `${checkpoint.iVaultId}:${checkpoint.changeset.id}`; }

  private static async doDownload(request: DownloadRequest): Promise<ChangesetId> {
    // first see if there's a V2 checkpoint available.
    const stopwatch = new StopWatch(`[${request.checkpoint.changeset.id}]`, true);
    Logger.logInfo(loggerCategory, `Starting download of V2 checkpoint with id ${stopwatch.description}`);
    const changesetId = await V2CheckpointManager.downloadCheckpoint(request);
    Logger.logInfo(loggerCategory, `Downloaded V2 checkpoint with id ${stopwatch.description} (${stopwatch.elapsedSeconds} seconds)`);
    if (changesetId !== request.checkpoint.changeset.id)
      Logger.logInfo(loggerCategory, `Downloaded previous v2 checkpoint because requested checkpoint not found.`, { requestedChangesetId: request.checkpoint.changeset.id, iVaultId: request.checkpoint.iVaultId, changesetId, szewTwinId: request.checkpoint.szewTwinId });
    else
      Logger.logInfo(loggerCategory, `Downloaded v2 checkpoint.`, { iVaultId: request.checkpoint.iVaultId, changesetId: request.checkpoint.changeset.id, szewTwinId: request.checkpoint.szewTwinId });
    return changesetId;
  }

  public static async updateToRequestedVersion(request: DownloadRequest) {
    const checkpoint = request.checkpoint;
    const targetFile = request.localFile;
    const traceInfo = { szewTwinId: checkpoint.szewTwinId, iVaultId: checkpoint.iVaultId, changeset: checkpoint.changeset };
    try {
      // Open checkpoint for write
      const prevLogLevel = Logger.getLevel(NativeLoggerCategory.SQLite) ?? LogLevel.Error; // Get log level before we set it to None.
      Logger.setLevel(NativeLoggerCategory.SQLite, LogLevel.None); // Ignores noisy error messages when applying changesets.
      const db = SnapshotDb.openForApplyChangesets(targetFile);
      const nativeDb = db[_nativeDb];
      try {

        if (nativeDb.hasPendingTxns()) {
          Logger.logWarning(loggerCategory, "Checkpoint with Txns found - deleting them", () => traceInfo);
          nativeDb.deleteAllTxns();
        }

        if (nativeDb.getBriefcaseId() !== BriefcaseIdValue.Unassigned)
          nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);

        CheckpointManager.validateCheckpointGuids(checkpoint, db);
        // Apply change sets if necessary
        const currentChangeset: Mutable<ChangesetIndexAndId> = nativeDb.getCurrentChangeset();
        if (currentChangeset.id !== checkpoint.changeset.id) {
          const accessToken = checkpoint.accessToken;
          const toIndex = checkpoint.changeset.index ??
            (await IVaultHost[_hubAccess].getChangesetFromVersion({ accessToken, iVaultId: checkpoint.iVaultId, version: IVaultVersion.asOfChangeSet(checkpoint.changeset.id) })).index;
          await BriefcaseManager.pullAndApplyChangesets(db, { accessToken, toIndex });
        } else {
          // make sure the parent changeset index is saved in the file - old versions didn't have it.
          currentChangeset.index = checkpoint.changeset.index!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          nativeDb.saveLocalValue("parentChangeSet", JSON.stringify(currentChangeset));
        }
      } finally {
        Logger.setLevel(NativeLoggerCategory.SQLite, prevLogLevel); // Set logging to what it was before we started applying changesets.
        db[_nativeDb].saveChanges();
        db.close();
      }
    } catch (error: any) {

      Logger.logError(loggerCategory, "Error downloading checkpoint - deleting it", () => traceInfo);
      IVaultJsFs.removeSync(targetFile);

      if (error.errorNumber === ChangeSetStatus.CorruptedChangeStream || error.errorNumber === ChangeSetStatus.InvalidId || error.errorNumber === ChangeSetStatus.InvalidVersion) {
        Logger.logError(loggerCategory, "Detected potential corruption of change sets. Deleting them to enable retries", () => traceInfo);
        BriefcaseManager.deleteChangeSetsFromLocalDisk(checkpoint.iVaultId);
      }
      throw error;
    }
  }

  /** Download a checkpoint file from iVaultHub into a local file specified in the request parameters. */
  public static async downloadCheckpoint(request: DownloadRequest): Promise<void> {
    if (this.verifyCheckpoint(request.checkpoint, request.localFile))
      return;

    if (request.aliasFiles) {
      for (const alias of request.aliasFiles) {
        if (this.verifyCheckpoint(request.checkpoint, alias)) {
          request.localFile = alias;
          return;
        }
      }
    }

    await this.doDownload(request);
    return this.updateToRequestedVersion(request);
  }

  /** checks a file's dbGuid & szewTwinId for consistency, and updates the dbGuid when possible */
  public static validateCheckpointGuids(checkpoint: CheckpointProps, snapshotDb: SnapshotDb) {
    const traceInfo = { szewTwinId: checkpoint.szewTwinId, iVaultId: checkpoint.iVaultId };

    const nativeDb = snapshotDb[_nativeDb];
    const dbChangeset = nativeDb.getCurrentChangeset();
    const iVaultId = Guid.normalize(nativeDb.getIVaultId());
    if (iVaultId !== Guid.normalize(checkpoint.iVaultId)) {
      if (nativeDb.isReadonly())
        throw new IVaultError(IVaultStatus.ValidationFailed, "iVaultId is not properly set up in the checkpoint");

      Logger.logWarning(loggerCategory, "iVaultId is not properly set up in the checkpoint. Updated checkpoint to the correct iVaultId.", () => ({ ...traceInfo, dbGuid: iVaultId }));
      const iVaultIdNormalized = Guid.normalize(checkpoint.iVaultId);
      nativeDb.setIVaultId(iVaultIdNormalized);
      (snapshotDb as any)._iVaultId = iVaultIdNormalized;
      // Required to reset the ChangeSetId because setDbGuid clears the value.
      nativeDb.saveLocalValue("ParentChangeSetId", dbChangeset.id);
      if (undefined !== dbChangeset.index)
        nativeDb.saveLocalValue("parentChangeSet", JSON.stringify(dbChangeset));
    }

    const szewTwinId = Guid.normalize(nativeDb.getSZEWTwinId());
    if (szewTwinId !== Guid.normalize(checkpoint.szewTwinId))
      throw new IVaultError(IVaultStatus.ValidationFailed, "szewTwinId was not properly set up in the checkpoint");
  }

  /** @returns true if the file is the checkpoint requested */
  public static verifyCheckpoint(checkpoint: CheckpointProps, fileName: LocalFileName): boolean {
    if (!IVaultJsFs.existsSync(fileName))
      return false;

    const nativeDb = new IVaultNative.platform.BldDb();
    try {
      nativeDb.openIVault(fileName, OpenMode.Readonly);
    } catch {
      return false;
    }

    const isValid = checkpoint.iVaultId === nativeDb.getIVaultId() && checkpoint.changeset.id === nativeDb.getCurrentChangeset().id;
    nativeDb.closeFile();
    if (!isValid)
      IVaultJsFs.removeSync(fileName);

    return isValid;
  }

  public static async toCheckpointProps(args: OpenCheckpointArgs): Promise<CheckpointProps> {
    const changeset = args.changeset ?? await IVaultHost[_hubAccess].getLatestChangeset({ ...args, accessToken: await IVaultHost.getAccessToken() });

    return {
      iVaultId: args.iVaultId,
      szewTwinId: args.szewTwinId,
      changeset: {
        index: changeset.index,
        id: changeset.id ?? (await IVaultHost[_hubAccess].queryChangeset({ ...args, changeset, accessToken: await IVaultHost.getAccessToken() })).id,
      },
    };
  }
}
