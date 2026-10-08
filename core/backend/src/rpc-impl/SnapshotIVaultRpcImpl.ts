/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import {
  IVaultConnectionProps, IVaultNotFoundResponse, IVaultRpcProps, RpcInterface, RpcManager, SnapshotIVaultRpcInterface, SnapshotOpenOptions,
} from "@szewtwin/core-common";
import { SnapshotDb } from "../IVaultDb";
import { IVaultHost } from "../IVaultHost";

/* eslint-disable @typescript-eslint/no-deprecated */

/** The backend implementation of SnapshotIVaultRpcInterface.
 * @internal
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Check [[IpcAppFunctions]] for replacements.
 */
export class SnapshotIVaultRpcImpl extends RpcInterface implements SnapshotIVaultRpcInterface {
  public static register() { RpcManager.registerImpl(SnapshotIVaultRpcInterface, SnapshotIVaultRpcImpl); }

  /** Ask the backend to open a snapshot iVault from a file name that is resolved by the backend. */
  public async openFile(filePath: string, opts?: SnapshotOpenOptions): Promise<IVaultConnectionProps> {
    let resolvedFileName: string | undefined = filePath;
    if (IVaultHost.snapshotFileNameResolver) {
      resolvedFileName = IVaultHost.snapshotFileNameResolver.tryResolveFileName(filePath);
      if (undefined === resolvedFileName)
        throw new IVaultNotFoundResponse(); // eslint-disable-line @typescript-eslint/only-throw-error
    }
    return SnapshotDb.openFile(resolvedFileName, opts).getConnectionProps();
  }

  /** Ask the backend to open a snapshot iVault from a key that is resolved by the backend. */
  public async openRemote(fileKey: string, opts?: SnapshotOpenOptions): Promise<IVaultConnectionProps> {
    const resolvedFileName = IVaultHost.snapshotFileNameResolver?.resolveKey(fileKey);
    if (undefined === resolvedFileName)
      throw new IVaultNotFoundResponse(); // eslint-disable-line @typescript-eslint/only-throw-error

    return SnapshotDb.openFile(resolvedFileName, { key: fileKey, ...opts }).getConnectionProps();
  }

  /** Ask the backend to close a snapshot iVault. */
  public async close(tokenProps: IVaultRpcProps): Promise<boolean> {
    SnapshotDb.findByKey(tokenProps.key).close();
    return true;
  }
}
