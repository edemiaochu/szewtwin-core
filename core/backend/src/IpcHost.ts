/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NativeApp
 */

import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { assert, SzewecError, IVaultStatus, JsonUtils, Logger, LogLevel, OpenMode } from "@szewtwin/core-szewec";
import {
  BriefcaseConnectionProps,
  ChangesetIndex, ChangesetIndexAndId, EditingScopeNotifications, getPullChangesIpcChannel, IVaultConnectionProps, IVaultError, IVaultNotFoundResponse, IVaultRpcProps,
  ipcAppChannels, IpcAppFunctions, IpcAppNotifications, IpcInvokeReturn, IpcListener, IpcSocketBackend, szewTwinChannel,
  OpenBriefcaseProps, OpenCheckpointArgs, PullChangesOptions, ReinstateTxnArgs, RemoveFunction, ReverseTxnArgs, SnapshotOpenOptions,
  StandaloneOpenOptions, TileTreeContentIds, TxnNotifications,
} from "@szewtwin/core-common";
import { ProgressFunction, ProgressStatus } from "./CheckpointManager";
import { BriefcaseDb, IVaultDb, SnapshotDb, StandaloneDb } from "./IVaultDb";
import { IVaultHost, IVaultHostOptions } from "./IVaultHost";
import { IVaultNative } from "./internal/NativePlatform";
import { _implicitTxn, _nativeDb } from "./internal/Symbols";
import { cancelTileContentRequests } from "./rpc-impl/IVaultTileRpcImpl";

/**
  * Options for [[IpcHost.startup]]
  * @public
  */
export interface IpcHostOpts {
  iVaultHost?: IVaultHostOptions;
  ipcHost?: {
    /** The Ipc socket to use for communications with frontend. Allows undefined only for headless tests. */
    socket?: IpcSocketBackend;

    /** don't send stack information on exceptions */
    exceptions?: {
      noStack?: boolean;
    };
  };
}

/**
 * Used by applications that have a dedicated backend. IpcHosts may send messages to their corresponding IpcApp.
 * @note if either end terminates, the other must too.
 * @public
 */
export class IpcHost {
  public static noStack = false;
  private static _ipc: IpcSocketBackend | undefined;
  /** Get the implementation of the [IpcSocketBackend]($common) interface. */
  private static get ipc(): IpcSocketBackend { return this._ipc!; } // eslint-disable-line @typescript-eslint/no-non-null-assertion
  /** Determine whether Ipc is available for this backend. This will only be true if [[startup]] has been called on this class. */
  public static get isValid(): boolean { return undefined !== this._ipc; }

  /**
   * Send a message to the frontend over an Ipc channel.
   * @param channel the name of the channel matching the name registered with [[IpcApp.addListener]].
   * @param data The content of the message.
   */
  public static send(channel: string, ...data: any[]): void {
    this.ipc.send(szewTwinChannel(channel), ...data);
  }

  /**
   * Establish a handler for an Ipc channel to receive [[Frontend.invoke]] calls
   * @param channel The name of the channel for this handler.
   * @param handler A function that supplies the implementation for `channel`
   * @note returns A function to call to remove the handler.
   */
  public static handle(channel: string, handler: (...args: any[]) => Promise<any>): RemoveFunction {
    return this.ipc.handle(szewTwinChannel(channel), handler);
  }
  /**
   * Establish a handler to receive messages sent via [[IpcApp.send]].
   * @param channel The name of the channel for the messages.
   * @param listener A function called when messages are sent over `channel`
   * @note returns A function to call to remove the listener.
   */
  public static addListener(channel: string, listener: IpcListener): RemoveFunction {
    return this.ipc.addListener(szewTwinChannel(channel), listener);
  }
  /**
   * Remove a previously registered listener
   * @param channel The name of the channel for the listener previously registered with [[addListener]]
   * @param listener The function passed to [[addListener]]
   */
  public static removeListener(channel: string, listener: IpcListener): void {
    this.ipc.removeListener(szewTwinChannel(channel), listener);
  }

  private static notify(channel: string, briefcase: BriefcaseDb | StandaloneDb, methodName: string, ...args: any[]) {
    if (this.isValid)
      return this.send(`${channel}/${briefcase.key}`, methodName, ...args);
  }

  /** @internal */
  public static notifyIpcFrontend<T extends keyof IpcAppNotifications>(methodName: T, ...args: Parameters<IpcAppNotifications[T]>) {
    return IpcHost.send(ipcAppChannels.appNotify, methodName, ...args);
  }

