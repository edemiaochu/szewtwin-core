/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DMSQL
 */

import { assert, DbResult, GuidString, Id64String } from "@szewtwin/core-szewec";
import { LowAndHighXYZ, Range3d, XAndY, XYAndZ, XYZ } from "@szewtwin/core-geometry";
import { DMJsNames, DMSqlValueType, IVaultError, NavigationBindingValue, NavigationValue, PropertyMetaDataMap, QueryRowFormat } from "@szewtwin/core-common";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { DMDb } from "./DMDb";
import { IVaultNative } from "./internal/NativePlatform";

/** The result of an **DMSQL INSERT** statement as returned from [DMSqlStatement.stepForInsert]($backend).
 *
 * If the step was successful, the DMSqlInsertResult contains
 * [DbResult.BE_SQLITE_DONE]($core-szewec)
 * and the DMInstanceId of the newly created instance.
 * In case of failure it contains the [DbResult]($core-szewec) error code.
 *
 * > Insert statements can be used with DMDb only, not with IVaultDb.
 * @public
 */
export class DMSqlInsertResult {
  public constructor(public status: DbResult, public id?: Id64String) { }
}

/**
 * Arguments supplied to [[DMSqlStatement.getRow]].
 * @public
 * */
export interface DMSqlRowArg {
  /** Determine row format. */
  rowFormat?: QueryRowFormat;
  /**
   * Determine if classIds are converted to class names.
   */
  classIdsToClassNames?: boolean;
}

/** Executes DMSQL statements.
 *
 * A statement must be prepared before it can be executed, and it must be released when no longer needed.
 * See [IVaultDb.withPreparedStatement]($backend) or
 * [DMDb.withPreparedStatement]($backend) for a convenient and
 * reliable way to prepare, execute, and then release a statement.
 *
 * A statement may contain parameters that must be filled in before use by the **bind** methods.
 *
 * Once prepared (and parameters are bound, if any), the statement is executed by calling [DMSqlStatement.step]($backend).
 * In case of an **DMSQL SELECT** statement, the current row can be retrieved with [DMSqlStatement.getRow]($backend) as
 * a whole, or with [DMSqlStatement.getValue]($backend) when individual values are needed.
 * Alternatively, query results of an **DMSQL SELECT** statement can be stepped through by using
 * standard iteration syntax, such as `for of`.
 *
 * > Preparing a statement can be time-consuming. The best way to reduce the effect of this overhead is to cache and reuse prepared
 * > statements. A cached prepared statement may be used in different places in an app, as long as the statement is general enough.
 * > The key to making this strategy work is to phrase a statement in a general way and use placeholders to represent parameters that will vary on each use.
 *
 * See also
 * - [Executing DMSQL]($docs/learning/backend/ExecutingECSQL) provides more background on DMSQL and an introduction on how to execute DMSQL with the szewTwin.js API.
 * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples) illustrate the use of the szewTwin.js API for executing and working with DMSQL
 * @public
 * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [IVaultDb.createQueryReader]($backend) or [DMDb.createQueryReader]($backend) to query.
 * For DMDb, use [DMDb.withCachedWriteStatement]($backend) or [DMDb.withWriteStatement]($backend) to Insert/Update/Delete.
 */
export class DMSqlStatement implements IterableIterator<any>, Disposable {
  private _stmt: IVaultJsNative.DMSqlStatement | undefined;
  private _sql: string | undefined;
  private _props = new PropertyMetaDataMap([]);

  public get sql() { return this._sql!; } // eslint-disable-line @typescript-eslint/no-non-null-assertion

  /** Check if this statement has been prepared successfully or not */
  public get isPrepared(): boolean { return !!this._stmt; }

  /** Prepare this statement prior to first use.
   * @param db The BldDb or DMDb to prepare the statement against
   * @param dmsql The DMSQL statement string to prepare
   * @param logErrors Determine if errors are logged or not
   * @throws [IVaultError]($common) if the DMSQL statement cannot be prepared. Normally, prepare fails due to DMSQL syntax errors or references to tables or properties that do not exist.
   * The error.message property will provide details.
   * @internal
   */
  public prepare(db: IVaultJsNative.BldDb | IVaultJsNative.DMDb, dmsql: string, logErrors = true): void {
    const stat = this.tryPrepare(db, dmsql, logErrors);
    if (stat.status !== DbResult.BE_SQLITE_OK) {
      throw new IVaultError(stat.status, stat.message);
    }
  }

  /** Prepare this statement prior to first use.
   * @param db The BldDb or DMDb to prepare the statement against
   * @param dmsql The DMSQL statement string to prepare
   * @param logErrors Determine if errors are logged or not, its set to false by default for tryPrepare()
   * @returns An object with a `status` member equal to [DbResult.BE_SQLITE_OK]($szewec) on success. Upon error, the `message` member will provide details.
   * @internal
   */
  public tryPrepare(db: IVaultJsNative.BldDb | IVaultJsNative.DMDb, dmsql: string, logErrors = false): { status: DbResult, message: string } {
    if (this.isPrepared)
      throw new Error("DMSqlStatement is already prepared");
    this._sql = dmsql;
    this._stmt = new IVaultNative.platform.DMSqlStatement();
    return this._stmt.prepare(db, dmsql, logErrors);
  }

  /** Reset this statement so that the next call to step will return the first row, if any. */
  public reset(): void {
    assert(undefined !== this._stmt);
    this._stmt.reset();
    this._props = new PropertyMetaDataMap([]);
  }

  /** Get the Native SQL statement
   * @internal
   */
  public getNativeSql(): string {
    assert(undefined !== this._stmt);
    return this._stmt.getNativeSql();
  }

  /** Call this function when finished with this statement. This releases the native resources held by the statement.
   *
   * > Do not call this method directly on a statement that is being managed by a statement cache.
   */
  public [Symbol.dispose](): void {
    if (this._stmt) {
      this._stmt.dispose(); // free native statement
      this._stmt = undefined;
    }
  }

  /** @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [Symbol.dispose] instead. */
  public dispose(): void {
    this[Symbol.dispose]();
  }

