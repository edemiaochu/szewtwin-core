/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Codes
 */

import { SzewecError, DbResult, Id64, Id64String, IVaultStatus } from "@szewtwin/core-szewec";
import { CodeScopeSpec, CodeSpec, CodeSpecProperties, EditTxnError, IVaultError } from "@szewtwin/core-common";
import { EditTxn } from "./EditTxn";
import { IVaultDb } from "./IVaultDb";
import { CodeService } from "./CodeService";
import { _implicitTxn } from "./internal/Symbols";

/** Manages [CodeSpecs]($docs/BIS/guide/fundamentals/element-fundamentals.md#codespec) within an [[IVaultDb]]
 * @public @preview
 */
export class CodeSpecs {
  private static tableName = "bis_CodeSpec";
  private _ivault: IVaultDb;
  private _loadedCodeSpecs: CodeSpec[] = [];

  constructor(ivault: IVaultDb) {
    this._ivault = ivault;
    if (ivault.isBriefcaseDb()) {
      ivault.onChangesetApplied.addListener(() => this._loadedCodeSpecs.length = 0);
    }
  }

  private findByName(name: string): Id64String | undefined {
    return this._ivault.withSqliteStatement(`SELECT Id FROM ${CodeSpecs.tableName} WHERE Name=?`, (stmt) => {
      stmt.bindString(1, name);
      return stmt.nextRow() ? stmt.getValueId(0) : undefined;
    });
  }

  /** Look up the Id of the CodeSpec with the specified name. */
  public queryId(name: string): Id64String {
    const id = this.findByName(name);
    if (!id)
      throw new IVaultError(IVaultStatus.NotFound, "CodeSpec not found");
    return id;
  }

  /** Look up a CodeSpec by Id. The CodeSpec will be loaded from the database if necessary.
   * @param codeSpecId The Id of the CodeSpec to load
   * @returns The CodeSpec with the specified Id
   * @throws [[IVaultError]] if the Id is invalid or if no CodeSpec with that Id could be found.
   */
  public getById(codeSpecId: Id64String): CodeSpec {
    // good chance it is already loaded - check there before running a query
    const found = this._loadedCodeSpecs.find((codeSpec) => codeSpec.id === codeSpecId);
    if (found !== undefined)
      return found;

    // must load this codespec
    const loadedCodeSpec = this.load(codeSpecId);
    this._loadedCodeSpecs.push(loadedCodeSpec);
    return loadedCodeSpec;
  }

  /** Returns true if the IVaultDb has a CodeSpec of the specified Id. */
  public hasId(codeSpecId: Id64String): boolean {
    try {
      return undefined !== this.getById(codeSpecId);
    } catch {
      return false;
    }
  }

  /** Look up a CodeSpec by name. The CodeSpec will be loaded from the database if necessary.
   * @param name The name of the CodeSpec to load
   * @returns The CodeSpec with the specified name
   * @throws [[IVaultError]] if no CodeSpec with the specified name could be found.
   */
  public getByName(name: string): CodeSpec {
    // good chance it is already loaded - check there before running a query
    const found = this._loadedCodeSpecs.find((codeSpec) => codeSpec.name === name);
    if (found !== undefined)
      return found;
    const codeSpecId = this.queryId(name);
    if (codeSpecId === undefined)
      throw new IVaultError(IVaultStatus.NotFound, "CodeSpec not found");
    return this.getById(codeSpecId);
  }

  /** Returns true if the IVaultDb has a CodeSpec of the specified name. */
  public hasName(name: string): boolean {
    try {
      return undefined !== this.getByName(name);
    } catch {
      return false;
    }
  }