  /** @internal */
  public static notifyTxns<T extends keyof TxnNotifications>(briefcase: BriefcaseDb | StandaloneDb, methodName: T, ...args: Parameters<TxnNotifications[T]>) {
    this.notify(ipcAppChannels.txns, briefcase, methodName, ...args);
  }

  /** @internal */
  public static notifyEditingScope<T extends keyof EditingScopeNotifications>(briefcase: BriefcaseDb | StandaloneDb, methodName: T, ...args: Parameters<EditingScopeNotifications[T]>) {
    this.notify(ipcAppChannels.editingScope, briefcase, methodName, ...args);
  }

  /**
   * Start the backend of an Ipc app.
   * @param opt
   * @note this method calls [[IVaultHost.startup]] internally.
   */
  public static async startup(opt?: IpcHostOpts): Promise<void> {
    this._ipc = opt?.ipcHost?.socket;
    if (opt?.ipcHost?.exceptions?.noStack)
      this.noStack = true;

    if (this.isValid) { // for tests, we use IpcHost but don't have a frontend
      IpcAppHandler.register();
    }

    await IVaultHost.startup(opt?.iVaultHost);
  }

  /** Shutdown IpcHost backend. Also calls [[IVaultHost.shutdown]] */
  public static async shutdown(): Promise<void> {
    this._ipc = undefined;
    await IVaultHost.shutdown();
  }
}

/**
 * Base class for all implementations of an Ipc interface.
 *
 * Create a subclass to implement your Ipc interface. Your class should be declared like this:
 * ```ts
 * class MyHandler extends IpcHandler implements MyInterface
 * ```
 * to ensure all methods and signatures are correct.
 *
 * Then, call `MyClass.register` at startup to connect your class to your channel.
 * @public
 */
export abstract class IpcHandler {
  /**
   * All subclasses *must* implement this method to specify their channel name.
   *
   * Channel names are the key that connects Handlers and senders. The channel name of IpcHandlers must exactly match the name used by senders.
   * By convention, channel names should be prefixed by a *namespace* (e.g. `${appName}/`)
   * unique enough to disambiguate them from channels for other apps that may be running in the same processes.
   */
  public abstract get channelName(): string;

  /**
   * Register this class as the handler for methods on its channel. This static method creates a new instance
   * that becomes the handler and is `this` when its methods are called.
   * @returns A function that can be called to remove the handler.
   * @note this method should only be called once per channel. If it is called multiple times, subsequent calls replace the previous ones.
   */
  public static register(): RemoveFunction {
    const impl = new (this as any)() as IpcHandler; // create an instance of subclass. "as any" is necessary because base class is abstract
    const prohibitedFunctions = Object.getOwnPropertyNames(Object.getPrototypeOf({}));

    return IpcHost.handle(impl.channelName, async (_evt: Event, funcName: string, ...args: any[]): Promise<IpcInvokeReturn> => {
      try {
        if (prohibitedFunctions.includes(funcName))
          throw new Error(`Method "${funcName}" not available for channel: ${impl.channelName}`);

        const func = (impl as any)[funcName];
        if (typeof func !== "function")
          throw new IVaultError(IVaultStatus.FunctionNotFound, `Method "${impl.constructor.name}.${funcName}" not found on IpcHandler registered for channel: ${impl.channelName}`);

        return { result: await func.call(impl, ...args) };
      } catch (err: unknown) {

        if (!JsonUtils.isObject(err)) // if the exception isn't an object, just forward it
          return { error: err };

        const serializeError = (e: any, includeStack: boolean, visited = new WeakSet<object>()): any => {
          if (visited.has(e))
            return undefined;
          visited.add(e);
          try {
            const serialized: any = { ...e };

            for (const sym of Object.getOwnPropertySymbols(serialized))
              delete serialized[sym]; // symbol-keyed properties cannot be structured-cloned

            if (e instanceof Error) {
              serialized.message = e.message; // NB: .message and .stack are non-enumerable on Error instances
              if (includeStack)
                serialized.stack = e.stack;

              // Error.cause is typically non-enumerable and must be copied explicitly.
              if (Object.prototype.hasOwnProperty.call(e, "cause"))
                serialized.cause = (e as { cause?: unknown }).cause;
            }

            if (e instanceof SzewecError) {
              serialized.szewTwinErrorId = e.szewTwinErrorId;
              if (e.hasMetaData)
                serialized.loggingMetadata = e.loggingMetadata;
              delete serialized._metaData;
            }

            // Only recurse into Error instances and plain objects — not class instances like Date or Buffer.
            const shouldRecurse = (val: any) => val instanceof Error || (JsonUtils.isObject(val) && Object.getPrototypeOf(val) === Object.prototype);
            const isSerializableLeaf = (val: unknown): boolean => {
              const t = typeof val;
              return val === null || val === undefined || val instanceof Date
                || t === "string" || t === "number" || t === "boolean";
            };
            for (const key of Object.keys(serialized)) {
              const val = serialized[key];
              if (Array.isArray(val))
                serialized[key] = val.map((item) => shouldRecurse(item) ? serializeError(item, includeStack, visited) : isSerializableLeaf(item) ? item : undefined);
              else if (shouldRecurse(val))
                serialized[key] = serializeError(val, includeStack, visited);
              else if (!isSerializableLeaf(val))
                delete serialized[key]; // strip non-cloneable values (functions, class instances, etc.)
            }

            return serialized;
          } finally {
            // Remove from the stack so a sibling branch can still serialize this object.
            visited.delete(e);
          }
        };

        return { error: serializeError(err, !IpcHost.noStack) };
      }
    });
  }
}