  /** Binds the specified value to the specified DMSQL parameter.
   * The section "[szewTwin.js Types used in DMSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" describes the
   * szewTwin.js types to be used for the different DMSQL parameter types.
   * @param parameter Index (1-based) or name of the parameter
   */
  public bindValue(parameter: number | string, val: any): void { this.getBinder(parameter).bind(val); }

  /** Binds null to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   */
  public bindNull(parameter: number | string): void { this.getBinder(parameter).bindNull(); }

  /** Binds a BLOB value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param BLOB value as either a Uint8Array, ArrayBuffer or a Base64 string
   */
  public bindBlob(parameter: number | string, blob: string | Uint8Array | ArrayBuffer | SharedArrayBuffer): void { this.getBinder(parameter).bindBlob(blob); }

  /** Binds a boolean value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Boolean value
   */
  public bindBoolean(parameter: number | string, val: boolean): void { this.getBinder(parameter).bindBoolean(val); }

  /** Binds a DateTime value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param isoDateTimeString DateTime value as ISO8601 string
   */
  public bindDateTime(parameter: number | string, isoDateTimeString: string): void { this.getBinder(parameter).bindDateTime(isoDateTimeString); }

  /** Binds a double value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Double value
   */
  public bindDouble(parameter: number | string, val: number): void { this.getBinder(parameter).bindDouble(val); }

  /** Binds an GUID value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val GUID value
   */
  public bindGuid(parameter: number | string, val: GuidString): void { this.getBinder(parameter).bindGuid(val); }

  /** Binds an Id value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Id value
   */
  public bindId(parameter: number | string, val: Id64String): void { this.getBinder(parameter).bindId(val); }

  /** Binds an integer value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Integer value as number, decimal string or hexadecimal string.
   */
  public bindInteger(parameter: number | string, val: number | string): void { this.getBinder(parameter).bindInteger(val); }

  /** Binds an Point2d value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Point2d value
   */
  public bindPoint2d(parameter: number | string, val: XAndY): void { this.getBinder(parameter).bindPoint2d(val); }

  /** Binds an Point3d value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Point3d value
   */
  public bindPoint3d(parameter: number | string, val: XYAndZ): void { this.getBinder(parameter).bindPoint3d(val); }

  /** Binds a Range3d as a blob to the specified DMSQL parameter
   * @param parameter Index(1-based) or name of the parameter
   * @param val Range3d value
   */
  public bindRange3d(parameter: number | string, val: LowAndHighXYZ): void { this.getBinder(parameter).bindRange3d(val); }

  /** Binds an string to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val String value
   */
  public bindString(parameter: number | string, val: string): void { this.getBinder(parameter).bindString(val); }

  /** Binds a navigation property value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Navigation property value
   */
  public bindNavigation(parameter: number | string, val: NavigationBindingValue): void { this.getBinder(parameter).bindNavigation(val); }

  /** Binds a struct property value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Struct value. The struct value is an object composed of pairs of a struct member property name and its value
   * (of one of the supported types)
   */
  public bindStruct(parameter: number | string, val: object): void { this.getBinder(parameter).bindStruct(val); }

  /** Binds an array value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Array value. The array value is an array of values of the supported types
   */
  public bindArray(parameter: number | string, val: any[]): void { this.getBinder(parameter).bindArray(val); }

  public bindIdSet(parameter: number | string, val: Id64String[]): void { this.getBinder(parameter).bindIdSet(val); }
  /**
   * Gets a binder to bind a value for an DMSQL parameter
   * > This is the most low-level API to bind a value to a specific parameter. Alternatively you can use the DMSqlStatement.bindXX methods
   * > or [DMSqlStatement.bindValues]($backend).
   * @param parameter Index (1-based) or name of the parameter
   */
  public getBinder(parameter: string | number): DMSqlBinder {
    assert(undefined !== this._stmt);
    return new DMSqlBinder(this._stmt.getBinder(parameter));
  }