  private insertCodeSpec(specName: string, properties: CodeSpecProperties): Id64String {
    const iVault = this._ivault;
    const spec: CodeService.BisCodeSpecIndexProps = { name: specName.trim(), props: JSON.stringify(properties) };
    if (this.findByName(spec.name))
      throw new IVaultError(IVaultStatus.DuplicateName, "CodeSpec already exists");

    const internalCodes = iVault.codeService?.internalCodes;
    if (internalCodes) {
      // Since there is no lock on the codespec table, to add a codespec to an iVault it must first be reserved in the
      // internal code index via `internalCodes.reserveBisCodeSpecs` prior to calling this function.
      // This ensures that the Ids will be unique, and the property values consistent, even if more than one user
      // adds them without pushing their changes. The call to `verifyBisCodeSpec` will throw otherwise.
      internalCodes.reader.verifyBisCodeSpec(spec);
    } else {
      // If this iVault doesn't have an internal code index, we have no way of coordinating the Ids for CodeSpecs across multiple users.
      // Just look in this briefcase to find the currently highest used Id and hope for the best.
      spec.id = iVault.withSqliteStatement(`SELECT MAX(Id) FROM ${CodeSpecs.tableName}`, (stmt) => stmt.nextRow() ? stmt.getValueInteger(0) + 1 : 1);
    }

    const id = spec.id!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    iVault.withSqliteStatement(`INSERT INTO ${CodeSpecs.tableName}(Id,Name,JsonProperties) VALUES(?,?,?)`, (stmt) => {
      stmt.bindInteger(1, id);
      stmt.bindString(2, spec.name);
      stmt.bindString(3, spec.props);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new SzewecError(rc, "Error inserting codeSpec");
    });

    return Id64.fromLocalAndBriefcaseIds(id, 0);
  }

  /** Add a new CodeSpec to the iVault.
   * @param txn The active EditTxn.
   * @param codeSpec The CodeSpec to insert
   * @returns The Id of the persistent CodeSpec.
   * @note If successful, this method will assign a valid CodeSpecId to the supplied CodeSpec
   * @throws IVaultError if the insertion fails
   * @beta
   */
  public insert(txn: EditTxn, codeSpec: CodeSpec): Id64String;

  /** Add a new CodeSpec to the iVault.
   * @param txn The active EditTxn.
   * @param name The name for the new CodeSpec.
   * @param properties The properties of the CodeSpec. For backwards compatibility this may also be a `CodeScopeSpec.Type`.
   * @returns The Id of the persistent CodeSpec.
   * @throws IVaultError if the insertion fails
   * @beta
   */
  public insert(txn: EditTxn, name: string, properties: CodeSpecProperties | CodeScopeSpec.Type): Id64String;

  /** Add a new CodeSpec to the iVault.
   * @param codeSpec The CodeSpec to insert
   * @returns The Id of the persistent CodeSpec.
   * @note If successful, this method will assign a valid CodeSpecId to the supplied CodeSpec
   * @throws IVaultError if the insertion fails
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use CodeSpecs.insert(txn, codeSpec) instead.
   */
  public insert(codeSpec: CodeSpec): Id64String;

  /** Add a new CodeSpec to the IVaultDb.
   * @param name The name for the new CodeSpec.
   * @param properties The properties or the CodeSpec. For backwards compatibility this may also be a `CodeScopeSpec.Type`.
   * @returns The Id of the persistent CodeSpec.
   * @throws IVaultError if the insertion fails
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use CodeSpecs.insert(txn, ...) instead.
   */
  public insert(name: string, properties: CodeSpecProperties | CodeScopeSpec.Type): Id64String;
  public insert(
    txnOrCodeSpec: EditTxn | CodeSpec | string,
    codeSpecOrNameOrProps?: CodeSpec | string | CodeSpecProperties | CodeScopeSpec.Type,
    props?: CodeSpecProperties | CodeScopeSpec.Type,
  ): Id64String {
    if (txnOrCodeSpec instanceof EditTxn) {
      const txn = txnOrCodeSpec;
      if (txn.iVault !== this._ivault)
        EditTxnError.throwError("wrong-ivault", "EditTxn does not belong to this iVault", txn.iVault.key);
      // CodeSpec insertion writes directly to SQLite, so enforce txn writability explicitly.
      txn.verifyWriteable();
      if (codeSpecOrNameOrProps instanceof CodeSpec) {
        const id = this.insertCodeSpec(codeSpecOrNameOrProps.name, codeSpecOrNameOrProps.properties);
        codeSpecOrNameOrProps.id = id;
        return id;
      }
      if (typeof codeSpecOrNameOrProps !== "string" || props === undefined)
        throw new IVaultError(IVaultStatus.BadArg, "Invalid argument");

      if (typeof props === "object")
        return this.insertCodeSpec(codeSpecOrNameOrProps, props);

      const spec = CodeSpec.create(this._ivault, codeSpecOrNameOrProps, props);
      return this.insertCodeSpec(spec.name, spec.properties);
    }

    // Deprecated overloads - use implicit transaction.
    if (txnOrCodeSpec instanceof CodeSpec)
      return this.insert(this._ivault[_implicitTxn], txnOrCodeSpec);

    if (codeSpecOrNameOrProps === undefined)
      throw new IVaultError(IVaultStatus.BadArg, "Invalid argument");

    if (typeof codeSpecOrNameOrProps === "string" || codeSpecOrNameOrProps instanceof CodeSpec)
      throw new IVaultError(IVaultStatus.BadArg, "Invalid argument");

    return this.insert(this._ivault[_implicitTxn], txnOrCodeSpec, codeSpecOrNameOrProps);
  }