/**
 * Implementation  of IpcAppFunctions
 */
class IpcAppHandler extends IpcHandler implements IpcAppFunctions {
  public get channelName() { return ipcAppChannels.functions; }

  private _iVaultKeyToPullStatus = new Map<string, ProgressStatus>();

  public async log(_timestamp: number, level: LogLevel, category: string, message: string, metaData?: any): Promise<void> {
    switch (level) {
      case LogLevel.Error:
        Logger.logError(category, message, metaData);
        break;
      case LogLevel.Info:
        Logger.logInfo(category, message, metaData);
        break;
      case LogLevel.Trace:
        Logger.logTrace(category, message, metaData);
        break;
      case LogLevel.Warning:
        Logger.logWarning(category, message, metaData);
        break;
    }
  }

  public async cancelTileContentRequests(tokenProps: IVaultRpcProps, contentIds: TileTreeContentIds[]): Promise<void> {
    return cancelTileContentRequests(tokenProps, contentIds);
  }
  public async cancelElementGraphicsRequests(key: string, requestIds: string[]): Promise<void> {
    return IVaultDb.findByKey(key)[_nativeDb].cancelElementGraphicsRequests(requestIds);
  }
  public async openBriefcase(args: OpenBriefcaseProps): Promise<BriefcaseConnectionProps> {
    const db = await BriefcaseDb.open(args);
    return db.toJSON();
  }
  public async openCheckpoint(checkpoint: OpenCheckpointArgs): Promise<IVaultConnectionProps> {
    return (await SnapshotDb.openCheckpoint(checkpoint)).getConnectionProps();
  }
  public async openStandalone(filePath: string, openMode: OpenMode, opts?: StandaloneOpenOptions): Promise<IVaultConnectionProps> {
    return StandaloneDb.openFile(filePath, openMode, opts).getConnectionProps();
  }
  public async openSnapshot(filePath: string, opts?: SnapshotOpenOptions): Promise<IVaultConnectionProps> {
    let resolvedFileName: string | undefined = filePath;
    if (IVaultHost.snapshotFileNameResolver) { // eslint-disable-line @typescript-eslint/no-deprecated
      resolvedFileName = IVaultHost.snapshotFileNameResolver.tryResolveFileName(filePath); // eslint-disable-line @typescript-eslint/no-deprecated
      if (!resolvedFileName)
        throw new IVaultNotFoundResponse(); // eslint-disable-line @typescript-eslint/only-throw-error
    }
    return SnapshotDb.openFile(resolvedFileName, opts).getConnectionProps();
  }
  public async closeIVault(key: string): Promise<void> {
    IVaultDb.findByKey(key).close();
  }
  public async saveChanges(key: string, description?: string): Promise<void> {
    IVaultDb.findByKey(key)[_implicitTxn].saveChanges(description);
  }
  public async abandonChanges(key: string): Promise<void> {
    IVaultDb.findByKey(key)[_implicitTxn].abandonChanges();
  }
  public async hasPendingTxns(key: string): Promise<boolean> {
    return IVaultDb.findByKey(key)[_nativeDb].hasPendingTxns();
  }