  /** Bind values to all parameters in the statement.
   * @param values The values to bind to the parameters.
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameter.
   *
   * The section "[szewTwin.js Types used in DMSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" describes the
   * szewTwin.js types to be used for the different DMSQL parameter types.
   *
   * See also these [Code Samples]($docs/learning/backend/ECSQLCodeExamples#binding-to-all-parameters-at-once)
   */
  public bindValues(values: any[] | object): void {
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i++) {
        const paramIndex: number = i + 1;
        const paramValue: any = values[i];
        if (paramValue === undefined || paramValue === null)
          continue;

        this.bindValue(paramIndex, paramValue);
      }
      return;
    }

    for (const entry of Object.entries(values)) {
      const paramName: string = entry[0];
      const paramValue: any = entry[1];
      if (paramValue === undefined || paramValue === null)
        continue;

      this.bindValue(paramName, paramValue);
    }
  }

  /** Clear any bindings that were previously set on this statement.
   * @throws [IVaultError]($common) in case of errors
   */
  public clearBindings(): void {
    if (this._stmt) {
      const stat: DbResult = this._stmt.clearBindings();
      if (stat !== DbResult.BE_SQLITE_OK)
        throw new IVaultError(stat, "Error clearing bindings");
    }
  }

  /** Step this statement to the next row.
   *
   *  For **DMSQL SELECT** statements the method returns
   *  - [DbResult.BE_SQLITE_ROW]($core-szewec) if the statement now points successfully to the next row.
   *  - [DbResult.BE_SQLITE_DONE]($core-szewec) if the statement has no more rows.
   *  - Error status in case of errors.
   *
   *  For **DMSQL INSERT, UPDATE, DELETE** statements the method returns
   *  - [DbResult.BE_SQLITE_DONE]($core-szewec) if the statement has been executed successfully.
   *  - Error status in case of errors.
   *
   *  >  Insert statements can be used with DMDb only, not with IVaultDb.
   *
   * See also: [Code Samples]($docs/learning/backend/ECSQLCodeExamples)
   */
  public step(): DbResult { return this._stmt!.step(); } // eslint-disable-line @typescript-eslint/no-non-null-assertion

  /** @internal added this back in for testing purposes */
  public async stepAsync(): Promise<DbResult> {
    return new Promise((resolve, _reject) => {
      this._stmt!.stepAsync(resolve); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    });
  }

  /** Step this INSERT statement and returns status and the DMInstanceId of the newly
   * created instance.
   *
   * > Insert statements can be used with DMDb only, not with IVaultDb.
   *
   * @returns Returns the generated DMInstanceId in case of success and the status of the step
   * call. In case of error, the respective error code is returned.
   */
  public stepForInsert(): DMSqlInsertResult {
    assert(undefined !== this._stmt);
    const r: { status: DbResult, id: string } = this._stmt.stepForInsert();
    if (r.status === DbResult.BE_SQLITE_DONE)
      return new DMSqlInsertResult(r.status, r.id);

    return new DMSqlInsertResult(r.status);
  }

  /** Get the query result's column count (only for DMSQL SELECT statements). */
  public getColumnCount(): number { return this._stmt!.getColumnCount(); } // eslint-disable-line @typescript-eslint/no-non-null-assertion

  /** Get the current row.
   * The returned row is formatted as JavaScript object where every SELECT clause item becomes a property in the JavaScript object.
   *
   * See also:
   * - [DMSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned row.
   * - [Code Samples]($docs/learning/backend/ECSQLCodeExamples#working-with-the-query-result)
   */
  public getRow(args?: DMSqlRowArg): any {
    if (!this._stmt)
      throw new Error("DMSqlStatement is not prepared");

    args = args ?? {};
    if (args.rowFormat === undefined) {
      args.rowFormat = QueryRowFormat.UseJsPropertyNames;
    }
    const resp = this._stmt.toRow({
      classIdsToClassNames: args.classIdsToClassNames,
      useJsName: args.rowFormat === QueryRowFormat.UseJsPropertyNames,
      abbreviateBlobs: false,
      // In 4.x, people are currently dependent on the behavior of aliased classIds `select classId as aliasedClassId` not being
      // converted into classNames which is a bug that we must now support.This option preserves this special behavior until
      // it can be removed in a future version.
      doNotConvertClassIdsToClassNamesWhenAliased: true,
    });
    return this.formatCurrentRow(resp, args.rowFormat);
  }

  /**
   * Used by DMSqlRowExecutor to get row data as json with options determined by request parameters.
   * @internal */
  public toRow(args: IVaultJsNative.DMSqlRowAdaptorOptions): any {
    if (!this._stmt)
      throw new Error("DMSqlStatement is not prepared");

    const resp = this._stmt.toRow(args);
    return resp;
  }

  /**
   * Used by DMSqlRowExecutor to get metadata as json.
   * @internal */
  public getMetadata(args: IVaultJsNative.DMSqlRowAdaptorOptions): PropertyMetaDataMap {
    if (!this._stmt)
      throw new Error("DMSqlStatement is not prepared");

    const resp = this._stmt.getMetadata(args);
    return new PropertyMetaDataMap(resp.meta);
  }

  /**
   * Used by DMSqlRowExecutor to bind params to the statement.
   * @internal */
  public bindParams(args: object): void {
    if (!this._stmt)
      throw new Error("DMSqlStatement is not prepared");

    this._stmt.reset();
    this._stmt.clearBindings();
    const { status, message } = this._stmt.bindParams(args);
    if (!status)
      throw new Error(`Failed to bind parameters: ${message}`);
  }

  private formatCurrentRow(currentResp: any, rowFormat: QueryRowFormat = QueryRowFormat.UseJsPropertyNames): any[] | object {
    if (!this._stmt)
      throw new Error("DMSqlStatement is not prepared");

    if (rowFormat === QueryRowFormat.UseDMSqlPropertyIndexes)
      return currentResp.data;

    if (this._props.length === 0) {
      const resp = this._stmt.getMetadata();
      this._props = new PropertyMetaDataMap(resp.meta);
    }
    const formattedRow = {};
    for (const prop of this._props) {
      const propName = rowFormat === QueryRowFormat.UseJsPropertyNames ? prop.jsonName : prop.name;
      const val = currentResp.data[prop.index];
      if (typeof val !== "undefined" && val !== null) {
        Object.defineProperty(formattedRow, propName, {
          value: val,
          enumerable: true,
          writable: true,
        });
      }
    }
    return formattedRow;
  }

  /** Calls step when called as an iterator.
   *
   *  Each iteration returns an [DMSQL row format]($docs/learning/ECSQLRowFormat) as returned
   *  from [DMSqlStatement.getRow]($backend).
   */
  public next(): IteratorResult<any> {
    if (DbResult.BE_SQLITE_ROW === this.step()) {
      return {
        done: false,
        value: this.getRow(),
      };
    } else {
      return {
        done: true,
        value: undefined,
      };
    }
  }

  /** The iterator that will step through the results of this statement. */
  public [Symbol.iterator](): IterableIterator<any> { return this; }

  /** Get the value for the column at the given index in the query result.
   * @param columnIx Index of DMSQL column in query result (0-based)
   *
   * See also: [Code Samples]($docs/learning/backend/ECSQLCodeExamples#working-with-the-query-result)
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public getValue(columnIx: number): DMSqlValue {
    assert(undefined !== this._stmt);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return new DMSqlValue(this._stmt.getValue(columnIx));
  }
}

/** Executes DMSQL INSERT/UPDATE/DELETE statements.
 *
 * A statement must be prepared before it can be executed, and it must be released when no longer needed.
 * See [DMDb.withCachedWriteStatement]($backend) for a convenient and
 * reliable way to prepare, execute, and then release a statement.
 *
 * A statement may contain parameters that must be filled in before use by the **bind** methods.
 *
 * Once prepared (and parameters are bound, if any), the statement is executed by calling [DMSqlStatement.stepForInsert]($backend).
 *
 * > Preparing a statement can be time-consuming. The best way to reduce the effect of this overhead is to cache and reuse prepared
 * > statements. A cached prepared statement may be used in different places in an app, as long as the statement is general enough.
 * > The key to making this strategy work is to phrase a statement in a general way and use placeholders to represent parameters that will vary on each use.
 *
 * See also
 * - [Executing DMSQL]($docs/learning/backend/ExecutingECSQL) provides more background on DMSQL and an introduction on how to execute DMSQL with the szewTwin.js API.
 * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples) illustrate the use of the szewTwin.js API for executing and working with DMSQL
 * @public
 */
