/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as backend from "@szewtwin/core-backend";
import { IVaultRpcProps, QueryRowFormat, RpcInterface, RpcManager } from "@szewtwin/core-common";
import { SchemaKeyProps, SchemaProps } from "@szewtwin/dmschema-metadata";
import { DMSchemaRpcInterface } from "@szewtwin/dmschema-rpcinterface-common";

/**
 * Defines the interface how the rows of the iVault query look like.
 * @internal
 */
interface SchemaNameRow {
  schemaName: string;
  read: string;
  write: string;
  minor: string;
}

/**
 * Implementation of the SchemaRpcInterface.
 * @internal
 */
export class DMSchemaRpcImpl extends RpcInterface implements DMSchemaRpcInterface {
  /**
   * Registers the RPC interface with its corresponding implementation class.
   */
  public static register() {
    RpcManager.registerImpl(DMSchemaRpcInterface, DMSchemaRpcImpl);
  }

  /**
   * Gets an iVaultDb instance. It is important that the database has been opened before
   * otherwise it can't be found.
   * @param tokenProps        The iVaultToken props that hold the information which iVault is used.
   * @returns                 Instance of IVaultDb.
   */
  private async getIVaultDatabase(tokenProps: IVaultRpcProps): Promise<backend.IVaultDb> {
    return new Promise<backend.IVaultDb>((resolve) => {
      resolve(backend.IVaultDb.findByKey(tokenProps.key));
    });
  }

  /**
   * Returns an array of SchemaKeyProps that exists in the current iVault context. The client can call
   * SchemaKey.fromJson() to parse the props to a SchemaKey.
   * @param tokenProps        The iVaultToken props that hold the information which iVault is used.
   * @returns                 An array of SchemaKeyProps.
   */
  public async getSchemaKeys(tokenProps: IVaultRpcProps): Promise<SchemaKeyProps[]> {

    const schemaKeyProps: SchemaKeyProps[] = [];
    const iVaultDb = await this.getIVaultDatabase(tokenProps);

    const schemaNameQuery = `SELECT Name as schemaName, VersionMajor as read, VersionWrite as write, VersionMinor as minor FROM main.meta.DMSchemaDef`;
    for await (const row of iVaultDb.createQueryReader(schemaNameQuery, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames })) {
      const schemaDefinitionRow = row.toRow() as SchemaNameRow;
      const schemaFullName = schemaDefinitionRow.schemaName;
      const read = Number(schemaDefinitionRow.read);
      const write = Number(schemaDefinitionRow.write);
      const minor = Number(schemaDefinitionRow.minor);
      schemaKeyProps.push({ name: schemaFullName, read, write, minor });
    }
    return schemaKeyProps;
  }

  /**
   * Gets the schema JSON for the current iVault context and returns the schema as a SchemaProps which
   * the client can call Schema.fromJson() to return a Schema.
   * @param tokenProps        The iVaultToken props that hold the information which iVault is used.
   * @param schemaName        The name of the schema that shall be returned.
   * @returns                 The SchemaProps.
   */
  public async getSchemaJSON(tokenProps: IVaultRpcProps, schemaName: string): Promise<SchemaProps | undefined> {
    if (schemaName === undefined || schemaName.length < 1) {
      throw new Error(`Schema name must not be undefined or empty.`);
    }

    const iVaultDb = await this.getIVaultDatabase(tokenProps);

    try {
      return iVaultDb[backend._nativeDb].getSchemaProps(schemaName);
    } catch(e: any) {
      if (e.message && e.message === "schema not found")
        return undefined;

      throw(e);
    }
  }
}