  public async isUndoPossible(key: string): Promise<boolean> {
    return IVaultDb.findByKey(key)[_nativeDb].isUndoPossible();
  }
  public async isRedoPossible(key: string): Promise<boolean> {
    return IVaultDb.findByKey(key)[_nativeDb].isRedoPossible();
  }
  public async getUndoString(key: string): Promise<string> {
    return IVaultDb.findByKey(key)[_nativeDb].getUndoString();
  }
  public async getRedoString(key: string): Promise<string> {
    return IVaultDb.findByKey(key)[_nativeDb].getRedoString();
  }

  public async pullChanges(key: string, toIndex?: ChangesetIndex, options?: PullChangesOptions): Promise<ChangesetIndexAndId> {
    const iVaultDb = BriefcaseDb.findByKey(key);

    this._iVaultKeyToPullStatus.set(key, ProgressStatus.Continue);
    const checkAbort = () => this._iVaultKeyToPullStatus.get(key) ?? ProgressStatus.Continue;

    let onProgress: ProgressFunction | undefined;
    if (options?.reportProgress) {
      const progressCallback: ProgressFunction = (loaded, total) => {
        IpcHost.send(getPullChangesIpcChannel(iVaultDb.iVaultId), { loaded, total });
        return checkAbort();
      };
      onProgress = throttleProgressCallback(progressCallback, checkAbort, options?.progressInterval);
    } else if (options?.enableCancellation) {
      onProgress = checkAbort;
    }

    try {
      await iVaultDb.pullChanges({ toIndex, onProgress });
    } finally {
      this._iVaultKeyToPullStatus.delete(key);
    }

    return iVaultDb.changeset as ChangesetIndexAndId;
  }
  public async cancelPullChangesRequest(key: string): Promise<void> {
    this._iVaultKeyToPullStatus.set(key, ProgressStatus.Abort);
  }

  public async pushChanges(key: string, description: string): Promise<ChangesetIndexAndId> {
    const iVaultDb = BriefcaseDb.findByKey(key);
    await iVaultDb.pushChanges({ description });
    return iVaultDb.changeset as ChangesetIndexAndId;
  }

  public async toggleGraphicalEditingScope(key: string, startSession: boolean): Promise<boolean> {
    const val: IVaultJsNative.ErrorStatusOrResult<any, boolean> = IVaultDb.findByKey(key)[_nativeDb].setGeometricModelTrackingEnabled(startSession);
    if (val.error)
      throw new IVaultError(val.error.status, "Failed to toggle graphical editing scope");
    assert(undefined !== val.result);
    return val.result;
  }
  public async isGraphicalEditingSupported(key: string): Promise<boolean> {
    return IVaultDb.findByKey(key)[_nativeDb].isGeometricModelTrackingSupported();
  }

  public async reverseTxns(key: string, numOperations: number): Promise<IVaultStatus> {
    return BriefcaseDb.findByKey(key).txns.reverseTxns(numOperations);
  }

  public async reverseTxnsAsync(key: string, numOperations: number, args?: ReverseTxnArgs): Promise<void> {
    return BriefcaseDb.findByKey(key).txns.reverseTxnsAsync(numOperations, args);
  }

  public async reverseAllTxn(key: string): Promise<IVaultStatus> {
    return BriefcaseDb.findByKey(key).txns.reverseAll();
  }

  public async reverseAllTxnsAsync(key: string, args?: ReverseTxnArgs): Promise<void> {
    return BriefcaseDb.findByKey(key).txns.reverseAllTxnsAsync(args);
  }

  public async reinstateTxn(key: string): Promise<IVaultStatus> {
    return BriefcaseDb.findByKey(key).txns.reinstateTxn();
  }

  public async reinstateTxnAsync(key: string, args?: ReinstateTxnArgs): Promise<void> {
    return BriefcaseDb.findByKey(key).txns.reinstateTxnAsync(args);
  }

  public async restartTxnSession(key: string): Promise<void> {
    return IVaultDb.findByKey(key).restartTxnSession();
  }

  public async queryConcurrency(pool: "io" | "cpu"): Promise<number> {
    return IVaultNative.platform.queryConcurrency(pool);
  }
}

/**
 * Prevents progress callback being called more frequently when provided interval.
 * @internal
 */
export function throttleProgressCallback(func: ProgressFunction, checkAbort: () => ProgressStatus, progressInterval?: number): ProgressFunction {
  const interval = progressInterval ?? 250; // by default, only send progress events every 250 milliseconds
  let nextTime = Date.now() + interval;
  const progressCallback: ProgressFunction = (loaded, total) => {
    const now = Date.now();
    if (loaded >= total || now >= nextTime) {
      nextTime = now + interval;
      return func(loaded, total);
    }
    return checkAbort();
  };

  return progressCallback;
}
