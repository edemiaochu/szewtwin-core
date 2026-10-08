/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

/* eslint-disable @typescript-eslint/no-deprecated */

import { IVaultConnectionProps, IVaultRpcProps, SnapshotOpenOptions } from "../IVault";
import { RpcInterface } from "../RpcInterface";
import { RpcManager } from "../RpcManager";
import { RpcOperation } from "./core/RpcOperation";
import { RpcRequestTokenSupplier_T } from "./core/RpcRequest";
import { RpcRoutingToken } from "./core/RpcRoutingToken";

const unknownIVaultId: RpcRequestTokenSupplier_T = (req) => ({ iVaultId: "undefined", key: req.parameters[0] });

/** The RPC interface for working with *snapshot* iVaults.
 * This interface is intended for desktop and mobile products. Web products are discouraged from registering this interface.
 * @internal
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Check [[IpcAppFunctions]] or [[CheckpointConnection]] for replacements.
 */
export abstract class SnapshotIVaultRpcInterface extends RpcInterface {
  /** Returns the SnapshotIVaultRpcInterface client instance for the frontend. */
  public static getClient(): SnapshotIVaultRpcInterface { return RpcManager.getClientForInterface(SnapshotIVaultRpcInterface); }

  /** Returns the SnapshotIVaultRpcInterface client instance for a custom RPC routing configuration. */
  public static getClientForRouting(token: RpcRoutingToken): SnapshotIVaultRpcInterface { return RpcManager.getClientForInterface(SnapshotIVaultRpcInterface, token); }

  /** The immutable name of the interface. */
  public static readonly interfaceName = "SnapshotIVaultRpcInterface";

  /** The version of the interface. */
  public static interfaceVersion = "2.0.0";

  /*===========================================================================================
    NOTE: Any add/remove/change to the methods below requires an update of the interface version.
    NOTE: Please consult the README in this folder for the semantic versioning rules.
  ===========================================================================================*/

  /**
   * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [[IpcAppFunctions.openSnapshot]] in IPC applications, no replacement for Web applications.
   */
  @RpcOperation.setRoutingProps(unknownIVaultId)
  public async openFile(_filePath: string, _opts?: SnapshotOpenOptions): Promise<IVaultConnectionProps> { return this.forward(arguments); }

  /**
   * @deprecated in 4.10 - will not be removed until after 2026-06-13. Use [[CheckpointConnection.openRemote]].
   */
  @RpcOperation.setRoutingProps(unknownIVaultId)
  public async openRemote(_key: string, _opts?: SnapshotOpenOptions): Promise<IVaultConnectionProps> { return this.forward(arguments); }

  /**
   * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [[IpcAppFunctions.closeIVault]] in IPC applications, no replacement for Web applications.
   */
  public async close(_iVaultRpcProps: IVaultRpcProps): Promise<boolean> { return this.forward(arguments); }
}