export class DMSqlWriteStatement {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private _stmt: DMSqlStatement;

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public constructor(stmt?: DMSqlStatement) {
    if (stmt)
      this._stmt = stmt;
    else {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      this._stmt = new DMSqlStatement();
    }
  }

  public get sql() { return this._stmt.sql; }

  /** Check if this statement has been prepared successfully or not */
  public get isPrepared(): boolean { return this._stmt.isPrepared; }

  /** Get the underlying DMSqlStatement.  Needed until we remove DMSqlStatement.
   * @param
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public get stmt(): DMSqlStatement { return this._stmt; }

  /** Prepare this statement prior to first use.
   * @param db The DMDb to prepare the statement against
   * @param dmsql The DMSQL statement string to prepare
   * @param logErrors Determine if errors are logged or not
   * @throws [IVaultError]($common) if the DMSQL statement cannot be prepared. Normally, prepare fails due to DMSQL syntax errors or references to tables or properties that do not exist.
   * The error.message property will provide details.
   * @internal
   */
  public prepare(db: IVaultJsNative.DMDb, dmsql: string, logErrors = true): void {
    this._stmt.prepare(db, dmsql, logErrors);
  }

  /** Prepare this statement prior to first use.
   * @param db The BldDb or DMDb to prepare the statement against
   * @param dmsql The DMSQL statement string to prepare
   * @param logErrors Determine if errors are logged or not, its set to false by default for tryPrepare()
   * @returns An object with a `status` member equal to [DbResult.BE_SQLITE_OK]($szewec) on success. Upon error, the `message` member will provide details.
   * @internal
   */
  public tryPrepare(db: IVaultJsNative.BldDb | IVaultJsNative.DMDb, dmsql: string, logErrors = false): { status: DbResult, message: string } {
    return this.tryPrepare(db, dmsql, logErrors);
  }

  /** Reset this statement so that the next call to step will return the first row, if any. */
  public reset(): void {
    this._stmt.reset();
  }

  /**
   * Releases the native resources held by this DMSqlWriteStatement.
   *
   * This method should be called when the statement is no longer needed to free up native resources.
   *
   * > Do not call this method directly on a statement that is being managed by a statement cache.
   */
  public [Symbol.dispose](): void {
    if (this._stmt)
      this._stmt[Symbol.dispose]();
  }

  /** Get the Native SQL statement
   * @internal
   */
  public getNativeSql(): string {
    return this._stmt.getNativeSql();
  }

  /** Binds the specified value to the specified DMSQL parameter.
   * The section "[szewTwin.js Types used in DMSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" describes the
   * szewTwin.js types to be used for the different DMSQL parameter types.
   * @param parameter Index (1-based) or name of the parameter
   */
  public bindValue(parameter: number | string, val: any): void { this.getBinder(parameter).bind(val); }

  /** Binds null to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   */
  public bindNull(parameter: number | string): void { this.getBinder(parameter).bindNull(); }

  /** Binds a BLOB value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param BLOB value as either a Uint8Array, ArrayBuffer or a Base64 string
   */
  public bindBlob(parameter: number | string, blob: string | Uint8Array | ArrayBuffer | SharedArrayBuffer): void { this.getBinder(parameter).bindBlob(blob); }

  /** Binds a boolean value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Boolean value
   */
  public bindBoolean(parameter: number | string, val: boolean): void { this.getBinder(parameter).bindBoolean(val); }

  /** Binds a DateTime value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param isoDateTimeString DateTime value as ISO8601 string
   */
  public bindDateTime(parameter: number | string, isoDateTimeString: string): void { this.getBinder(parameter).bindDateTime(isoDateTimeString); }

  /** Binds a double value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Double value
   */
  public bindDouble(parameter: number | string, val: number): void { this.getBinder(parameter).bindDouble(val); }

  /** Binds an GUID value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val GUID value
   */
  public bindGuid(parameter: number | string, val: GuidString): void { this.getBinder(parameter).bindGuid(val); }

  /** Binds an Id value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Id value
   */
  public bindId(parameter: number | string, val: Id64String): void { this.getBinder(parameter).bindId(val); }

  /** Binds an integer value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Integer value as number, decimal string or hexadecimal string.
   */
  public bindInteger(parameter: number | string, val: number | string): void { this.getBinder(parameter).bindInteger(val); }

  /** Binds an Point2d value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Point2d value
   */
  public bindPoint2d(parameter: number | string, val: XAndY): void { this.getBinder(parameter).bindPoint2d(val); }

  /** Binds an Point3d value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Point3d value
   */
  public bindPoint3d(parameter: number | string, val: XYAndZ): void { this.getBinder(parameter).bindPoint3d(val); }

  /** Binds a Range3d as a blob to the specified DMSQL parameter
   * @param parameter Index(1-based) or name of the parameter
   * @param val Range3d value
   */
  public bindRange3d(parameter: number | string, val: LowAndHighXYZ): void { this.getBinder(parameter).bindRange3d(val); }

  /** Binds an string to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val String value
   */
  public bindString(parameter: number | string, val: string): void { this.getBinder(parameter).bindString(val); }

  /** Binds a navigation property value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Navigation property value
   */
  public bindNavigation(parameter: number | string, val: NavigationBindingValue): void { this.getBinder(parameter).bindNavigation(val); }

  /** Binds a struct property value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Struct value. The struct value is an object composed of pairs of a struct member property name and its value
   * (of one of the supported types)
   */
  public bindStruct(parameter: number | string, val: object): void { this.getBinder(parameter).bindStruct(val); }

