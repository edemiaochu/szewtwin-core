/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DMDb
 */
import { assert, BeEvent, DbResult, Logger, OpenMode } from "@szewtwin/core-szewec";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { DbQueryRequest, DMSchemaProps, DMSqlReader, IVaultError, QueryBinder, QueryOptions } from "@szewtwin/core-common";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { ConcurrentQuery } from "./ConcurrentQuery";
import { DMSqlStatement, DMSqlWriteStatement } from "./DMSqlStatement";
import { IVaultNative } from "./internal/NativePlatform";
import { SqliteStatement, StatementCache } from "./SqliteStatement";
import { _nativeDb } from "./internal/Symbols";
import { DMSqlRowExecutor } from "./DMSqlRowExecutor";
import { DMSqlSyncReader, SynchronousQueryOptions } from "./DMSqlSyncReader";

const loggerCategory: string = BackendLoggerCategory.DMDb;

/** Modes for how to open [DMDb]($backend) files.
 * @public
 */
export enum DMDbOpenMode {
  Readonly,
  ReadWrite,
  /** Opens the file read-write and upgrades the file if necessary to the latest file format version. */
  FileUpgrade,
}

/** An DMDb file
 * @public
 */
export class DMDb implements Disposable {
  private _nativeDb?: IVaultJsNative.DMDb;
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private readonly _statementCache = new StatementCache<DMSqlStatement>();
  private _sqliteStatementCache = new StatementCache<SqliteStatement>();

  /** Event called when the DMDb is about to be closed. */
  public readonly onBeforeClose = new BeEvent<() => void>();

  /** only for tests
   * @internal
   */
  public resetSqliteCache(size: number) {
    this._sqliteStatementCache.clear();
    this._sqliteStatementCache = new StatementCache<SqliteStatement>(size);
  }

