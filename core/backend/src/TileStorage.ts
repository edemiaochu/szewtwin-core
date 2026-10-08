/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { gunzip, gzip } from "zlib";
import { promisify } from "util";
import type { Metadata, ObjectReference, ServerStorage, TransferConfig } from "@szewtwin/object-storage-core";
import { getTileObjectReference } from "@szewtwin/core-common";
import { Logger } from "@szewtwin/core-szewec";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { IVaultHost } from "./IVaultHost";

/**
 * Identifies a tile in cloud tile cache.
 * @beta
 */
export interface TileId {
  treeId: string;
  contentId: string;
  guid: string;
}

/**
 * Facilitates interaction with cloud tile cache.
 * @beta
 */
export class TileStorage {
  /**
   * Allows using the underlying `ServerStorage` API directly.
   * @see https://github.com/szewTwin/object-storage/
   */
  public readonly storage: ServerStorage;

  public constructor(storage: ServerStorage) {
    this.storage = storage;
  }

  private _initializedIVaults: Set<string> = new Set();

  /**
   * Ensures any required cloud storage resources for a specific iVault are ready to use.
   */
  public async initialize(iVaultId: string): Promise<void> {
    if (this._initializedIVaults.has(iVaultId))
      return;
    if (!(await this.storage.baseDirectoryExists({ baseDirectory: iVaultId }))) {
      try {
        await this.storage.createBaseDirectory({ baseDirectory: iVaultId });
      } catch (e: any) {
        // Ignore 409 errors. This is what Azure blob storage returns when the container already exists.
        // Usually this means multiple backends tried to initialize tile storage at the same time.
        if(e.statusCode !== 409)
          throw e;
      }
    }
    this._initializedIVaults.add(iVaultId);
  }

  /**
   * Returns config that can be used by frontends to download tiles
   * @param iVaultId Id of the iVault
   * @param expiresInSeconds Optional number of seconds until the download URL expires. Defaults to expiring exactly at midnight of next Sunday to enable persistent client-side caching.
   *  It is recommended to set this to a shorter period when using S3-compatible storage - an exact expiry date cannot be ensured due to limitations in their API.
   * @see [TileStorage]($frontend)
   */
  public async getDownloadConfig(iVaultId: string, expiresInSeconds?: number): Promise<TransferConfig> {
    try {
      if (expiresInSeconds !== undefined)
        return await this.storage.getDownloadConfig({ baseDirectory: iVaultId }, { expiresInSeconds });
      const expiresOn = new Date();
      expiresOn.setDate(expiresOn.getDate() + (7 - expiresOn.getDay())); // next Sunday
      expiresOn.setHours(0, 0, 0, 0); // exactly at midnight
      return await this.storage.getDownloadConfig({ baseDirectory: iVaultId }, { expiresOn });
    } catch (err) {
      this.logException("Failed to get download config", err);
      throw err;
    }
  }

  /**
   * Uploads a tile to the cloud cache.
   */
  public async uploadTile(iVaultId: string, changesetId: string, treeId: string, contentId: string, content: Uint8Array, guid?: string, metadata?: Metadata): Promise<void> {
    try {
      await this.storage.upload(
        getTileObjectReference(iVaultId, changesetId, treeId, contentId, guid),
        Buffer.from(IVaultHost.compressCachedTiles ? await promisify(gzip)(content.buffer) : content.buffer),
        metadata,
        IVaultHost.compressCachedTiles ? { contentEncoding: "gzip" } : undefined,
      );
    } catch (err) {
      this.logException("Failed to upload tile", err);
      throw err;
    }
  }

  /**
   * Downloads a tile from the cloud cache.
   */
  public async downloadTile(iVaultId: string, changesetId: string, treeId: string, contentId: string, guid?: string): Promise<Uint8Array> {
    try {
      const buffer = await this.storage.download(
        getTileObjectReference(iVaultId, changesetId, treeId, contentId, guid),
        "buffer",
      );
      return IVaultHost.compressCachedTiles ? await promisify(gunzip)(buffer) : buffer;
    } catch (err) {
      this.logException("Failed to download tile", err);
      throw err;
    }
  }

  /**
   * Returns an async iterator of all tiles that are found in the cloud cache.
   */
  public async *getCachedTilesGenerator(iVaultId: string): AsyncGenerator<TileId> {
    const iterator = this.getCachedTilePages(iVaultId);
    for await (const page of iterator) {
      for (const tile of page) {
        yield tile;
      }
    }
  }

  private async *getCachedTilePages(iVaultId: string): AsyncGenerator<TileId[]> {
    const iterator = this.storage.getListObjectsPagedIterator({ baseDirectory: iVaultId }, 500);
    let prevPage: IteratorResult<ObjectReference[], any> | undefined;
    do {
      // initiate loading the next page
      const page = iterator.next();
      // process results from the previous page
      if (prevPage)
        yield this.convertPage(prevPage.value);
      // finish loading the next page
      prevPage = await page;
    } while (!prevPage.done);
  }

  private convertPage(page: ObjectReference[]): TileId[] {
    return page
      .map((objectReference) => ({
        parts: objectReference.relativeDirectory?.split("/") ?? [""],
        objectName: objectReference.objectName,
      }))
      .filter(({ parts, objectName }) => {
        if (parts[0] !== "tiles")
          return false;
        if (parts.length !== 3) {
          Logger.logWarning(BackendLoggerCategory.IVaultTileStorage, "Malformed tile id found in tile cache: {tileId}", { tileId: [...parts, objectName].join("/") });
          return false;
        }
        return true;
      }).map(({ parts, objectName }) => {
        // relativeDirectory = tiles/<treeId>/<guid>
        // objectName = <contentId>
        return {
          treeId: parts[1],
          contentId: objectName,
          guid: parts[2],
        };
      });
  }

  /**
   * Returns a list of all tiles that are found in the cloud cache.
   */
  public async getCachedTiles(iVaultId: string): Promise<TileId[]> {
    const results: TileId[] = [];
    for await (const page of this.getCachedTilePages(iVaultId)) {
      results.push(...page);
    }
    return results;
  }

  /**
   * Returns a boolean indicating whether a tile exists in the cloud cache
   */
  public async isTileCached(iVaultId: string, changesetId: string, treeId: string, contentId: string, guid?: string): Promise<boolean> {
    return this.storage.objectExists(getTileObjectReference(iVaultId, changesetId, treeId, contentId, guid));
  }

  private logException(message: string, err: unknown): void {
    Logger.logError(
      BackendLoggerCategory.IVaultTileStorage,
      err,
      { errorMessage: message },
    );
  }
}
