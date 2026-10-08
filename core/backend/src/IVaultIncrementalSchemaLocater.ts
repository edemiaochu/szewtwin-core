/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */
import { DMSqlQueryOptions, DMSqlSchemaLocater, DMSqlSchemaLocaterOptions, SchemaKey, SchemaProps } from "@szewtwin/dmschema-metadata";
import { QueryBinder, QueryRowFormat } from "@szewtwin/core-common";
import { IVaultDb } from "./IVaultDb";

/**
 * A [[DMSqlSchemaLocater]]($dmschema-metadata) implementation that uses the [[IVaultDb]] to load schemas incrementally.
 * @beta
 */
export class IVaultIncrementalSchemaLocater extends DMSqlSchemaLocater {
  private readonly _iVault: IVaultDb;

  /**
   * Constructs a new IVaultIncrementalSchemaLocater instance.
   * @param iVault The [[IVaultDb]] to query.
   * @param options Optional [[DMSqlSchemaLocaterOptions]]($dmschema-metadata).
   */
  constructor(iVault: IVaultDb, options?: DMSqlSchemaLocaterOptions) {
    super(options ?? { useMultipleQueries: true });
    this._iVault = iVault;
  }

  /**
   * Gets [[SchemaProps]]($dmschema-metadata) for the given [[SchemaKey]]($dmschema-metadata).
   * This is the full schema json with all elements that are defined in the schema.
   * @param schemaKey The key of the schema to be resolved.
   */
  protected async getSchemaProps(schemaKey: SchemaKey): Promise<SchemaProps | undefined> {
    // To keep the main thread from being blocked in sync loading cases the resolving
    // is triggered through a timeout. Even if there is no delay, it improves loading
    // time by ~3x.
    return new Promise((resolve, reject) => setTimeout(() => {
      try {
        resolve(this._iVault.getSchemaProps(schemaKey.name));
      }
      catch (error: any) {
        reject(error as Error);
      }
    }, 0));
  }

  /**
   * Executes an DMSql query against the IVaultDb.
   * @param query The query to execute
   * @param options The [[DMSqlQueryOptions]]($dmschema-metadata) to use.
   * @returns A promise that resolves to read-only array of type TRow.
   */
  protected async executeQuery<TRow>(query: string, options?: DMSqlQueryOptions): Promise<ReadonlyArray<TRow>> {
    const queryParameters = options && options.parameters ? QueryBinder.from(options.parameters) : undefined;

    return this._iVault
      .createQueryReader(query, queryParameters, {
        rowFormat: QueryRowFormat.UseDMSqlPropertyNames,
        limit: { count: options?.limit },
      })
      .toArray();
  }
}