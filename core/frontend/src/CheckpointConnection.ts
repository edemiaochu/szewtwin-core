/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IVaultConnection
 */

import { SzewecError, SzewecStatus, expectDefined, Guid, GuidString, Logger } from "@szewtwin/core-szewec";
import {
  IVaultConnectionProps, IVaultError, IVaultReadRpcInterface, IVaultRpcOpenProps, IVaultVersion, RpcManager, RpcNotFoundResponse, RpcOperation,
  RpcRequest, RpcRequestEvent,
} from "@szewtwin/core-common";
import { FrontendLoggerCategory } from "./common/FrontendLoggerCategory";
import { IVaultApp } from "./IVaultApp";
import { IVaultConnection } from "./IVaultConnection";
import { IVaultRoutingContext } from "./IVaultRoutingContext";
import { IpcApp } from "./IpcApp";

const loggerCategory = FrontendLoggerCategory.IVaultConnection;

/**
 * An IVaultConnection to a Checkpoint of an iVault.
 * @see [CheckpointConnection]($docs/learning/frontend/IVaultConnection)
 * @public
 */
export class CheckpointConnection extends IVaultConnection {
  private readonly _fromIpc: boolean;

  /** The Guid that identifies the szewTwin that owns this iVault. */
  public override get szewTwinId(): GuidString { return super.szewTwinId ?? Guid.empty; }
  /** The Guid that identifies this iVault. */
  public override get iVaultId(): GuidString { return super.iVaultId ?? Guid.empty; }

  /** Returns `true` if [[close]] has already been called. */
  public get isClosed(): boolean { return this._isClosed ? true : false; }
  protected _isClosed?: boolean;

  protected constructor(props: IVaultConnectionProps, fromIpc: boolean) {
    super(props);
    this._fromIpc = fromIpc;
  }

  /** Type guard for instanceof [[CheckpointConnection]] */
  public override isCheckpointConnection(): this is CheckpointConnection { return true; }

  /**
   * Open a readonly IVaultConnection to a Checkpoint of an iVault.
   */
  public static async openRemote(szewTwinId: GuidString, iVaultId: GuidString, version = IVaultVersion.latest()): Promise<CheckpointConnection> {
    if (undefined === IVaultApp.hubAccess)
      throw new Error("Missing an implementation of IVaultApp.hubAccess");

    const accessToken = await IVaultApp.getAccessToken();
    const changeset = await IVaultApp.hubAccess.getChangesetFromVersion({ accessToken, iVaultId, version });

    let connection: CheckpointConnection;
    const iVaultProps = { szewTwinId, iVaultId, changeset };
    if (IpcApp.isValid) {
      connection = new this(await IpcApp.appFunctionIpc.openCheckpoint(iVaultProps), true);
    } else {
      const routingContext = IVaultRoutingContext.current || IVaultRoutingContext.default;
      connection = new this(await this.callOpen(iVaultProps, routingContext), false);
      RpcManager.setIVault(connection);
      connection.routingContext = routingContext;
      RpcRequest.notFoundHandlers.addListener(connection._reopenConnectionHandler);
    }

    IVaultConnection.onOpen.raiseEvent(connection);
    return connection;
  }

  private static async callOpen(iVaultToken: IVaultRpcOpenProps, routingContext: IVaultRoutingContext): Promise<IVaultConnectionProps> {
    // Try opening the iVault repeatedly accommodating any pending responses from the backend.
    // Waits for an increasing amount of time (but within a range) before checking on the pending request again.
    const connectionRetryIntervalRange = { min: 100, max: 5000 }; // in milliseconds
    let connectionRetryInterval = Math.min(connectionRetryIntervalRange.min, IVaultConnection.connectionTimeout);

    const openForReadOperation = RpcOperation.lookup(IVaultReadRpcInterface, "getConnectionProps");
    if (!openForReadOperation)
      throw new IVaultError(SzewecStatus.ERROR, "IVaultReadRpcInterface.getConnectionProps() is not available");
    openForReadOperation.policy.retryInterval = () => connectionRetryInterval;

    Logger.logTrace(loggerCategory, `IVaultConnection.open`, iVaultToken);
    const startTime = Date.now();

    const removeListener = RpcRequest.events.addListener((type: RpcRequestEvent, request: RpcRequest) => { // eslint-disable-line @typescript-eslint/no-deprecated
      if (type !== RpcRequestEvent.PendingUpdateReceived) // eslint-disable-line @typescript-eslint/no-deprecated
        return;
      if (!(openForReadOperation && request.operation === openForReadOperation))
        return;

      Logger.logTrace(loggerCategory, "Received pending open notification in IVaultConnection.open", iVaultToken);

      const connectionTimeElapsed = Date.now() - startTime;
      if (connectionTimeElapsed > IVaultConnection.connectionTimeout) {
        Logger.logError(loggerCategory, `Timed out opening connection in IVaultConnection.open (took longer than ${IVaultConnection.connectionTimeout} milliseconds)`, iVaultToken);
        throw new IVaultError(SzewecStatus.ERROR, "Opening a connection was timed out"); // NEEDS_WORK: More specific error status
      }

      connectionRetryInterval = Math.min(connectionRetryIntervalRange.max, connectionRetryInterval * 2, IVaultConnection.connectionTimeout - connectionTimeElapsed);
      if (request.retryInterval !== connectionRetryInterval) {
        request.retryInterval = connectionRetryInterval;
        Logger.logTrace(loggerCategory, `Adjusted open connection retry interval to ${request.retryInterval} milliseconds in IVaultConnection.open`, iVaultToken);
      }
    });

    const openPromise = IVaultReadRpcInterface.getClientForRouting(routingContext.token).getConnectionProps(iVaultToken);
    let openResponse: IVaultConnectionProps;
    try {
      openResponse = await openPromise;
    } finally {
      Logger.logTrace(loggerCategory, "Completed open request in IVaultConnection.open", iVaultToken);
      removeListener();
    }

    return openResponse;
  }

  private _reopenConnectionHandler = async (request: RpcRequest<RpcNotFoundResponse>, response: any, resubmit: () => void, reject: (reason?: any) => void) => {
    if (!response.hasOwnProperty("isIVaultNotFoundResponse"))
      reject();

    const iVaultRpcProps = request.parameters[0];
    if (this._fileKey !== iVaultRpcProps.key)
      reject(); // The handler is called for a different connection than this

    Logger.logTrace(loggerCategory, "Attempting to reopen connection", () => iVaultRpcProps);

    try {
      const openResponse = await CheckpointConnection.callOpen(iVaultRpcProps, this.routingContext);
      // The new/reopened connection may have a new rpcKey and/or changesetId, but the other IVaultRpcTokenProps should be the same
      this._fileKey = openResponse.key;
      this.changeset = expectDefined(openResponse.changeset);

    } catch (error) {
      reject(SzewecError.getErrorMessage(error));
    } finally {
    }

    Logger.logTrace(loggerCategory, "Resubmitting original request after reopening connection", iVaultRpcProps);
    request.parameters[0] = this.getRpcProps(); // Modify the token of the original request before resubmitting it.
    resubmit();
  };

  /** Close this CheckpointConnection */
  public async close(): Promise<void> {
    if (this.isClosed)
      return;

    this.beforeClose();
    if (this._fromIpc)
      await IpcApp.appFunctionIpc.closeIVault(this._fileKey);
    else
      RpcRequest.notFoundHandlers.removeListener(this._reopenConnectionHandler);

    this._isClosed = true;
  }
}