  /** Binds an array value to the specified DMSQL parameter.
   * @param parameter Index (1-based) or name of the parameter
   * @param val Array value. The array value is an array of values of the supported types
   */
  public bindArray(parameter: number | string, val: any[]): void { this.getBinder(parameter).bindArray(val); }

  public bindIdSet(parameter: number | string, val: Id64String[]): void { this.getBinder(parameter).bindIdSet(val); }
  /**
   * Gets a binder to bind a value for an DMSQL parameter
   * > This is the most low-level API to bind a value to a specific parameter. Alternatively you can use the DMSqlStatement.bindXX methods
   * > or [DMSqlStatement.bindValues]($backend).
   * @param parameter Index (1-based) or name of the parameter
   */
  public getBinder(parameter: string | number): DMSqlBinder {
    return this._stmt.getBinder(parameter);
  }

  /** Bind values to all parameters in the statement.
   * @param values The values to bind to the parameters.
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameter.
   *
   * The section "[szewTwin.js Types used in DMSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" describes the
   * szewTwin.js types to be used for the different DMSQL parameter types.
   *
   * See also these [Code Samples]($docs/learning/backend/ECSQLCodeExamples#binding-to-all-parameters-at-once)
   */
  public bindValues(values: any[] | object): void {
    this._stmt.bindValues(values);
  }

  /** Clear any bindings that were previously set on this statement.
   * @throws [IVaultError]($common) in case of errors
   */
  public clearBindings(): void {
    this._stmt.clearBindings();
  }

  /** Step this INSERT statement and returns status and the DMInstanceId of the newly
   * created instance.
   *
   * > Insert statements can be used with DMDb only, not with IVaultDb.
   *
   * @returns Returns the generated DMInstanceId in case of success and the status of the step
   * call. In case of error, the respective error code is returned.
   */
  public stepForInsert(): DMSqlInsertResult {
    return this._stmt.stepForInsert();
  }

  public step(): DbResult {
    return this._stmt.step();
  }

  /** Get the query result's column count (only for DMSQL SELECT statements). */
  public getColumnCount(): number { return this._stmt.getColumnCount(); }
}

/** Binds a value to an DMSQL parameter.
 *
 * See also:
 *
 * - [DMSqlStatement]($backend)
 * - [DMSqlStatement.getBinder]($backend)
 * - [Executing DMSQL]($docs/learning/backend/ExecutingECSQL)
 * @public
 */
export class DMSqlBinder {
  private _binder: IVaultJsNative.DMSqlBinder;

  /** @internal */
  public constructor(binder: IVaultJsNative.DMSqlBinder) { this._binder = binder; }

  /** Binds the specified value to the DMSQL parameter.
   * The section "[szewTwin.js Types used in DMSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" describes the
   * szewTwin.js types to be used for the different DMSQL parameter types.
   * @param val Value to bind
   */
  public bind(val: any): void {
    DMSqlBindingHelper.bindValue(this, val);
  }

  /** Binds null to the DMSQL parameter. */
  public bindNull(): void {
    const stat: DbResult = this._binder.bindNull();
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding null");
  }

  /** Binds a BLOB value to the DMSQL parameter.
   * @param BLOB value as either a UInt8Array, ArrayBuffer or a Base64 string
   */
  public bindBlob(blob: string | Uint8Array | ArrayBuffer | SharedArrayBuffer): void {
    const stat: DbResult = this._binder.bindBlob(blob);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding blob");
  }

  /** Binds a boolean value to the DMSQL parameter.
   * @param val Boolean value
   */
  public bindBoolean(val: boolean): void {
    const stat: DbResult = this._binder.bindBoolean(val);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding boolean");
  }

  /** Binds a DateTime value to the DMSQL parameter.
   * @param isoDateTimeString DateTime value as ISO8601 string
   */
  public bindDateTime(isoDateTimeString: string): void {
    const stat: DbResult = this._binder.bindDateTime(isoDateTimeString);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding DateTime");
  }

  /** Binds a double value to the DMSQL parameter.
   * @param val Double value
   */
  public bindDouble(val: number): void {
    const stat: DbResult = this._binder.bindDouble(val);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding double");
  }

  /** Binds an GUID value to the DMSQL parameter.
   * @param val GUID value. If passed as string, it must be formatted as described in [GuidString]($core-szewec).
   */
  public bindGuid(val: GuidString): void {
    const stat: DbResult = this._binder.bindGuid(val);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding GUID");
  }

  /** Binds an Id value to the DMSQL parameter.
   * @param val Id value. If passed as string it must be the hexadecimal representation of the Id.
   */
  public bindId(val: Id64String): void {
    const stat: DbResult = this._binder.bindId(val);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding Id");
  }

  /** Binds an integer value to the DMSQL parameter.
   * @param val Integer value as number, decimal string or hexadecimal string.
   */
  public bindInteger(val: number | string): void {
    const stat: DbResult = this._binder.bindInteger(val);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding integer");
  }

  /** Binds an Point2d value to the DMSQL parameter.
   * @param val Point2d value
   */
  public bindPoint2d(val: XAndY): void {
    const stat: DbResult = this._binder.bindPoint2d(val.x, val.y);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding Point2d");
  }

  /** Binds an Point3d value to the DMSQL parameter.
   * @param val Point3d value
   */
  public bindPoint3d(val: XYAndZ): void {
    const stat: DbResult = this._binder.bindPoint3d(val.x, val.y, val.z);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding Point3d");
  }

  /** Binds a Range3d as a blob to the DMSQL parameter.
   * @param val Range3d value
   */
  public bindRange3d(val: LowAndHighXYZ): void {
    const stat: DbResult = this._binder.bindBlob(Range3d.toFloat64Array(val).buffer);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding Range3d");
  }

  /** Binds an string to the DMSQL parameter.
   * @param val String value
   */
  public bindString(val: string): void {
    const stat: DbResult = this._binder.bindString(val);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding string");
  }

  /** Binds a navigation property value to the DMSQL parameter.
   * @param val Navigation property value
   */
  public bindNavigation(val: NavigationBindingValue): void {
    const stat: DbResult = this._binder.bindNavigation(val.id, val.relClassName, val.relClassTableSpace);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding navigation property");
  }

