/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { AccessToken, assert, BeDuration, Id64Array, Logger } from "@szewtwin/core-szewec";
import { ElementGraphicsRequestProps, IVaultRpcProps, IVaultTileRpcInterface, IVaultTileTreeProps, RpcInterface, RpcManager, RpcPendingResponse, TileContentIdentifier, TileContentSource, TileTreeContentIds, TileVersionInfo } from "@szewtwin/core-common";
import type { Metadata, TransferConfig } from "@szewtwin/object-storage-core";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { IVaultDb } from "../IVaultDb";
import { IVaultHost } from "../IVaultHost";
import { PromiseMemoizer, QueryablePromise } from "../PromiseMemoizer";
import { RpcTrace } from "../rpc/tracing";
import { RpcBriefcaseUtility } from "./RpcBriefcaseUtility";
import { IVaultNative } from "../internal/NativePlatform";
import { _nativeDb } from "../internal/Symbols";

interface TileRequestProps {
  accessToken?: AccessToken;
  tokenProps: IVaultRpcProps;
  treeId: string;
}

function generateTileRequestKey(props: TileRequestProps): string {
  const token = props.tokenProps;
  return `${JSON.stringify({
    key: token.key,
    szewTwinId: token.szewTwinId,
    iVaultId: token.iVaultId,
    changesetId: token.changeset?.id,
  })}:${props.treeId}`;
}

abstract class TileRequestMemoizer<Result, Props extends TileRequestProps> extends PromiseMemoizer<Result> {
  private readonly _loggerCategory = BackendLoggerCategory.IVaultTileRequestRpc;
  protected abstract get _operationName(): string;
  protected abstract addMetadata(metadata: any, props: Props): void;
  protected abstract stringify(props: Props): string;
  protected abstract get _timeoutMilliseconds(): number;

  private makeMetadata(props: Props): any {
    const meta = { ...props.tokenProps };
    this.addMetadata(meta, props);
    return meta;
  }

  protected constructor(memoizeFn: (props: Props) => Promise<Result>, generateKeyFn: (props: Props) => string) {
    super(memoizeFn, generateKeyFn);
  }

  public override memoize(props: Props): QueryablePromise<Result> {
    return super.memoize(props);
  }

  public override deleteMemoized(props: Props) {
    super.deleteMemoized(props);
  }

  private log(status: string, props: Props): void {
    const descr = `${this._operationName}(${this.stringify(props)})`;
    Logger.logTrace(this._loggerCategory, `Backend ${status} ${descr}`, () => this.makeMetadata(props));
  }

  protected async perform(props: Props): Promise<Result> {
    this.log("received", props);

    const tileQP = this.memoize(props);

    await BeDuration.race(this._timeoutMilliseconds, tileQP.promise).catch(() => { });
    // Note: Rejections must be caught so that the memoization entry can be deleted

    if (tileQP.isPending) {
      this.log("issuing pending status for", props);
      throw new RpcPendingResponse(); // eslint-disable-line @typescript-eslint/only-throw-error
    }

    this.deleteMemoized(props);

    if (tileQP.isFulfilled) {
      this.log("completed", props);
      assert(undefined !== tileQP.result);
      return tileQP.result;
    }

    assert(tileQP.isRejected);
    this.log("rejected", props);
    throw tileQP.error;
  }
}

async function getTileTreeProps(props: TileRequestProps): Promise<IVaultTileTreeProps> {
  assert(undefined !== props.accessToken);
  const db = await RpcBriefcaseUtility.findOpenIVault(props.accessToken, props.tokenProps);
  return db.tiles.requestTileTreeProps(props.treeId);
}

class RequestTileTreePropsMemoizer extends TileRequestMemoizer<IVaultTileTreeProps, TileRequestProps> {
  protected get _timeoutMilliseconds() { return IVaultHost.tileTreeRequestTimeout; }
  protected get _operationName() { return "requestTileTreeProps"; }
  protected stringify(props: TileRequestProps): string { return props.treeId; }
  protected addMetadata(meta: any, props: TileRequestProps): void {
    meta.treeId = props.treeId;
  }

  private static _instance?: RequestTileTreePropsMemoizer;

  private constructor() {
    super(getTileTreeProps, generateTileRequestKey);
    IVaultHost.onBeforeShutdown.addOnce(() => {
      this[Symbol.dispose]();
      RequestTileTreePropsMemoizer._instance = undefined;
    });
  }

  public static async perform(props: TileRequestProps): Promise<IVaultTileTreeProps> {
    if (undefined === this._instance)
      this._instance = new RequestTileTreePropsMemoizer();

    return this._instance.perform(props);
  }
}

interface TileContentRequestProps extends TileRequestProps {
  contentId: string;
  guid?: string;
}

