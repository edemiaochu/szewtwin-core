/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IVaultRpcProps, RpcInterface, RpcManager, RpcOperation, RpcResponseCacheControl } from "@szewtwin/core-common";
import { SchemaKeyProps, SchemaProps } from "@szewtwin/dmschema-metadata";

/***
 * Defines an RPC interface to get schema information from a given iVault context.
 * Method @see getSchemaNames will return the names of schemas that live in this iVault.
 * The actual schemas can be downloaded using @see getSchemaJSON to get the schema as JSON props.
 * @internal
 */
export abstract class DMSchemaRpcInterface extends RpcInterface {
  /** The version of the RPC Interface. */
  public static version = "2.0.0";

  public static readonly interfaceName = "DMSchemaRpcInterface";
  public static interfaceVersion = DMSchemaRpcInterface.version;

  /**
   * Returns the RPC client instance for the frontend.
   * @returns                 A client to communicate with the RPC Interface.
   */
  public static getClient(): DMSchemaRpcInterface {
    return RpcManager.getClientForInterface(DMSchemaRpcInterface);
  }

  /**
   * Returns an array of SchemaKeyProps that exists in the current iVault context. The client can call
   * SchemaKey.fromJson() to parse the props to a SchemaKey.
   * @param tokenProps        The iVaultToken props that hold the information which iVault is used.
   * @returns                 An array of SchemaKeyProps.
   */
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getSchemaKeys(_tokenProps: IVaultRpcProps): Promise<SchemaKeyProps[]> {
    return this.forward.apply(this, [arguments]) as Promise<SchemaKeyProps[]>;
  }

  /**
   * Gets the schema JSON for the current iVault context and returns the schema as a SchemaProps which
   * the client can call Schema.fromJson() to return a Schema.
   * @param tokenProps        The iVaultToken props that hold the information which iVault is used.
   * @param schemaName        The name of the schema that shall be returned.
   * @returns                 The SchemaProps.
   */
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getSchemaJSON(_tokenProps: IVaultRpcProps, _schemaName: string): Promise<SchemaProps | undefined> {
    return this.forward.apply(this, [arguments]) as Promise<SchemaProps | undefined>;
  }

}