  /** Binds a struct property value to the DMSQL parameter.
   * @param val Struct value. The struct value is an object composed of pairs of a struct member property name and its value
   * (of one of the supported types)
   */
  public bindStruct(val: object): void { DMSqlBindingHelper.bindStruct(this, val); }

  /** Gets the binder for the specified member of a struct parameter
   *
   * > This is the most low-level way to bind struct parameters with most flexibility. A simpler alternative is
   * > to just call [DMSqlBinder.bindStruct]($backend).
   */
  public bindMember(memberName: string): DMSqlBinder { return new DMSqlBinder(this._binder.bindMember(memberName)); }

  /** Binds a set of Id strings to the DMSQL parameter.
   * @param val array of Id values. If passed as string they must be the hexadecimal representation of the Ids.
   */
  public bindIdSet(vector: Id64String[]): void {
    const stat: DbResult = this._binder.bindIdSet(vector);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, "Error binding id set");
  }

  /** Binds an array value to the DMSQL parameter.
   * @param val Array value. The array value is an array of values of the supported types
   */
  public bindArray(val: any[]): void { DMSqlBindingHelper.bindArray(this, val); }

  /** Adds a new array element to the array parameter and returns the binder for the new array element
   *
   * > This is the most low-level way to bind array parameters with most flexibility. A simpler alternative is
   * > to just call [DMSqlBinder.bindArray]($backend).
   */
  public addArrayElement(): DMSqlBinder { return new DMSqlBinder(this._binder.addArrayElement()); }
}

/** Represents the value of an DMEnumeration.
 *
 * See also:
 * - [[DMSqlValue.getEnum]]
 * - [[DMSqlStatement]]
 * - [[DMSqlStatement.getValue]]
 * - [Code Samples]($docs/learning/backend/ECSQLCodeExamples#working-with-the-query-result)
 * @public
 * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [IVaultDb.createQueryReader]($backend) or [DMDb.createQueryReader]($backend) instead.
 */
export interface DMEnumValue {
  schema: string;
  name: string;
  key: string;
  value: number | string;
}

/** Value of a column in a row of an DMSQL query result.
 *
 * See also:
 * - [DMSqlStatement]($backend)
 * - [DMSqlStatement.getValue]($backend)
 * - [Code Samples]($docs/learning/backend/ECSQLCodeExamples#working-with-the-query-result)
 * @public
 * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [IVaultDb.createQueryReader]($backend) or [DMDb.createQueryReader]($backend) instead.
*/
export class DMSqlValue {
  private _val: IVaultJsNative.DMSqlValue;

  /** @internal */
  public constructor(val: IVaultJsNative.DMSqlValue) { this._val = val; }

  /** Get information about the query result's column this value refers to. */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public get columnInfo(): DMSqlColumnInfo { return this._val.getColumnInfo(); }

  /** Get the value of this DMSQL value */
  public get value(): any { return DMSqlValueHelper.getValue(this); }

  /** Indicates whether the value is NULL or not. */
  public get isNull(): boolean { return this._val.isNull(); }
  /** Get the value as BLOB */
  public getBlob(): Uint8Array { return this._val.getBlob(); }
  /** Get the value as a boolean value */
  public getBoolean(): boolean { return this._val.getBoolean(); }
  /** Get the value as a DateTime value (formatted as ISO8601 string) */
  public getDateTime(): string { return this._val.getDateTime(); }
  /** Get the value as a double value */
  public getDouble(): number { return this._val.getDouble(); }
  /** Get the value as a IGeometry value (as DMJSON IGeometry) */
  public getGeometry(): any { return JSON.parse(this._val.getGeometry()); }
  /** Get the value as a GUID (formatted as GUID string).
   *  See [GuidString]($core-szewec)
   */
  public getGuid(): GuidString { return this._val.getGuid(); }
  /** Get the value as a Id (formatted as hexadecimal string). */
  public getId(): Id64String { return this._val.getId(); }
  /** Get the ClassId value formatted as fully qualified class name. */
  public getClassNameForClassId(): string { return this._val.getClassNameForClassId(); }
  /** Get the value as a integer value */
  public getInteger(): number { return this._val.getInt64(); }
  /** Get the value as a string value */
  public getString(): string { return this._val.getString(); }
  /** Get the value as [XAndY]($core-geometry) */
  public getXAndY(): XAndY { return this._val.getPoint2d(); }
  /** Get the value as [XYAndZ]($core-geometry) */
  public getXYAndZ(): XYAndZ { return this._val.getPoint3d(); }
  /** Get the value as DMEnumeration value
   *  Note: This method is optional. Using [[DMSqlValue.getInteger]] for integral enums and
   *  [[DMSqlValue.getString]] for string enums respectively are the usual way to get
   *  enum values. This method can be used if the context of the underlying DMEnumeration
   *  is required.
   *  The value is broken down into the DMEnumerators that make it up, if the value
   *  is a combination of DMEnumerators. If the value is not a strict match of an DMEnumerator
   *  or a combination of them, undefined is returned.
   *  > Note: You can call [[DMSqlValue.columnInfo.isEnum]] to find out whether
   *  > this method can be called or not.
   *  @return DMEnumeration value(s) or undefined if the DMSqlValue does not represent an DMEnumeration.
   *  or is not a strict match of an DMEnumerator or a combination of them.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public getEnum(): DMEnumValue[] | undefined { return this._val.getEnum(); }

  /** Get the value as [NavigationValue]($common) */
  public getNavigation(): NavigationValue { return this._val.getNavigation(); }

  /** Get an iterator for iterating the struct members of this struct value. */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public getStructIterator(): DMSqlValueIterator { return new DMSqlValueIterator(this._val.getStructIterator()); }

  /** Get this struct value's content as object literal */
  public getStruct(): any { return DMSqlValueHelper.getStruct(this); }

  /** Get an iterator for iterating the array elements of this array value. */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public getArrayIterator(): DMSqlValueIterator { return new DMSqlValueIterator(this._val.getArrayIterator()); }