  constructor() {
    this._nativeDb = new IVaultNative.platform.DMDb();
  }
  /** Call this function when finished with this DMDb object. This releases the native resources held by the
   *  DMDb object.
   */
  public [Symbol.dispose](): void {
    if (!this._nativeDb)
      return;

    this.closeDb();
    this._nativeDb.dispose();
    this._nativeDb = undefined;
  }
  /**
   * Attach an iVault file to this connection and load and register its schemas.
   * @note There are some reserve tablespace names that cannot be used. They are 'main', 'schema_sync_db', 'dmchange' & 'temp'
   * @param fileName IVault file name
   * @param alias identifier for the attached file. This identifer is used to access schema from the attached file. e.g. if alias is 'abc' then schema can be accessed using 'abc.MySchema.MyClass'
   */
  public attachDb(fileName: string, alias: string): void {
    if (alias.toLowerCase() === "main" || alias.toLowerCase() === "schema_sync_db" || alias.toLowerCase() === "dmchange" || alias.toLowerCase() === "temp") {
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "Reserved tablespace name cannot be used");
    }
    this[_nativeDb].attachDb(fileName, alias);
  }
  /**
   * Detach the attached file from this connection. The attached file is closed and its schemas are unregistered.
   * @note There are some reserve tablespace names that cannot be used. They are 'main', 'schema_sync_db', 'dmchange' & 'temp'
   * @param alias identifer that was used in the call to [[attachDb]]
   */
  public detachDb(alias: string): void {
    if (alias.toLowerCase() === "main" || alias.toLowerCase() === "schema_sync_db" || alias.toLowerCase() === "dmchange" || alias.toLowerCase() === "temp") {
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "Reserved tablespace name cannot be used");
    }
    this.clearCaches();
    this[_nativeDb].detachDb(alias);
  }

  /** @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [Symbol.dispose] instead. */
  public dispose(): void {
    this[Symbol.dispose]();
  }

  /** Create an DMDb
   * @param pathName The path to the DMDb file to create.
   * @throws [IVaultError]($common) if the operation failed.
   */
  public createDb(pathName: string): void {
    const status: DbResult = this[_nativeDb].createDb(pathName);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to created DMDb");
  }

  /** Open the DMDb.
   * @param pathName The path to the DMDb file to open
   * @param openMode Open mode
   * @throws [IVaultError]($common) if the operation failed.
   */
  public openDb(pathName: string, openMode: DMDbOpenMode = DMDbOpenMode.Readonly): void {
    const nativeOpenMode: OpenMode = openMode === DMDbOpenMode.Readonly ? OpenMode.Readonly : OpenMode.ReadWrite;
    const tryUpgrade: boolean = openMode === DMDbOpenMode.FileUpgrade;
    const status: DbResult = this[_nativeDb].openDb(pathName, nativeOpenMode, tryUpgrade);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to open DMDb");
  }

  /** Returns true if the DMDb is open */
  public get isOpen(): boolean { return this[_nativeDb].isOpen(); }

  /** Close the Db after saving any uncommitted changes.
   * @throws [IVaultError]($common) if the database is not open.
   */
  public closeDb(): void {
    this.onBeforeClose.raiseEvent();
    this.clearCaches();
    this[_nativeDb].closeDb();
  }

  /** Clear all in-memory caches held in this DMDb.
   * @beta
  */
  public clearCaches(): void {
    this._statementCache.clear();
    this._sqliteStatementCache.clear();
    this[_nativeDb].clearDMDbCache();
  }

  /** @internal use to test statement caching */
  public clearStatementCache() {
    this._statementCache.clear();
  }

  /** @internal use to test statement caching */
  public getCachedStatementCount() {
    return this._statementCache.size;
  }

  /** Commit the outermost transaction, writing changes to the file. Then, restart the transaction.
   * @param changesetName The name of the operation that generated these changes.
   * @throws [IVaultError]($common) if the database is not open or if the operation failed.
   */
  public saveChanges(changesetName?: string): void {
    const status: DbResult = this[_nativeDb].saveChanges(changesetName);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to save changes");
  }

  /** Abandon (cancel) the outermost transaction, discarding all changes since last save. Then, restart the transaction.
   * @throws [IVaultError]($common) if the database is not open or if the operation failed.
   */
  public abandonChanges(): void {
    const status: DbResult = this[_nativeDb].abandonChanges();
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to abandon changes");
  }

  /** Import a schema.
   *
   * If the import was successful, the database is automatically saved to disk.
   * @param pathName Path to DMSchema XML file to import.
   * @throws [IVaultError]($common) if the database is not open or if the operation failed.
   */
  public importSchema(pathName: string): void {
    const status: DbResult = this[_nativeDb].importSchema(pathName);
    if (status !== DbResult.BE_SQLITE_OK) {
      Logger.logError(loggerCategory, `Failed to import schema from '${pathName}'.`);
      throw new IVaultError(status, `Failed to import schema from '${pathName}'.`);
    }
    this.clearCaches();
  }

  /** Removes unused schemas from the database.
   *
   * If the removal was successful, the database is automatically saved to disk.
   * @param schemaNames Array of schema names to drop
   * @throws [IVaultError]($common) if the database if the operation failed.
   * @alpha
   */
  public dropSchemas(schemaNames: string[]): void {
    if (schemaNames.length === 0)
      return;
    if (this[_nativeDb].schemaSyncEnabled())
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "Cannot drop schemas when schema sync is enabled");

    try {
      this[_nativeDb].dropSchemas(schemaNames);
      this.saveChanges('dropped unused schemas');
    } catch (error: any) {
      Logger.logError(loggerCategory, `Failed to drop schemas: ${error}`);
      this.abandonChanges();
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, `Failed to drop schemas: ${error}`);
    } finally {
      this.clearCaches();
    }
  }

  /**
   * Returns the full schema for the input name.
   * @param name The name of the schema e.g. 'DMDbMeta'
   * @returns The SchemaProps for the requested schema
   * @throws if the schema can not be found or loaded.
   */
  public getSchemaProps(name: string): DMSchemaProps {
    return this[_nativeDb].getSchemaProps(name);
  }

  /**
   * Use a prepared DMSQL statement, potentially from the statement cache. If the requested statement doesn't exist
   * in the statement cache, a new statement is prepared. After the callback completes, the statement is reset and saved
   * in the statement cache so it can be reused in the future. Use this method for DMSQL statements that will be
   * reused often and are expensive to prepare. The statement cache holds the most recently used statements, discarding
   * the oldest statements as it fills. For statements you don't intend to reuse, instead use [[withStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @returns the value returned by `callback`.
   * @see [[withWriteStatement]]
   * @beta
   */
  public withCachedWriteStatement<T>(dmsql: string, callback: (stmt: DMSqlWriteStatement) => T, logErrors = true): T {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const stmt = this._statementCache.findAndRemove(dmsql) ?? this.prepareStatement(dmsql, logErrors);
    const release = () => this._statementCache.addOrDispose(stmt);
    try {
      const val = callback(new DMSqlWriteStatement(stmt));
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /**
   * Prepared and execute a callback on an DMSQL statement. After the callback completes the statement is disposed.
   * Use this method for DMSQL statements are either not expected to be reused, or are not expensive to prepare.
   * For statements that will be reused often, instead use [[withPreparedStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @returns the value returned by `callback`.
   * @see [[withCachedWriteStatement]]
   * @beta
   */
  public withWriteStatement<T>(dmsql: string, callback: (stmt: DMSqlWriteStatement) => T, logErrors = true): T {
    const stmt = this.prepareWriteStatement(dmsql, logErrors);
    const release = () => stmt[Symbol.dispose]();
    try {
      const val = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /** Prepare an DMSQL statement.
  * @param dmsql The DMSQL statement to prepare
  * @param logErrors Determines if error will be logged if statement fail to prepare
  * @throws [IVaultError]($common) if there is a problem preparing the statement.
  * @beta
  */
  public prepareWriteStatement(dmsql: string, logErrors = true): DMSqlWriteStatement {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return new DMSqlWriteStatement(this.prepareStatement(dmsql, logErrors));
  }

  /**
   * Use a prepared DMSQL statement, potentially from the statement cache. If the requested statement doesn't exist
   * in the statement cache, a new statement is prepared. After the callback completes, the statement is reset and saved
   * in the statement cache so it can be reused in the future. Use this method for DMSQL statements that will be
   * reused often and are expensive to prepare. The statement cache holds the most recently used statements, discarding
   * the oldest statements as it fills. For statements you don't intend to reuse, instead use [[withStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @returns the value returned by `callback`.
   * @see [[withStatement]]
   * @public
   * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [[createQueryReader]] for SELECT statements and [[withCachedWriteStatement]] for INSERT/UPDATE/DELETE instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public withPreparedStatement<T>(dmsql: string, callback: (stmt: DMSqlStatement) => T, logErrors = true): T {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const stmt = this._statementCache.findAndRemove(dmsql) ?? this.prepareStatement(dmsql, logErrors);
    const release = () => this._statementCache.addOrDispose(stmt);
    try {
      const val = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /**
   * Prepared and execute a callback on an DMSQL statement. After the callback completes the statement is disposed.
   * Use this method for DMSQL statements are either not expected to be reused, or are not expensive to prepare.
   * For statements that will be reused often, instead use [[withPreparedStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @returns the value returned by `callback`.
   * @see [[withPreparedStatement]]
   * @public
   * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [[createQueryReader]] for SELECT statements and [[withWriteStatement]] for INSERT/UPDATE/DELETE instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public withStatement<T>(dmsql: string, callback: (stmt: DMSqlStatement) => T, logErrors = true): T {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const stmt = this.prepareStatement(dmsql, logErrors);
    const release = () => stmt[Symbol.dispose]();
    try {
      const val = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /** Prepare an DMSQL statement.
   * @param dmsql The DMSQL statement to prepare
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @throws [IVaultError]($common) if there is a problem preparing the statement.
   * @deprecated in 4.11 - will not be removed until after 2026-06-13.  Use [[prepareWriteStatement]] when preparing an INSERT/UPDATE/DELETE statement or [[createQueryReader]] to execute a SELECT statement.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  public prepareStatement(dmsql: string, logErrors = true): DMSqlStatement {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const stmt = new DMSqlStatement();
    stmt.prepare(this[_nativeDb], dmsql, logErrors);
    return stmt;
  }

  /**
   * Use a prepared SQL statement, potentially from the statement cache. If the requested statement doesn't exist
   * in the statement cache, a new statement is prepared. After the callback completes, the statement is reset and saved
   * in the statement cache so it can be reused in the future. Use this method for SQL statements that will be
   * reused often and are expensive to prepare. The statement cache holds the most recently used statements, discarding
   * the oldest statements as it fills. For statements you don't intend to reuse, instead use [[withSqliteStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @returns the value returned by `callback`.
   * @see [[withPreparedStatement]]
   * @public
   */
  public withPreparedSqliteStatement<T>(sql: string, callback: (stmt: SqliteStatement) => T, logErrors = true): T {
    const stmt = this._sqliteStatementCache.findAndRemove(sql) ?? this.prepareSqliteStatement(sql, logErrors);
    const release = () => this._sqliteStatementCache.addOrDispose(stmt);
    try {
      const val: T = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /**
   * Prepared and execute a callback on a SQL statement. After the callback completes the statement is disposed.
   * Use this method for SQL statements are either not expected to be reused, or are not expensive to prepare.
   * For statements that will be reused often, instead use [[withPreparedSqliteStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @returns the value returned by `callback`.
   * @public
   */
  public withSqliteStatement<T>(sql: string, callback: (stmt: SqliteStatement) => T, logErrors = true): T {
    const stmt = this.prepareSqliteStatement(sql, logErrors);
    const release = () => stmt[Symbol.dispose]();
    try {
      const val: T = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /** Prepare an SQL statement.
   * @param sql The SQLite SQL statement to prepare
   * @param logErrors Determines if error will be logged if statement fail to prepare
   * @throws [IVaultError]($common) if there is a problem preparing the statement.
   * @internal
   */
  public prepareSqliteStatement(sql: string, logErrors = true): SqliteStatement {
    const stmt = new SqliteStatement(sql);
    stmt.prepare(this[_nativeDb], logErrors);
    return stmt;
  }

  /** @internal */
  public get [_nativeDb](): IVaultJsNative.DMDb {
    assert(undefined !== this._nativeDb);
    return this._nativeDb;
  }

  /** Allow to execute query and read results along with meta data. The result are streamed.
   *
   * See also:
   * - [DMSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   * - [DMSQL Row Format]($docs/learning/ECSQLRowFormat)
   *
   * @param params The values to bind to the parameters (if the DMSQL has any).
   * @param config Allow to specify certain flags which control how query is executed.
   * @returns Returns an [DMSqlReader]($common) which helps iterate over the result set and also give access to metadata.
   * @public
   * */
  public createQueryReader(dmsql: string, params?: QueryBinder, config?: QueryOptions): DMSqlReader {
    if (!this._nativeDb || !this._nativeDb.isOpen()) {
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "db not open");
    }
    const executor = {
      execute: async (request: DbQueryRequest) => {
        return ConcurrentQuery.executeQueryRequest(this[_nativeDb], request);
      },
    };
    return new DMSqlReader(executor, dmsql, params, config);
  }

  /** Allow to execute query and read results along with meta data. The result are stepped one by one.
   *
   * See also:
   * - [DMSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   * - [DMSQL Row Format]($docs/learning/ECSQLRowFormat)
   * @param dmsql The DMSQL query to execute.
   * @param callback the callback to invoke on the prepared DMSqlSyncReader
   * @param params The values to bind to the parameters (if the DMSQL has any).
   * @param config Optional flags which control how query is executed.
   * @returns the value returned by `callback`.
   * @throws IVaultError if db is not open or if error occurs during statement execution
   * @beta
   * */
  public withQueryReader<T>(dmsql: string, callback: (reader: DMSqlSyncReader) => T, params?: QueryBinder, config?: SynchronousQueryOptions): T {
    if (!this[_nativeDb].isOpen())
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "db not open");

    const executor = new DMSqlRowExecutor(this);
    const reader = new DMSqlSyncReader(executor, dmsql, params, config);
    const release = () => executor[Symbol.dispose]();
    try {
      const val = callback(reader);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err: any) {
      release();
      throw err;
    }
  }
}