async function getTileContent(props: TileContentRequestProps): Promise<TileContentSource> {
  assert(undefined !== props.accessToken);
  const db = await RpcBriefcaseUtility.findOpenIVault(props.accessToken, props.tokenProps);
  const tile = await db.tiles.requestTileContent(props.treeId, props.contentId);

  // ###TODO: Verify the guid supplied by the front-end matches the guid stored in the model?
  if (IVaultHost.usingExternalTileCache) {
    const tileMetadata: Metadata = {
      backendName: IVaultHost.applicationId,
      tileGenerationTime: tile.elapsedSeconds.toString(),
      tileSize: tile.content.byteLength.toString(),
    };
    await IVaultHost.tileStorage?.uploadTile(props.tokenProps.iVaultId ?? db.iVaultId, props.tokenProps.changeset?.id ?? db.changeset.id, props.treeId, props.contentId, tile.content, props.guid, tileMetadata);
    const { accessToken: _, ...safeProps } = props;
    Logger.logInfo(BackendLoggerCategory.IVaultTileRequestRpc, "Generated and uploaded tile", { tileMetadata, ...safeProps });

    return TileContentSource.ExternalCache;
  }

  return TileContentSource.Backend;
}

function generateTileContentKey(props: TileContentRequestProps): string {
  return `${generateTileRequestKey(props)}:${props.contentId}`;
}

class RequestTileContentMemoizer extends TileRequestMemoizer<TileContentSource, TileContentRequestProps> {
  protected get _timeoutMilliseconds() { return IVaultHost.tileContentRequestTimeout; }
  protected get _operationName() { return "requestTileContent"; }
  protected stringify(props: TileContentRequestProps): string { return `${props.treeId}:${props.contentId}`; }
  protected addMetadata(meta: any, props: TileContentRequestProps): void {
    meta.treeId = props.treeId;
    meta.contentId = props.contentId;
  }

  private static _instance?: RequestTileContentMemoizer;

  private constructor() {
    super(getTileContent, generateTileContentKey);
    IVaultHost.onBeforeShutdown.addOnce(() => {
      this[Symbol.dispose]();
      RequestTileContentMemoizer._instance = undefined;
    });
  }

  public static get instance() {
    if (undefined === this._instance)
      this._instance = new RequestTileContentMemoizer();

    return this._instance;
  }

  public static async perform(props: TileContentRequestProps): Promise<TileContentSource> {
    return this.instance.perform(props);
  }
}

function currentActivity() {
  return RpcTrace.expectCurrentActivity;
}

/** @internal */
export class IVaultTileRpcImpl extends RpcInterface implements IVaultTileRpcInterface {
  public static register() { RpcManager.registerImpl(IVaultTileRpcInterface, IVaultTileRpcImpl); }

  public async requestTileTreeProps(tokenProps: IVaultRpcProps, treeId: string): Promise<IVaultTileTreeProps> {
    return RequestTileTreePropsMemoizer.perform({ accessToken: currentActivity().accessToken, tokenProps, treeId });
  }

  public async purgeTileTrees(tokenProps: IVaultRpcProps, modelIds: Id64Array | undefined): Promise<void> {
    // `undefined` gets forwarded as `null`...
    if (null === modelIds)
      modelIds = undefined;

    const db = await RpcBriefcaseUtility.findOpenIVault(currentActivity().accessToken, tokenProps);
    if (!db.isOpen) {
      return;
    }

    return db[_nativeDb].purgeTileTrees(modelIds);
  }

  public async generateTileContent(tokenProps: IVaultRpcProps, treeId: string, contentId: string, guid: string | undefined): Promise<TileContentSource> {
    return RequestTileContentMemoizer.perform({ accessToken: currentActivity().accessToken, tokenProps, treeId, contentId, guid });
  }

  public async retrieveTileContent(tokenProps: IVaultRpcProps, key: TileContentIdentifier): Promise<Uint8Array> {
    const db = await RpcBriefcaseUtility.findOpenIVault(currentActivity().accessToken, tokenProps);
    return db.tiles.getTileContent(key.treeId, key.contentId);
  }

  public async getTileCacheConfig(tokenProps: IVaultRpcProps): Promise<TransferConfig | undefined> {
    if (IVaultHost.tileStorage === undefined)
      return undefined;
    const iVaultId = tokenProps.iVaultId ?? (await RpcBriefcaseUtility.findOpenIVault(currentActivity().accessToken, tokenProps)).iVaultId;
    return IVaultHost.tileStorage.getDownloadConfig(iVaultId);
  }

  public async queryVersionInfo(): Promise<TileVersionInfo> {
    return IVaultNative.platform.getTileVersionInfo();
  }

  /** @internal */
  public async requestElementGraphics(rpcProps: IVaultRpcProps, request: ElementGraphicsRequestProps): Promise<Uint8Array | undefined> {
    const iVault = await RpcBriefcaseUtility.findOpenIVault(currentActivity().accessToken, rpcProps);
    return iVault.generateElementGraphics(request);
  }
}

/** @internal */
export async function cancelTileContentRequests(tokenProps: IVaultRpcProps, contentIds: TileTreeContentIds[]): Promise<void> {
  const iVault = IVaultDb.findByKey(tokenProps.key);
  const props: TileContentRequestProps = { tokenProps, treeId: "", contentId: "" };

  for (const entry of contentIds) {
    props.treeId = entry.treeId;
    for (const contentId of entry.contentIds) {
      props.contentId = contentId;
      RequestTileContentMemoizer.instance.deleteMemoized(props);
    }

    iVault[_nativeDb].cancelTileContentRequests(entry.treeId, entry.contentIds);
  }
}