  /** Get this array value as JavaScript array */
  public getArray(): any[] { return DMSqlValueHelper.getArray(this); }
}

/** Iterator over members of a struct [DMSqlValue]($backend) or the elements of an array [DMSqlValue]($backend).
 * See [DMSqlValue.getStructIterator]($backend) or [DMSqlValue.getArrayIterator]($backend).
 * @public
 * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [IVaultDb.createQueryReader]($backend) or [DMDb.createQueryReader]($backend) instead.
*/
// eslint-disable-next-line @typescript-eslint/no-deprecated
export class DMSqlValueIterator implements IterableIterator<DMSqlValue> {
  private _it: IVaultJsNative.DMSqlValueIterator;

  /** @internal */
  public constructor(it: IVaultJsNative.DMSqlValueIterator) { this._it = it; }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public next(): IteratorResult<DMSqlValue> {
    if (this._it.moveNext()) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return { done: false, value: new DMSqlValue(this._it.getCurrent()) };
    }
    return { done: true, value: undefined };
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public [Symbol.iterator](): IterableIterator<DMSqlValue> { return this; }
}

/** Information about an DMSQL column in an DMSQL query result.
 * See [DMSqlValue.columnInfo]($backend), [DMSqlStatement.getValue]($backend), [DMSqlStatement]($backend)
 * @public
 * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [IVaultDb.createQueryReader]($backend) or [DMDb.createQueryReader]($backend) instead.
 */
export interface DMSqlColumnInfo {
  /** Gets the data type of the column.
   */
  getType(): DMSqlValueType;

  /** Gets the name of the property backing the column.
   * > If this column is backed by a generated property, i.e. it represents DMSQL expression,
   * > the access string consists of the name of the generated property. [[DMSqlColumnInfo.getOriginPropertyName]]
   * > can be used to obtain the non-aliased name in that case.
   */
  getPropertyName(): string;

  /** Gets the name of the original property that the column data is from.
   * > Other than [[DMSqlColumnInfo.getPropertyName]], this ignores aliases and allows getting the name
   * > of the property which is being used for the column. A column may not be backed
   * > by a property, in which case this returns undefined.
   */
  getOriginPropertyName(): string | undefined;

  /** Gets the full access string to the corresponding DMSqlValue starting from the root class.
   * > If this column is backed by a generated property, i.e. it represents DMSQL expression,
   * > the access string consists of the DMSQL expression.
   */
  getAccessString(): string;

  /** Indicates whether the column refers to an DMEnumeration property. */
  isEnum(): boolean;

  /** Indicates whether the column refers to a system property (e.g. id, className). */
  isSystemProperty(): boolean;

  /** Indicates whether the column is backed by a generated property or not. For SELECT clause items that are expressions other
   * than simply a reference to an DMProperty, a property is generated containing the expression name.
   */
  isGeneratedProperty(): boolean;

  /** Gets the table space in which this root class is persisted.
   * > For classes in the primary file the table space is MAIN. For classes in attached
   * > files, the table space is the name by which the file was attached. For generated properties the table space is empty.
   */
  getRootClassTableSpace(): string;

  /** Gets the fully qualified name of the DMClass of the top-level DMProperty backing this column. */
  getRootClassName(): string;

  /** Gets the class alias of the root class to which the column refers to.
   * > Returns an empty string if no class alias was specified in the select clause.
   */
  getRootClassAlias(): string;
}

class DMSqlBindingHelper {

  /** Binds the specified value to the specified binder
   * @param binder Parameter Binder to bind to
   * @param val Value to be bound. (See [szewTwin.js Types used in DMSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes))
   * @throws IVaultError in case of errors
   */
  public static bindValue(binder: DMSqlBinder, val: any): void {
    // returns false if val is no primitive and returns true if it is primitive and a binding call was done
    if (DMSqlBindingHelper.tryBindPrimitiveTypes(binder, val))
      return;

    if (Array.isArray(val)) {
      DMSqlBindingHelper.bindArray(binder, val);
      return;
    }

    if (typeof (val) === "object") {
      DMSqlBindingHelper.bindStruct(binder, val);
      return;
    }

    throw new Error(`Bound value is of an unsupported type: ${val}`);
  }

  /** Binds the specified primitive value to the specified binder
   * @param binder Parameter Binder to bind to
   * @param val Primitive value to be bound. Must be of one of these types described here:
   * [DMSQL Binding types]($docs/learning/ECSQLParameterTypes)
   * @throws IVaultError in case of errors
   */
  public static bindPrimitive(binder: DMSqlBinder, val: any): void {
    if (!DMSqlBindingHelper.tryBindPrimitiveTypes(binder, val))
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, `Binding value is of an unsupported primitive type: ${val}`);
  }

  /** Binds the specified object to the specified struct binder
   * @param binder Struct parameter binder to bind to
   * @param val Value to be bound. Must be an Object with members of the supported types
   * @throws IVaultError in case of errors
   */
  public static bindStruct(binder: DMSqlBinder, val: object): void {
    if (val === null || val === undefined) {
      binder.bindNull();
      return;
    }

    for (const member of Object.entries(val)) {
      const memberName: string = member[0];
      const memberVal: any = member[1];
      DMSqlBindingHelper.bindValue(binder.bindMember(memberName), memberVal);
    }
  }

  /** Binds the specified array to the specified array binder
   * @param binder Array parameter binder to bind to
   * @param val Value to be bound. Must be an Array with elements of the supported types
   * @throws IVaultError in case of errors
   */
  public static bindArray(binder: DMSqlBinder, val: any[]): void {
    if (val === null || val === undefined) {
      binder.bindNull();
      return;
    }

    for (const element of val) {
      DMSqlBindingHelper.bindValue(binder.addArrayElement(), element);
    }
  }

  /** tries to interpret the passed value as known leaf types (primitives and navigation values).
   *  @returns Returns undefined if the value wasn't a primitive. DbResult if it was a primitive and was bound to the binder
   */
  private static tryBindPrimitiveTypes(binder: DMSqlBinder, val: any): boolean {
    if (val === undefined || val === null) {
      binder.bindNull();
      return true;
    }

    if (typeof (val) === "number") {
      if (Number.isInteger(val))
        binder.bindInteger(val);
      else
        binder.bindDouble(val);

      return true;
    }

    if (typeof (val) === "boolean") {
      binder.bindBoolean(val);
      return true;
    }

    if (typeof (val) === "string") {
      binder.bindString(val);
      return true;
    }

    if (DMSqlTypeHelper.isBlob(val)) {
      binder.bindBlob(val);
      return true;
    }

    if (DMSqlTypeHelper.isXYAndZ(val)) {
      binder.bindPoint3d(val);
      return true;
    }

    if (DMSqlTypeHelper.isXAndY(val)) {
      binder.bindPoint2d(val);
      return true;
    }

    if (DMSqlTypeHelper.isLowAndHighXYZ(val)) {
      binder.bindRange3d(val);
      return true;
    }

    if (DMSqlTypeHelper.isNavigationBindingValue(val)) {
      binder.bindNavigation(val);
      return true;
    }

    return false;
  }
}

