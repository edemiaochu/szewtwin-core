/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { FrontendStorage, TransferConfig } from "@szewtwin/object-storage-core/lib/frontend";
import { getTileObjectReference, IVaultRpcProps, IVaultTileRpcInterface } from "@szewtwin/core-common";

/** @beta */
export class TileStorage {
  public constructor(public readonly storage: FrontendStorage) { }

  private _transferConfigs: Map<string, TransferConfig | undefined> = new Map();
  private _pendingTransferConfigRequests: Map<string, Promise<TransferConfig | undefined>> = new Map();

  public async downloadTile(
    tokenProps: IVaultRpcProps,
    iVaultId: string,
    changesetId: string,
    treeId: string,
    contentId: string,
    guid?: string,
  ): Promise<Uint8Array | undefined> {
    const transferConfig = await this.getTransferConfig(tokenProps, iVaultId);
    if(transferConfig === undefined)
      return undefined;
    try {
      const buffer = await this.storage.download({
        reference: getTileObjectReference(iVaultId, changesetId, treeId, contentId, guid),
        transferConfig,
        transferType: "buffer",
      });

      return new Uint8Array(buffer); // should always be Buffer because transferType === "buffer"
    } catch {
      // @szewtwin/object-storage re-throws internal implementation-specific errors, so let's treat them all as 404 for now.
      return undefined;
    }
  }

  private async getTransferConfig(tokenProps: IVaultRpcProps, iVaultId: string): Promise<TransferConfig | undefined> {
    if(this._transferConfigs.has(iVaultId)) {
      const transferConfig = this._transferConfigs.get(iVaultId);
      if(transferConfig === undefined)
        return undefined;
      if(transferConfig.expiration > new Date())
        return transferConfig;
      else // Refresh expired transferConfig
        return this.sendTransferConfigRequest(tokenProps, iVaultId);
    }
    return this.sendTransferConfigRequest(tokenProps, iVaultId);
  }

  private async sendTransferConfigRequest(tokenProps: IVaultRpcProps, iVaultId: string): Promise<TransferConfig | undefined> {
    const pendingRequest = this._pendingTransferConfigRequests.get(iVaultId);
    if(pendingRequest !== undefined)
      return pendingRequest;

    const request = (async () => {
      const config = await IVaultTileRpcInterface.getClient().getTileCacheConfig(tokenProps);
      this._transferConfigs.set(iVaultId, config);
      this._pendingTransferConfigRequests.delete(iVaultId);
      return config;
    })();
    this._pendingTransferConfigRequests.set(iVaultId, request);
    return request;
  }
}