  /** Update the Json properties of an existing CodeSpec.
   * @param txn The active EditTxn.
   * @param codeSpec The codeSpec holding Json properties values to update.
   * @throws if unable to update the codeSpec.
   * @beta
   */
  public updateProperties(txn: EditTxn, codeSpec: CodeSpec): void;

  /** Update the Json properties of an existing CodeSpec.
   * @param codeSpec The codeSpec holding Json properties values to update.
   * @throws if unable to update the codeSpec.
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use CodeSpecs.updateProperties(txn, codeSpec) instead.
   */
  public updateProperties(codeSpec: CodeSpec): void;
  public updateProperties(txnOrCodeSpec: EditTxn | CodeSpec, codeSpec?: CodeSpec): void {
    let effectiveTxn: EditTxn;
    let effectiveCodeSpec: CodeSpec;

    if (txnOrCodeSpec instanceof EditTxn) {
      effectiveTxn = txnOrCodeSpec;
      if (effectiveTxn.iVault !== this._ivault)
        EditTxnError.throwError("wrong-ivault", "EditTxn does not belong to this iVault", effectiveTxn.iVault.key);

      if (undefined === codeSpec)
        throw new IVaultError(IVaultStatus.BadArg, "Invalid argument");

      effectiveCodeSpec = codeSpec;
    } else {
      effectiveTxn = this._ivault[_implicitTxn];
      effectiveCodeSpec = txnOrCodeSpec;
    }

    effectiveTxn.verifyWriteable();
    this._ivault.withSqliteStatement(`UPDATE ${CodeSpecs.tableName} SET JsonProperties=? WHERE Id=?`, (stmt) => {
      stmt.bindString(1, JSON.stringify(effectiveCodeSpec.properties));
      stmt.bindId(2, effectiveCodeSpec.id);
      if (DbResult.BE_SQLITE_DONE !== stmt.step())
        throw new IVaultError(IVaultStatus.BadArg, "error updating CodeSpec properties");
    });
  }

  /** Load a CodeSpec from the iVault
   * @param id  The persistent Id of the CodeSpec to load
   */
  public load(id: Id64String): CodeSpec {
    if (Id64.isInvalid(id))
      throw new IVaultError(IVaultStatus.InvalidId, "Invalid codeSpecId");

    return this._ivault.withSqliteStatement(`SELECT Name,JsonProperties FROM ${CodeSpecs.tableName} WHERE Id=?`, (stmt) => {
      stmt.bindId(1, id);
      if (!stmt.nextRow())
        throw new IVaultError(IVaultStatus.InvalidId, "CodeSpec not found");

      return CodeSpec.createFromJson(this._ivault, id, stmt.getValueString(0), JSON.parse(stmt.getValueString(1)));
    });
  }
}