class DMSqlValueHelper {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public static getValue(ecsqlValue: DMSqlValue): any {
    if (ecsqlValue.isNull)
      return undefined;

    const dataType: DMSqlValueType = ecsqlValue.columnInfo.getType();
    switch (dataType) {
      case DMSqlValueType.Struct:
        return DMSqlValueHelper.getStruct(ecsqlValue);

      case DMSqlValueType.Navigation:
        return ecsqlValue.getNavigation();

      case DMSqlValueType.PrimitiveArray:
      case DMSqlValueType.StructArray:
        return DMSqlValueHelper.getArray(ecsqlValue);

      default:
        return DMSqlValueHelper.getPrimitiveValue(ecsqlValue);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public static getStruct(ecsqlValue: DMSqlValue): any {
    if (ecsqlValue.isNull)
      return undefined;

    const structVal = {};
    const it = ecsqlValue.getStructIterator();
    try {
      for (const memberDMSqlVal of it) {
        if (memberDMSqlVal.isNull)
          continue;

        const memberName: string = DMJsNames.toJsName(memberDMSqlVal.columnInfo.getPropertyName());
        const memberVal = DMSqlValueHelper.getValue(memberDMSqlVal);
        Object.defineProperty(structVal, memberName, { enumerable: true, configurable: true, writable: true, value: memberVal });
      }
    } finally {
    }

    return structVal;
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public static getArray(ecsqlValue: DMSqlValue): any[] {
    const arrayVal: any[] = [];
    const it = ecsqlValue.getArrayIterator();
    try {
      for (const elementDMSqlVal of it) {
        const memberVal = DMSqlValueHelper.getValue(elementDMSqlVal);
        arrayVal.push(memberVal);
      }
    } finally {
    }
    return arrayVal;
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private static getPrimitiveValue(ecsqlValue: DMSqlValue): any {
    if (ecsqlValue.isNull)
      return undefined;

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const colInfo: DMSqlColumnInfo = ecsqlValue.columnInfo;
    switch (colInfo.getType()) {
      case DMSqlValueType.Blob:
        return ecsqlValue.getBlob();
      case DMSqlValueType.Boolean:
        return ecsqlValue.getBoolean();
      case DMSqlValueType.DateTime:
        return ecsqlValue.getDateTime();
      case DMSqlValueType.Double:
        return ecsqlValue.getDouble();
      case DMSqlValueType.Geometry:
        return ecsqlValue.getGeometry();
      case DMSqlValueType.Guid:
        return ecsqlValue.getGuid();
      case DMSqlValueType.Id: {
        if (colInfo.isSystemProperty() && colInfo.getPropertyName().endsWith("DMClassId"))
          return ecsqlValue.getClassNameForClassId();

        return ecsqlValue.getId();
      }
      case DMSqlValueType.Int:
      case DMSqlValueType.Int64:
        return ecsqlValue.getInteger();
      case DMSqlValueType.Point2d:
        return ecsqlValue.getXAndY();
      case DMSqlValueType.Point3d:
        return ecsqlValue.getXYAndZ();
      case DMSqlValueType.String:
        return ecsqlValue.getString();
      default:
        throw new IVaultError(DbResult.BE_SQLITE_ERROR, `Unsupported type ${ecsqlValue.columnInfo.getType()} of the DMSQL Value`);
    }
  }

  public static queryClassName(dmdb: DMDb, classId: Id64String, tableSpace?: string): string {
    if (!tableSpace)
      tableSpace = "main";

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return dmdb.withPreparedStatement(`SELECT s.Name, c.Name FROM [${tableSpace}].meta.DMSchemaDef s, JOIN [${tableSpace}].meta.DMClassDef c ON s.DMInstanceId=c.SchemaId WHERE c.DMInstanceId=?`,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      (stmt: DMSqlStatement) => {
        stmt.bindId(1, classId);
        if (stmt.step() !== DbResult.BE_SQLITE_ROW)
          throw new IVaultError(DbResult.BE_SQLITE_ERROR, `No class found with DMClassId ${classId} in table space ${tableSpace}.`);

        return `${stmt.getValue(0).getString()}.${stmt.getValue(1).getString()}`;
      });
  }
}

class DMSqlTypeHelper {
  public static isBlob(val: any): val is Uint8Array { return val instanceof Uint8Array; }

  public static isXAndY(val: any): val is XAndY { return XYZ.isXAndY(val); }
  public static isXYAndZ(val: any): val is XYAndZ { return XYZ.isXYAndZ(val); }
  public static isLowAndHighXYZ(arg: any): arg is LowAndHighXYZ { return arg.low !== undefined && DMSqlTypeHelper.isXYAndZ(arg.low) && arg.high !== undefined && DMSqlTypeHelper.isXYAndZ(arg.high); }

  public static isNavigationBindingValue(val: any): val is NavigationBindingValue { return val.id !== undefined && typeof (val.id) === "string"; }
}
