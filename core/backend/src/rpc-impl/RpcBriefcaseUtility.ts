/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { AccessToken, assert, BeDuration, IVaultStatus, Logger } from "@szewtwin/core-szewec";
import {
  BriefcaseProps, IVaultConnectionProps, IVaultError, IVaultRpcOpenProps, IVaultRpcProps, IVaultVersion, RpcActivity, RpcPendingResponse, SyncMode,
} from "@szewtwin/core-common";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { BriefcaseManager, RequestNewBriefcaseArg } from "../BriefcaseManager";
import { CheckpointManager } from "../CheckpointManager";
import { BriefcaseDb, IVaultDb, SnapshotDb } from "../IVaultDb";
import { IVaultHost } from "../IVaultHost";
import { IVaultJsFs } from "../IVaultJsFs";
import { _hubAccess } from "../internal/Symbols";

const loggerCategory: string = BackendLoggerCategory.IVaultDb;

/** @internal */
export interface DownloadAndOpenArgs {
  activity: RpcActivity;
  tokenProps: IVaultRpcOpenProps;
  syncMode: SyncMode;
  fileNameResolvers?: ((arg: BriefcaseProps) => string)[];
  timeout?: number;
  forceDownload?: boolean;
}
/**
 * Utility to open the iVault for RPC interfaces
 * @internal
 */
export class RpcBriefcaseUtility {
  private static async downloadAndOpen(args: DownloadAndOpenArgs): Promise<BriefcaseDb> {
    const { activity, tokenProps } = args;
    const accessToken = activity.accessToken;
    assert(undefined !== tokenProps.iVaultId);

    const iVaultId = tokenProps.iVaultId;
    let myBriefcaseIds: number[];
    if (args.syncMode === SyncMode.PullOnly) {
      myBriefcaseIds = [0]; // PullOnly means briefcaseId 0
    } else {
      // check with iVaultHub and see if we already have acquired any briefcaseIds
      myBriefcaseIds = await IVaultHost[_hubAccess].getMyBriefcaseIds({ accessToken, iVaultId });
    }

    const resolvers = args.fileNameResolvers ?? [(arg) => BriefcaseManager.getFileName(arg)];

    // see if we can open any of the briefcaseIds we already acquired from iVaultHub
    if (resolvers) {
      for (const resolver of resolvers) {
        for (const briefcaseId of myBriefcaseIds) {
          const fileName = resolver({ briefcaseId, iVaultId });
          if (IVaultJsFs.existsSync(fileName)) {
            const briefcaseDb = BriefcaseDb.findByFilename(fileName);
            if (briefcaseDb !== undefined) {
              if (briefcaseDb.isBriefcaseDb()) {
                return briefcaseDb;
              } else {
                throw new IVaultError(IVaultStatus.AlreadyOpen, "iVault is already open as a SnapshotDb");
              }
            }
            try {
              if (args.forceDownload)
                throw new Error(); // causes delete below
              const db = await BriefcaseDb.open({ fileName });
              if (db.changeset.id !== tokenProps.changeset?.id) {
                assert(undefined !== tokenProps.changeset);
                const toIndex = tokenProps.changeset?.index ??
                  (await IVaultHost[_hubAccess].getChangesetFromVersion({ accessToken, iVaultId, version: IVaultVersion.asOfChangeSet(tokenProps.changeset.id) })).index;
                await BriefcaseManager.pullAndApplyChangesets(db, { accessToken, toIndex });
              }
              return db;
            } catch (error: any) {
              if (!(error.errorNumber === IVaultStatus.AlreadyOpen))
                // somehow we have this briefcaseId and the file exists, but we can't open it. Delete it.
                await BriefcaseManager.deleteBriefcaseFiles(fileName, accessToken);
            }
          }
        }
      }
    }

    // no local briefcase available. Download one and open it.
    assert(undefined !== tokenProps.szewTwinId);
    const request: RequestNewBriefcaseArg = {
      accessToken,
      szewTwinId: tokenProps.szewTwinId,
      iVaultId,
      briefcaseId: args.syncMode === SyncMode.PullOnly ? 0 : undefined, // if briefcaseId is undefined, we'll acquire a new one.
    };

    const props = await BriefcaseManager.downloadBriefcase(request);
    return BriefcaseDb.open(props);
  }

