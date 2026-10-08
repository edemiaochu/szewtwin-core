import { IVaultJsNative } from "@szewec/ivaultjs-native";
/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbBlobRequest, DbBlobResponse, DbQueryConfig, DbQueryRequest, DbQueryResponse, DbRequestKind } from "@szewtwin/core-common";

/** @internal */
export type OnResponse = (response: Response) => void;

/** @internal */
export class ConcurrentQuery {
  /** @internal */
  public static async executeQueryRequest(conn: IVaultJsNative.DMDb | IVaultJsNative.BldDb, request: DbQueryRequest): Promise<DbQueryResponse> {
    return new Promise<DbQueryResponse>((resolve) => {
      request.kind = DbRequestKind.DMSql;
      conn.concurrentQueryExecute(request, (response: any) => {
        resolve(response as DbQueryResponse);
      });
    });
  }
  /** @internal */
  public static async executeBlobRequest(conn: IVaultJsNative.DMDb | IVaultJsNative.BldDb, request: DbBlobRequest): Promise<DbBlobResponse> {
    return new Promise<DbBlobResponse>((resolve) => {
      request.kind = DbRequestKind.BlobIO;
      conn.concurrentQueryExecute(request, (response: any) => {
        resolve(response as DbBlobResponse);
      });
    });
  }
  public static resetConfig(conn: IVaultJsNative.DMDb | IVaultJsNative.BldDb, config?: DbQueryConfig): DbQueryConfig {
    return conn.concurrentQueryResetConfig(config);
  }
  public static shutdown(conn: IVaultJsNative.DMDb | IVaultJsNative.BldDb) {
    conn.concurrentQueryShutdown();
  }
}
