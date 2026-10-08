/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { IVaultError, QueryPropertyMetaData } from "@szewtwin/core-common";
import { IVaultDb } from "./IVaultDb";
import { DMSqlStatement } from "./DMSqlStatement";
import { DbResult } from "@szewtwin/core-szewec";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { _nativeDb } from "./internal/Symbols";
import { DMDb } from "./DMDb";

// --------------------------------------------------------------------------------------------
// Internal result types
// --------------------------------------------------------------------------------------------

/** Result of an internal operation that may fail with a message.
 * @internal
 */
interface OperationResult {
  isSuccessful: boolean;
  message?: string;
}

// --------------------------------------------------------------------------------------------
// DMSqlRowExecutor
// --------------------------------------------------------------------------------------------

/**
 * Executes DMSql queries one row at a time against an IVaultDb, maintaining statement state between
 * successive calls so the caller can page through results via offset-based requests.
 * @internal
 */
export class DMSqlRowExecutor implements Disposable {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private _stmt: DMSqlStatement;
  private _removeListener: () => void;

  public constructor(private readonly _db: IVaultDb | DMDb) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    this._stmt = new DMSqlStatement();
    this._removeListener = this._db.onBeforeClose.addListener(() => this.cleanup());
  }

  // --------------------------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------------------------

  /** Disposes the current statement and resets all internal state.
   * Invoked when the db signals that the executor must be recycled.
   * @internal
   */
  private cleanup(): void {
    this._stmt[Symbol.dispose]();
  }

  /** Call this function to dispose the row executor off.
   * @internal
   */
  public [Symbol.dispose](): void {
    this._removeListener();
    this.cleanup();
  }

  // --------------------------------------------------------------------------------------------
  // Core execution
  // --------------------------------------------------------------------------------------------

  /** Prepare the statement and bind parameters in one step.
   * Call once during reader initialization — avoids the per-row `ensureStatementReady` check.
   * @param query - The DMSql text to prepare.
   * @param args - Optional bind parameters.
   * @throws IVaultError on preparation or binding failure.
   * @internal
   */
  public prepareAndBind(query: string, args?: object): void {

    const prepResult = this.prepareStmt(query);
    if (!prepResult.isSuccessful)
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, prepResult.message ?? `Failed to prepare statement: ${query}`);

    if (args) {
      const bindResult = this.bindValues(args);
      if (!bindResult.isSuccessful)
        throw new IVaultError(DbResult.BE_SQLITE_ERROR, bindResult.message ?? `Failed to bind values: ${query}`);
    }
  }

  /** Fast-path: step the cursor once and return row data directly.
   *
   * Returns the row data array if a row is available.
   * Returns `undefined` if the result set is exhausted (DONE).
   *
   * This avoids all intermediate object allocations (StepResult, RowDataResult,
   * DbRuntimeStats, DbQueryResponse) that the general `execute()` path creates per row.
   *
   * @param options - Native row-adaptor options (should be cached and reused across rows).
   * @throws IVaultError on step failure or row extraction failure.
   * @internal
   */
  public stepNextRow(options: IVaultJsNative.DMSqlRowAdaptorOptions): any {
    if (!this._stmt.isPrepared)
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "Statement is not prepared. Likely cause: the db was closed before step is called or the DMSqlSyncReader is used outside the context of the callback passed to withQueryReader.");
    const stepResult = this._stmt.step();
    if (stepResult === DbResult.BE_SQLITE_ROW)
      return this._stmt.toRow(options).data;
    if (stepResult === DbResult.BE_SQLITE_DONE)
      return undefined;
    throw new IVaultError(stepResult, `Step failed with code ${stepResult}`);
  }

  /** Get column metadata directly from the prepared statement.
   * Call once after `prepareAndBind` — the metadata does not change between rows.
   * @param options - Native row-adaptor options that influence property naming.
   * @returns Array of column metadata.
   * @internal
   */
  public fetchMetadata(options: IVaultJsNative.DMSqlRowAdaptorOptions): QueryPropertyMetaData[] {
    return this._stmt.getMetadata(options).properties;
  }

  // --------------------------------------------------------------------------------------------
  // Execution phases
  // --------------------------------------------------------------------------------------------

  /** Prepares the DMSql statement against the native database and records the elapsed preparation time.
   * @param dmsql - The DMSql text to prepare.
   * @returns An `OperationResult` indicating success or failure.
   * @internal
   */
  private prepareStmt(dmsql: string): OperationResult {
    try {
      this._stmt.prepare(this._db[_nativeDb], dmsql);
      return { isSuccessful: true };
    } catch (error: any) {
      return { isSuccessful: false, message: error.message };
    }
  }

  /** Resets the statement and binds the given parameter values. Caches the arguments for later
   * comparison so that redundant rebinds can be skipped.
   * @param args - The parameter object to bind, or `undefined` when no parameters are needed.
   * @returns An `OperationResult` indicating success or failure.
   * @internal
   */
  private bindValues(args: object | undefined): OperationResult {
    try {
      if (args === undefined)
        return { isSuccessful: true };

      this._stmt.bindParams(args);
      return { isSuccessful: true };
    } catch (error: any) {
      return { isSuccessful: false, message: error.message };
    }
  }
}