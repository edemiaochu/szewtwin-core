/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, compareStrings, SortedArray } from "@szewtwin/core-szewec";
import { TileTreeContentIds } from "@szewtwin/core-common";
import { IVaultApp } from "../../IVaultApp";
import { IpcApp } from "../../IpcApp";
import { IVaultConnection } from "../../IVaultConnection";
import { IVaultTile, IVaultTileContent, Tile, TileRequest, TileRequestChannel, TileTree } from "../../tile/internal";

/** Handles requests to the cloud storage tile cache, if one is configured. If a tile's content is not found in the cache, subsequent requests for the same tile will
 * use the IVaultTileChannel instead.
 */
class CloudStorageCacheChannel extends TileRequestChannel {
  public override async requestContent(tile: Tile): Promise<TileRequest.Response> {
    assert(tile instanceof IVaultTile);
    return IVaultApp.tileAdmin.requestCachedTileContent(tile);
  }

  public override onNoContent(request: TileRequest): boolean {
    assert(request.tile instanceof IVaultTile);
    request.tile.requestChannel = IVaultApp.tileAdmin.channels.iVaultChannels.rpc;
    ++this._statistics.totalCacheMisses;
    return true;
  }
}

/** For an [[IpcApp]], allows backend tile generation requests in progress to be canceled. */
class IVaultTileChannel extends TileRequestChannel {
  private readonly _canceled = new Map<IVaultConnection, Map<string, Set<string>>>();

  public override onActiveRequestCanceled(request: TileRequest): void {
    const tree = request.tile.tree;
    let entry = this._canceled.get(tree.iVault);
    if (!entry)
      this._canceled.set(tree.iVault, entry = new Map<string, Set<string>>());

    let ids = entry.get(tree.id);
    if (!ids)
      entry.set(tree.id, ids = new Set<string>());

    ids.add(request.tile.contentId);
  }

  public override processCancellations(): void {
    for (const [ivault, entries] of this._canceled) {
      const treeContentIds: TileTreeContentIds[] = [];
      for (const [treeId, tileIds] of entries) {
        const contentIds = Array.from(tileIds);
        treeContentIds.push({ treeId, contentIds });
        this._statistics.totalAbortedRequests += contentIds.length;
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      IpcApp.appFunctionIpc.cancelTileContentRequests(ivault.getRpcProps(), treeContentIds);
    }

    this._canceled.clear();
  }

  public override onIVaultClosed(ivault: IVaultConnection): void {
    this._canceled.delete(ivault);
  }
}

interface CachedContent extends Omit<IVaultTileContent, "graphic"> {
  contentId: string;
  hasGraphic: boolean;
}

/** If TileAdmin.Props.cacheTileMetadata is true, then this is the first channel through which we request content for an IVaultTile.
 * It serves a niche purpose: a tile pre-generation agent that wants to ensure that every tile selected during interaction with the application
 * has its tile generated and cached in cloud storage. This agent might request thousands of tiles in sequence, causing a given tile to be discarded
 * and reloaded many times. To avoid pointlessly reloading tiles whose contents have already been generated, this channel caches the metadata for each tile;
 * on subsequent requests for the same tile, it produces the metadata and an empty RenderGraphic.
 */
class IVaultTileMetadataCacheChannel extends TileRequestChannel {
  private readonly _cacheByIVault = new Map<IVaultConnection, Map<TileTree, SortedArray<CachedContent>>>();

  public constructor() {
    super("szewtwinjs-ivault-metadata-cache", 100);
  }

  public override onNoContent(request: TileRequest): boolean {
    assert(request.tile instanceof IVaultTile);
    const channels = IVaultApp.tileAdmin.channels.iVaultChannels;
    request.tile.requestChannel = channels.cloudStorage ?? channels.rpc;
    return true;
  }

  public override async requestContent(tile: Tile): Promise<TileRequest.Response> {
    assert(tile instanceof IVaultTile);
    const content = this.getCachedContent(tile);
    return content ? { content } : undefined;
  }

  public getCachedContent(tile: IVaultTile): IVaultTileContent | undefined {
    const cached = this._cacheByIVault.get(tile.iVault)?.get(tile.tree)?.findEquivalent((x) => compareStrings(x.contentId, tile.contentId));
    if (!cached)
      return undefined;

    const content: IVaultTileContent = {
      ...cached,
      graphic: cached.hasGraphic ? IVaultApp.renderSystem.createGraphicList([]) : undefined,
      contentRange: cached.contentRange?.clone(),
    };

    return content;
  }

  public override onIVaultClosed(ivault: IVaultConnection): void {
    this._cacheByIVault.delete(ivault);
  }

  public registerChannel(channel: TileRequestChannel): void {
    channel.contentCallback = (tile, content) => this.cache(tile, content);
  }

  private cache(tile: Tile, content: IVaultTileContent): void {
    assert(tile instanceof IVaultTile);
    let trees = this._cacheByIVault.get(tile.iVault);
    if (!trees)
      this._cacheByIVault.set(tile.iVault, trees = new Map<TileTree, SortedArray<CachedContent>>());

    let list = trees.get(tile.tree);
    if (!list)
      trees.set(tile.tree, list = new SortedArray<CachedContent>((lhs, rhs) => compareStrings(lhs.contentId, rhs.contentId)));

    assert(undefined === list.findEquivalent((x) => compareStrings(x.contentId, tile.contentId)));
    list.insert({
      contentId: tile.contentId,
      hasGraphic: undefined !== content.graphic,
      contentRange: content.contentRange?.clone(),
      isLeaf: content.isLeaf,
      sizeMultiplier: content.sizeMultiplier,
      emptySubRangeMask: content.emptySubRangeMask,
    });
  }
}

/** TileRequestChannels used for requesting content for IVaultTiles.
 */
export class IVaultTileRequestChannels {
  private _cloudStorage: TileRequestChannel;
  private readonly _contentCache?: IVaultTileMetadataCacheChannel;
  public readonly rpc: TileRequestChannel;

  public constructor(args: {
    concurrency: number;
    usesHttp: boolean;
    cacheMetadata: boolean;
    cacheConcurrency: number;
  }) {
    const channelName = "szewtwinjs-tile-rpc";
    this.rpc = args.usesHttp ? new TileRequestChannel(channelName, args.concurrency) : new IVaultTileChannel(channelName, args.concurrency);

    if (args.cacheMetadata) {
      this._contentCache = new IVaultTileMetadataCacheChannel();
      this._contentCache.registerChannel(this.rpc);
    }

    this._cloudStorage = new CloudStorageCacheChannel("szewtwinjs-cloud-cache", args.cacheConcurrency);
    this._contentCache?.registerChannel(this._cloudStorage);
  }

  public get cloudStorage(): TileRequestChannel {
    return this._cloudStorage;
  }

  public [Symbol.iterator](): Iterator<TileRequestChannel> {
    const channels = [this.rpc];
    if (this._cloudStorage)
      channels.push(this._cloudStorage);

    if (this._contentCache)
      channels.push(this._contentCache);

    return channels[Symbol.iterator]();
  }

  public setRpcConcurrency(concurrency: number): void {
    this.rpc.concurrency = concurrency;
  }

  public getChannelForTile(tile: IVaultTile): TileRequestChannel {
    return tile.requestChannel || this._contentCache || this._cloudStorage || this.rpc;
  }

  /** Strictly for tests. */
  public getCachedContent(tile: IVaultTile): IVaultTileContent | undefined {
    return this._contentCache?.getCachedContent(tile);
  }
}
