/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, DMSqlReader, IVaultReadRpcInterface, type IVaultRpcProps, QueryBinder, QueryOptions, QueryRowFormat } from "@szewtwin/core-common";
import { DMSqlQueryOptions, DMSqlSchemaLocater, DMSqlSchemaLocaterOptions, SchemaKey, SchemaProps } from "@szewtwin/dmschema-metadata";
import { DMSchemaRpcInterface } from "./DMSchemaRpcInterface";

/**
 * A [[DMSqlSchemaLocater]]($dmschema-metadata) implementation that uses the DMSchema RPC interfaces to load schemas incrementally.
 * @beta
 */
export class RpcIncrementalSchemaLocater extends DMSqlSchemaLocater {
  private readonly _iVaultProps: IVaultRpcProps;

  /**
   * Initializes a new instance of the RpcIncrementalSchemaLocater class.
   */
  constructor(iVaultProps: IVaultRpcProps, options?: DMSqlSchemaLocaterOptions) {
    super(options);
    this._iVaultProps = iVaultProps;
  }

  /**
   * Executes the given DMSql query and returns the resulting rows.
   * @param query The DMSql query to execute.
   * @param options Optional arguments to control the query result.
   * @returns A promise that resolves to the resulting rows.
   */
  protected override async executeQuery<TRow>(query: string, options?: DMSqlQueryOptions): Promise<ReadonlyArray<TRow>> {
    const dmSqlQueryClient = IVaultReadRpcInterface.getClient();
    const queryExecutor: DbRequestExecutor<DbQueryRequest, DbQueryResponse> = {
      execute: async (request) => dmSqlQueryClient.queryRows(this._iVaultProps, request),
    };

    const queryOptions: QueryOptions = {
      limit: { count: options?.limit },
      rowFormat: QueryRowFormat.UseDMSqlPropertyNames,
    };

    const queryParameters = options && options.parameters ? QueryBinder.from(options.parameters) : undefined;
    const queryReader = new DMSqlReader(queryExecutor, query, queryParameters, queryOptions);

    return queryReader.toArray();
  }

  /**
   * Gets the [[SchemaProps]]($dmschema-metadata) for the given [[SchemaKey]]($dmschema-metadata).
   * This is the full schema json with all elements that are defined in the schema.
   * @param schemaKey The schema key of the schema to be resolved.
   */
  protected async getSchemaProps(schemaKey: SchemaKey): Promise<SchemaProps | undefined> {
    const rpcSchemaClient = DMSchemaRpcInterface.getClient();
    return rpcSchemaClient.getSchemaJSON(this._iVaultProps, schemaKey.name);
  };
}