  private static _briefcasePromises: Map<string, Promise<BriefcaseDb>> = new Map();
  private static async openBriefcase(args: DownloadAndOpenArgs): Promise<BriefcaseDb> {
    const key = `${args.tokenProps.iVaultId}:${args.tokenProps.changeset?.id}:${args.tokenProps.changeset?.index}:${args.syncMode}`;
    const cachedPromise = this._briefcasePromises.get(key);
    if (cachedPromise)
      return cachedPromise;

    try {
      const briefcasePromise = this.downloadAndOpen(args); // save the fact that we're working on downloading so if we timeout, we'll reuse this request.
      this._briefcasePromises.set(key, briefcasePromise);
      return await briefcasePromise;
    } finally {
      this._briefcasePromises.delete(key);  // the download and open is now done
    }
  }

  /** find a previously opened iVault for RPC.
   * @param accessToken necessary (only) for V2 checkpoints to refresh access token in daemon if it has expired. We use the accessToken of the current RPC request
   * to refresh the daemon, even though it will be used for all authorized users.
   * @param the IVaultRpcProps to locate the opened iVault.
   */
  public static async findOpenIVault(accessToken: AccessToken, iVault: IVaultRpcProps) {
    const iVaultDb = IVaultDb.findByKey(iVault.key);

    // call refreshContainer, just in case this is a V2 checkpoint whose sasToken is about to expire, or its default transaction is about to be restarted.
    await iVaultDb.refreshContainerForRpc(accessToken);
    return iVaultDb;
  }

  public static async open(args: DownloadAndOpenArgs & { syncMode: SyncMode.FixedVersion }): Promise<IVaultDb>;
  /**
   * @deprecated in 4.4.0 - will not be removed until after 2026-06-13. Only `SyncMode.FixedVersion` should be used in RPC backends
   */
  public static async open(args: DownloadAndOpenArgs & { syncMode: Exclude<SyncMode, "FixedVersion"> }): Promise<IVaultDb>;
  /**
   * Download and open a checkpoint or briefcase, ensuring the operation completes within a default timeout. If the time to open exceeds the timeout period,
   * a RpcPendingResponse exception is thrown
   */
  public static async open(args: DownloadAndOpenArgs): Promise<IVaultDb> {
    const { activity, tokenProps, syncMode } = args;
    Logger.logTrace(loggerCategory, "RpcBriefcaseUtility.open", tokenProps);

    const timeout = args.timeout ?? 1000;
    if (syncMode === SyncMode.PullOnly || syncMode === SyncMode.PullAndPush) {
      const briefcaseDb = await BeDuration.race(timeout, this.openBriefcase(args));

      if (briefcaseDb === undefined) {
        Logger.logTrace(loggerCategory, "Open briefcase - pending", tokenProps);
        throw new RpcPendingResponse(); // eslint-disable-line @typescript-eslint/only-throw-error
      }
      // note: usage is logged in the function BriefcaseManager.downloadNewBriefcaseAndOpen
      return briefcaseDb;
    }
    if (!tokenProps.iVaultId || !tokenProps.szewTwinId || !tokenProps.changeset)
      throw new IVaultError(IVaultStatus.BadArg, "invalid arguments");

    const checkpoint = {
      iVaultId: tokenProps.iVaultId,
      szewTwinId: tokenProps.szewTwinId,
      changeset: tokenProps.changeset,
      accessToken: activity.accessToken,
    };

    // opening a checkpoint.
    let db: SnapshotDb | void;
    // first check if it's already open
    db = SnapshotDb.tryFindByKey(CheckpointManager.getKey(checkpoint));
    if (db) {
      Logger.logTrace(loggerCategory, "Checkpoint was already open", tokenProps);
      return db;
    }

    // now try V2 checkpoint
    db = await SnapshotDb.openCheckpointFromRpc(checkpoint);
    Logger.logTrace(loggerCategory, "using V2 checkpoint", tokenProps);

    return db;
  }

  public static async openWithTimeout(activity: RpcActivity, tokenProps: IVaultRpcOpenProps, syncMode: SyncMode.FixedVersion, timeout?: number): Promise<IVaultConnectionProps>;
  /**
   * @deprecated in 4.4.0 - will not be removed until after 2026-06-13. Only `SyncMode.FixedVersion` should be used in RPC backends
   */
  public static async openWithTimeout(activity: RpcActivity, tokenProps: IVaultRpcOpenProps, syncMode: Exclude<SyncMode, "FixedVersion">, timeout?: number): Promise<IVaultConnectionProps>;
  public static async openWithTimeout(activity: RpcActivity, tokenProps: IVaultRpcOpenProps, syncMode: SyncMode, timeout: number = 1000): Promise<IVaultConnectionProps> {
    if (tokenProps.iVaultId)
      await IVaultHost.tileStorage?.initialize(tokenProps.iVaultId);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return (await this.open({ activity, tokenProps, syncMode, timeout })).toJSON();
  }

}
