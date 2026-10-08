/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */

import * as touch from "touch";
import {
  assert, BeEvent, SzewecError, compareStrings, CompressedId64Set, DbConflictResolution, DbResult, Id64, Id64Array, Id64String, IVaultStatus, IndexMap, Logger, OrderedId64Array
} from "@szewtwin/core-szewec";
import { ChangesetIdWithIndex, ChangesetIndexAndId, ChangesetProps, EntityIdAndClassIdIterable, IVaultError, ModelGeometryChangesProps, ModelIdAndGeometryGuid, NotifyEntitiesChangedArgs, NotifyEntitiesChangedMetadata, ReinstateTxnArgs, ReverseTxnArgs, TxnProps } from "@szewtwin/core-common";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BriefcaseDb } from "./IVaultDb";
import { Element } from "./Element";
import { IpcHost } from "./IpcHost";
import { Relationship, RelationshipProps } from "./Relationship";
import { SqliteStatement } from "./SqliteStatement";
import { _nativeDb } from "./internal/Symbols";
import { DbRebaseChangesetConflictArgs, RebaseChangesetConflictArgs } from "./internal/ChangesetConflictArgs";
import { BriefcaseManager } from "./BriefcaseManager";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { ChangesetReader } from "./ChangesetReader";
import { ChangeUnifierCache, PartialChangeUnifier } from "./PartialChangeUnifier";
import { ChangeInstance } from "./ChangesetReaderTypes";

/** A string that identifies a Txn.
 * @public @preview
 */
export type TxnIdString = string;

/** An error generated during dependency validation.
 * @see [[TxnManager.validationErrors]].
 * @public @preview
 */
export interface ValidationError {
  /** If true, txn is aborted. */
  fatal: boolean;
  /** The type of error. */
  errorType: string;
  /** Optional description of what went wrong. */
  message?: string;
}

/** Describes a set of [[Element]]s or [[Model]]s that changed as part of a transaction.
 * @see [[TxnManager.onElementsChanged]] and [[TxnManager.onModelsChanged]].
 * @public @preview
 */
export interface TxnChangedEntities {
  /** The entities that were inserted by the transaction. */
  readonly inserts: EntityIdAndClassIdIterable;
  /** The entities that were deleted by the transaction. */
  readonly deletes: EntityIdAndClassIdIterable;
  /** The entities that were modified by the transaction, including any [[Element]]s for which one of their [[ElementAspect]]s was changed. */
  readonly updates: EntityIdAndClassIdIterable;
}

/** Arguments supplied to [[TxnManager.queryLocalChanges]].
 * @beta
 */
export interface QueryLocalChangesArgs {
  /** If supplied and non-empty, restricts the results to include only DM instances belonging to the specified classes or subclasses thereof. */
  readonly includedClasses?: string[];
  /** If `true`, include changes that have not yet been saved. */
  readonly includeUnsavedChanges?: boolean;
}

/** Represents a change (insertion, deletion, or modification) to a single DM instance made in a local [[BriefcaseDb]].
 * @see [[TxnManager.queryLocalChanges]] to iterate all of the changed instances.
* @beta
*/
export interface ChangeInstanceKey {
  /** DMInstanceId of the instance. */
  id: Id64String;
  /** Fully-qualified class name of the instance. */
  classFullName: string;
  /** The type of change. */
  changeType: "inserted" | "updated" | "deleted";
}

type EntitiesChangedEvent = BeEvent<(changes: TxnChangedEntities) => void>;

/** Strictly for tests. @internal */
export function setMaxEntitiesPerEvent(max: number): number {
  const prevMax = ChangedEntitiesProc.maxPerEvent;
  ChangedEntitiesProc.maxPerEvent = max;
  return prevMax;
}

/** Maintains an ordered array of entity Ids and a parallel array containing the index of the corresponding entity's class Id. */
class ChangedEntitiesArray {
  public readonly entityIds = new OrderedId64Array();
  private readonly _classIndices: number[] = [];
  private readonly _classIds: IndexMap<Id64String>;

  public constructor(classIds: IndexMap<Id64String>) {
    this._classIds = classIds;
  }

  public insert(entityId: Id64String, classId: Id64String): void {
    const entityIndex = this.entityIds.insert(entityId);
    const classIndex = this._classIds.insert(classId);
    assert(classIndex >= 0);
    if (this.entityIds.length !== this._classIndices.length) {
      // New entity - insert corresponding class index entry.
      this._classIndices.splice(entityIndex, 0, classIndex);
    } else {
      // Existing entity - update corresponding class index.
      // (We do this because apparently connectors can (very rarely) change the class Id of an existing element).
      this._classIndices[entityIndex] = classIndex;
    }

    assert(this.entityIds.length === this._classIndices.length);
  }

  public clear(): void {
    this.entityIds.clear();
    this._classIndices.length = 0;
  }

  public addToChangedEntities(entities: NotifyEntitiesChangedArgs, type: "deleted" | "inserted" | "updated"): void {
    if (this.entityIds.length > 0)
      entities[type] = CompressedId64Set.compressIds(this.entityIds);

    entities[`${type}Meta`] = this._classIndices;
  }

  public iterable(classIds: Id64Array): EntityIdAndClassIdIterable {
    function* iterator(entityIds: ReadonlyArray<Id64String>, classIndices: number[]) {
      const entity = { id: "", classId: "" };
      for (let i = 0; i < entityIds.length; i++) {
        entity.id = entityIds[i];
        entity.classId = classIds[classIndices[i]];
        yield entity;
      }
    }

    return {
      [Symbol.iterator]: () => iterator(this.entityIds.array, this._classIndices),
    };
  }
}

class ChangedEntitiesProc {
  private readonly _classIds = new IndexMap<Id64String>((lhs, rhs) => compareStrings(lhs, rhs));
  private readonly _inserted = new ChangedEntitiesArray(this._classIds);
  private readonly _deleted = new ChangedEntitiesArray(this._classIds);
  private readonly _updated = new ChangedEntitiesArray(this._classIds);
  private _currSize = 0;

  public static maxPerEvent = 1000;

  public static process(iVault: BriefcaseDb, mgr: TxnManager): void {
    if (mgr.isDisposed) {
      // The iVault is being closed. Do not prepare new sqlite statements.
      return;
    }

    this.processChanges(iVault, mgr.onElementsChanged, "notifyElementsChanged");
    this.processChanges(iVault, mgr.onModelsChanged, "notifyModelsChanged");
  }

  private populateMetadata(db: BriefcaseDb, classIds: Id64Array): NotifyEntitiesChangedMetadata[] {
    // Ensure metadata for all class Ids is loaded. Loading metadata for a derived class loads metadata for all of its superclasses.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const classIdsToLoad = classIds.filter((x) => undefined === db.classMetaDataRegistry.findByClassId(x));
    if (classIdsToLoad.length > 0) {
      const classIdsStr = classIdsToLoad.join(",");
      const sql = `SELECT dm_class.Name, dm_class.Id, dm_schema.Name FROM dm_class JOIN dm_schema WHERE dm_schema.Id = dm_class.SchemaId AND dm_class.Id IN (${classIdsStr})`;
      db.withPreparedSqliteStatement(sql, (stmt) => {
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          const classFullName = `${stmt.getValueString(2)}:${stmt.getValueString(0)}`;
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          db.tryGetMetaData(classFullName);
        }
      });
    }

    // Define array indices for the metadata array entries correlating to the class Ids in the input list.
    const nameToIndex = new Map<string, number>();
    for (const classId of classIds) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const meta = db.classMetaDataRegistry.findByClassId(classId);
      nameToIndex.set(meta?.dmclass ?? "", nameToIndex.size);
    }

    const result: NotifyEntitiesChangedMetadata[] = [];

    function addMetadata(name: string, index: number): void {
      const bases: number[] = [];
      result[index] = { name, bases };

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const meta = db.tryGetMetaData(name);
      if (!meta) {
        return;
      }

      for (const baseClassName of meta.baseClasses) {
        let baseClassIndex = nameToIndex.get(baseClassName);
        if (undefined === baseClassIndex) {
          baseClassIndex = nameToIndex.size;
          nameToIndex.set(baseClassName, baseClassIndex);
          addMetadata(baseClassName, baseClassIndex);
        }

        bases.push(baseClassIndex);
      }
    }

    for (const [name, index] of nameToIndex) {
      if (index >= classIds.length) {
        // Entries beyond this are base classes for the classes in `classIds` - don't reprocess them.
        break;
      }

      addMetadata(name, index);
    }

    return result;
  }

  private sendEvent(iVault: BriefcaseDb, evt: EntitiesChangedEvent, evtName: "notifyElementsChanged" | "notifyModelsChanged") {
    if (this._currSize === 0)
      return;

    const classIds = this._classIds.toArray();

    // Notify backend listeners.
    const txnEntities: TxnChangedEntities = {
      inserts: this._inserted.iterable(classIds),
      deletes: this._deleted.iterable(classIds),
      updates: this._updated.iterable(classIds),
    };
    evt.raiseEvent(txnEntities);

    // Notify frontend listeners.
    const entities: NotifyEntitiesChangedArgs = {
      insertedMeta: [],
      updatedMeta: [],
      deletedMeta: [],
      meta: this.populateMetadata(iVault, classIds),
    };

    this._inserted.addToChangedEntities(entities, "inserted");
    this._deleted.addToChangedEntities(entities, "deleted");
    this._updated.addToChangedEntities(entities, "updated");

    IpcHost.notifyTxns(iVault, evtName, entities);

    // Reset state.
    this._inserted.clear();
    this._deleted.clear();
    this._updated.clear();
    this._classIds.clear();
    this._currSize = 0;
  }

  private static processChanges(iVault: BriefcaseDb, changedEvent: EntitiesChangedEvent, evtName: "notifyElementsChanged" | "notifyModelsChanged") {
    try {
      const maxSize = this.maxPerEvent;
      const changes = new ChangedEntitiesProc();
      const select = "notifyElementsChanged" === evtName
        ? "SELECT ElementId, ChangeType, DMClassId FROM temp.txn_Elements"
        : "SELECT ModelId, ChangeType, DMClassId FROM temp.txn_Models";
      iVault.withPreparedSqliteStatement(select, (sql: SqliteStatement) => {
        const stmt = sql.stmt;
        while (sql.step() === DbResult.BE_SQLITE_ROW) {
          const id = stmt.getValueId(0);
          const classId = stmt.getValueId(2);
          switch (stmt.getValueInteger(1)) {
            case 0:
              changes._inserted.insert(id, classId);
              break;
            case 1:
              changes._updated.insert(id, classId);
              break;
            case 2:
              changes._deleted.insert(id, classId);
              break;
          }

          if (++changes._currSize >= maxSize)
            changes.sendEvent(iVault, changedEvent, evtName);
        }
      });

      changes.sendEvent(iVault, changedEvent, evtName);
    } catch (err) {
      Logger.logError(BackendLoggerCategory.IVaultDb, SzewecError.getErrorMessage(err));
    }
  }
}

/** @internal */
interface IConflictHandler {
  handler: (arg: RebaseChangesetConflictArgs) => DbConflictResolution | undefined;
  next: IConflictHandler | undefined;
  id: string;
}

/**
 * @alpha
 * Transaction modes
 */
export type TxnMode = "direct" | "indirect";

/**
 * Manages the process of merging and rebasing local changes (transactions) in a [[BriefcaseDb]].
 *
 * The `RebaseManager` coordinates the rebase of local transactions when pulling and merging changes from other sources,
 * such as remote repositories or other users. It provides mechanisms to handle transaction conflicts, register custom conflict
 * handlers, and manage the rebase workflow. This includes resuming rebases, invoking user-defined handlers for conflict resolution,
 * and tracking the current merge/rebase state.
 *
 * Key responsibilities:
 * - Orchestrates the rebase of local transactions after a pull/merge operation.
 * - Allows registration and removal of custom conflict handlers to resolve changeset conflicts during rebase.
 * - Provides methods to check the current merge/rebase state.
 * - Raises events before and after each transaction is rebased.
 * - Ensures changes are saved or aborted appropriately based on the outcome of the rebase process.
 *
 * @alpha
 */
export class RebaseManager {
  private _conflictHandlers?: IConflictHandler;
  private _customHandler?: RebaseHandler;
  private _aborting: boolean = false;
  private _disposed: boolean = false;

  /** Event raised before pull merge process begins.
   * @alpha
   */
  public readonly onPullMergeBegin = new BeEvent<(changeset: ChangesetIdWithIndex) => void>();

  /** Event raised before a rebase operation begins.
   * @alpha
   */
  public readonly onRebaseBegin = new BeEvent<(txns: TxnProps[]) => void>();

  /** Event raised before a transaction is rebased.
   * @alpha
   */
  public readonly onRebaseTxnBegin = new BeEvent<(txnProps: TxnProps) => void>();
  /** Event raised after a transaction is rebased.
   * @alpha
   */
  public readonly onRebaseTxnEnd = new BeEvent<(txnProps: TxnProps) => void>();

  /** Event raised after a rebase operation ends.
   * @alpha
   */
  public readonly onRebaseEnd = new BeEvent<(txns: TxnProps[]) => void>();
  /** Event raised after pull merge process ends.
   * @alpha
   */
  public readonly onPullMergeEnd = new BeEvent<(changeset: ChangesetIdWithIndex) => void>();

  /** Event raised before applying incoming changes.
   * @alpha
   */
  public readonly onApplyIncomingChangesBegin = new BeEvent<(changesets: ChangesetProps[]) => void>();

  /** Event raised after applying incoming changes.
   * @alpha
   */
  public readonly onApplyIncomingChangesEnd = new BeEvent<(changes: ChangesetProps[]) => void>();

  /** Event raised before reversing local changes.
  * @alpha
   */
  public readonly onReverseLocalChangesBegin = new BeEvent<() => void>();

  /** Event raised after reversing local changes.
   * @alpha
   */
  public readonly onReverseLocalChangesEnd = new BeEvent<(txns: TxnProps[]) => void>();

  /** Event raised before downloading changesets.
   * @alpha
   */
  public readonly onDownloadChangesetsBegin = new BeEvent<() => void>();

  /** Event raised after downloading changesets.
   * @alpha
   */
  public readonly onDownloadChangesetsEnd = new BeEvent<() => void>();


  /** @internal */
  public notifyPullMergeBegin(changeset: ChangesetIdWithIndex) {
    this.onPullMergeBegin.raiseEvent(changeset);
    IpcHost.notifyTxns(this._iVault, "notifyPullMergeBegin", changeset);
  }
  /** @internal */
  public notifyPullMergeEnd(changeset: ChangesetIdWithIndex) {
    this.onPullMergeEnd.raiseEvent(changeset);
    IpcHost.notifyTxns(this._iVault, "notifyPullMergeEnd", changeset);
  }
  /** @internal */
  public notifyApplyIncomingChangesBegin(changes: ChangesetProps[]) {
    this.onApplyIncomingChangesBegin.raiseEvent(changes);
    IpcHost.notifyTxns(this._iVault, "notifyApplyIncomingChangesBegin", changes);
  }
  /** @internal */
  public notifyApplyIncomingChangesEnd(changes: ChangesetProps[]) {
    this.onApplyIncomingChangesEnd.raiseEvent(changes);
    IpcHost.notifyTxns(this._iVault, "notifyApplyIncomingChangesEnd", changes);
  }
  /** @internal */
  public notifyReverseLocalChangesBegin() {
    this.onReverseLocalChangesBegin.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyReverseLocalChangesBegin");
  }
  /** @internal */
  public notifyReverseLocalChangesEnd(txns: TxnProps[]) {
    this.onReverseLocalChangesEnd.raiseEvent(txns);
    IpcHost.notifyTxns(this._iVault, "notifyReverseLocalChangesEnd", txns);
  }
  /** @internal */
  public notifyDownloadChangesetsBegin() {
    this.onDownloadChangesetsBegin.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyDownloadChangesetsBegin");
  }
  /** @internal */
  public notifyDownloadChangesetsEnd() {
    this.onDownloadChangesetsEnd.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyDownloadChangesetsEnd");
  }
  /** @internal */
  public notifyRebaseBegin(txns: TxnProps[]) {
    this.onRebaseBegin.raiseEvent(txns);
    IpcHost.notifyTxns(this._iVault, "notifyRebaseBegin", txns);
  }
  /** @internal */
  public notifyRebaseEnd(txns: TxnProps[]) {
    this.onRebaseEnd.raiseEvent(txns);
    IpcHost.notifyTxns(this._iVault, "notifyRebaseEnd", txns);
  }
  /** @internal */
  public notifyRebaseTxnBegin(txnProps: TxnProps) {
    this.onRebaseTxnBegin.raiseEvent(txnProps);
    IpcHost.notifyTxns(this._iVault, "notifyRebaseTxnBegin", txnProps);
  }
  /** @internal */
  public notifyRebaseTxnEnd(txnProps: TxnProps) {
    this.onRebaseTxnEnd.raiseEvent(txnProps);
    IpcHost.notifyTxns(this._iVault, "notifyRebaseTxnEnd", txnProps);
  }

  public constructor(private _iVault: BriefcaseDb) { }

  /** Disposes of this RebaseManager, clearing all event listeners.
   * Also calls [[RebaseHandler.dispose]] on the registered custom handler, if any.
   * Subsequent calls are ignored.
   * @alpha
   */
  public dispose(): void {
    if (this._disposed)
      return;
    this._disposed = true;
    this._customHandler?.dispose?.();
    this.onPullMergeBegin.clear();
    this.onRebaseBegin.clear();
    this.onRebaseTxnBegin.clear();
    this.onRebaseTxnEnd.clear();
    this.onRebaseEnd.clear();
    this.onPullMergeEnd.clear();
    this.onApplyIncomingChangesBegin.clear();
    this.onApplyIncomingChangesEnd.clear();
    this.onReverseLocalChangesBegin.clear();
    this.onReverseLocalChangesEnd.clear();
    this.onDownloadChangesetsBegin.clear();
    this.onDownloadChangesetsEnd.clear();
  }

  /**
   * Resumes the rebase process for the current iVault, applying any pending local changes
   * on top of the latest pulled changes from the remote source.
   *
   * This method performs the following steps:
   * 1. Begins the rebase process using the native database.
   * 2. Iterates through each transaction that needs to be rebased:
   *    - Retrieves transaction properties.
   *    - Raises events before and after rebasing each transaction.
   *    - Optionally reinstates local changes based on the rebase handler.
   *    - Optionally recomputes transaction data using the rebase handler.
   *    - Updates the transaction in the native database.
   * 3. Ends the rebase process and saves changes if the database is not read-only.
   * 4. Drops any restore point associated with the pull-merge operation.
   *
   * If an error occurs during the process, the rebase is aborted and the error is rethrown.
   *
   * @throws {Error} If a transaction cannot be found or if any step in the rebase process fails.
   */
  public async resume() {
    const nativeDb = this._iVault[_nativeDb];
    const txns = this._iVault.txns;
    try {
      const reversedTxns = nativeDb.pullMergeRebaseBegin();
      const reversedTxnProps = reversedTxns.map((_) => txns.getTxnProps(_)).filter((_): _ is TxnProps => _ !== undefined);
      this.notifyRebaseBegin(reversedTxnProps);

      let txnId = nativeDb.pullMergeRebaseNext();
      while (txnId) {
        const txnProps = txns.getTxnProps(txnId);
        if (!txnProps) {
          throw new Error(`Transaction ${txnId} not found`);
        }
        this.notifyRebaseTxnBegin(txnProps);
        Logger.logInfo(BackendLoggerCategory.IVaultDb, `Rebasing local changes for transaction ${txnId}`);
        const shouldReinstate = this._customHandler?.shouldReinstate(txnProps) ?? true;
        if (shouldReinstate) {
          nativeDb.pullMergeRebaseReinstateTxn();
          Logger.logInfo(BackendLoggerCategory.IVaultDb, `Reinstated local changes for transaction ${txnId}`);
        }

        if (this._customHandler) {
          await this._customHandler.recompute(txnProps);
        }

        nativeDb.pullMergeRebaseUpdateTxn();
        this.notifyRebaseTxnEnd(txnProps);
        txnId = nativeDb.pullMergeRebaseNext();
      }

      nativeDb.pullMergeRebaseEnd();
      this.notifyRebaseEnd(reversedTxnProps);
      if (!nativeDb.isReadonly) {
        nativeDb.saveChanges("Merge.");
      }
      if (BriefcaseManager.containsRestorePoint(this._iVault, BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME)) {
        BriefcaseManager.dropRestorePoint(this._iVault, BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME);
      }
      this.notifyPullMergeEnd(this._iVault.changeset);
    } catch (err) {
      nativeDb.pullMergeRebaseAbortTxn();
      throw err;
    }
  }

  /**
   * Resumes the rebase process for the current iVault, applying any pending local changes
   * on top of the latest pulled changes from the remote source.
   *
   * This method performs the following steps:
   * 1. Begins the rebase process using the native database.
   * 2. Iterates through each transaction that needs to be rebased:
   *    - Retrieves transaction properties.
   *    - Raises events before and after rebasing each transaction.
   *    - Optionally reinstates local changes based on the rebase handler.
   *    - Optionally recomputes transaction data using the rebase handler.
   *    - Updates the transaction in the native database.
   * 3. Ends the rebase process and saves changes if the database is not read-only.
   * 4. Drops any restore point associated with the pull-merge operation.
   *
   * If an error occurs during the process, the rebase is aborted and the error is rethrown.
   *
   * @throws {Error} If a transaction cannot be found or if any step in the rebase process fails.
   */

  public async resumeSemantic() {
    const nativeDb = this._iVault[_nativeDb];
    const txns = this._iVault.txns;
    try {
      const reversedTxns = nativeDb.pullMergeRebaseBegin();
      const reversedTxnProps = reversedTxns.map((_) => txns.getTxnProps(_)).filter((_): _ is TxnProps => _ !== undefined);
      this.notifyRebaseBegin(reversedTxnProps);

      let txnId = nativeDb.pullMergeRebaseNext();
      while (txnId) {
        const txnProps = txns.getTxnProps(txnId);
        if (!txnProps) {
          throw new IVaultError(IVaultStatus.NotFound, `Transaction ${txnId} not found`);
        }

        this.notifyRebaseTxnBegin(txnProps);
        Logger.logInfo(BackendLoggerCategory.IVaultDb, `Rebasing local changes for transaction ${txnId}`);
        const shouldReinstate = this._customHandler?.shouldReinstate(txnProps) ?? true;
        if (shouldReinstate) {
          await this.reinstateSemanticChangeSet(txnProps);
          Logger.logInfo(BackendLoggerCategory.IVaultDb, `Reinstated local changes for transaction ${txnId}`);
        }

        if (this._customHandler) {
          await this._customHandler.recompute(txnProps);
        }

        nativeDb.pullMergeRebaseUpdateTxn();
        this.purgeSchemaFolderForNoopSchemaChange(txnProps);
        this.notifyRebaseTxnEnd(txnProps);

        txnId = nativeDb.pullMergeRebaseNext();
      }

      nativeDb.pullMergeRebaseEnd();
      this.notifyRebaseEnd(reversedTxnProps);
      if (!nativeDb.isReadonly) {
        nativeDb.saveChanges("Merge.");
      }
      if (BriefcaseManager.containsRestorePoint(this._iVault, BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME)) {
        BriefcaseManager.dropRestorePoint(this._iVault, BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME);
      }
      BriefcaseManager.deleteRebaseFolders(this._iVault, true); // clean up all rebase folders after successful rebase
      this.notifyPullMergeEnd(this._iVault.changeset);
    } catch (err) {
      Logger.logError(BackendLoggerCategory.IVaultDb, `Error during semantic rebase at transaction ${txns.getCurrentTxnId()}`, () => SzewecError.getErrorProps(err));
      nativeDb.pullMergeRebaseAbortTxn();
      throw err;
    }
  }

  /**
   * Checks if the transaction is a schema change and if it was a noop change during rebase, purges the local folder for that txn
   * @param txnProps
   * @internal
   */
  private purgeSchemaFolderForNoopSchemaChange(txnProps: TxnProps) {
    if (txnProps.type === "DMSchema" || txnProps.type === "Schema") {
      const newProps = this._iVault.txns.getTxnProps(txnProps.id);
      if (newProps === undefined) { // if new props is undefined that means after importing the schemas it was a no op change so the txn is deleted from table and therefore we also donot need thwe local folder anymore
        BriefcaseManager.deleteTxnSchemaFolder(this._iVault, txnProps.id); // delete the folder after importing
      }
    }
  }
  /**
   * Reinstantes the semantic changeset data for the given txnProps, both schema as well as data changesets
    * @param txnProps
   * @throws IVaultError if local folder for transaction does not exist
   * @internal
   */
  private async reinstateSemanticChangeSet(txnProps: TxnProps) {
    if (txnProps.type === "DMSchema" || txnProps.type === "Schema") {

      if (!BriefcaseManager.semanticRebaseSchemaFolderExists(this._iVault, txnProps.id)) {
        throw new IVaultError(IVaultStatus.BadRequest, `Local folder does not exist for transaction ${txnProps.id}`);
      }

      const schemasToImport = BriefcaseManager.getSchemasForTxn(this._iVault, txnProps.id);
      const nativeImportOptions: IVaultJsNative.SchemaImportOptions = {
        schemaLockHeld: true,
      };
      this._iVault[_nativeDb].importSchemasDuringSemanticRebase(schemasToImport, nativeImportOptions);
      this._iVault.clearCaches();
    }
    else if (txnProps.type === "Ddl") {
      // DDL changes are already applied by importSchemasDuringSemanticRebase above — skip native reinstatement
      // to avoid UNIQUE constraint violations on dm_Property and similar schema tables.
    }
    else if (txnProps.type === "Data") {

      if (!BriefcaseManager.semanticRebaseDataFolderExists(this._iVault, txnProps.id)) {
        throw new IVaultError(IVaultStatus.BadRequest, `Local folder does not exist for transaction ${txnProps.id}`);
      }

      for await (const instance of BriefcaseManager.getChangedInstancesDataForTxn(this._iVault, txnProps.id)) {
        if (instance.$meta.isIndirectChange) {
          this._iVault.txns.withIndirectTxnMode(() => {
            this.applyInstancePatch(instance);
          });
          continue;
        }
        this.applyInstancePatch(instance);
      }

      BriefcaseManager.deleteTxnDataFolder(this._iVault, txnProps.id); // delete the folder after importing
    }
    else {
      this._iVault[_nativeDb].pullMergeRebaseReinstateTxn();
    }
  }

  /**
   * Applies instance patch during rebase
   * @param instance
   * @internal
   */
  private applyInstancePatch(instance: ChangeInstance) {
    const nativeDb = this._iVault[_nativeDb];
    const { $meta, ...props } = instance;
    switch ($meta.op) {
      case "Inserted": {
        if (!props)
          throw new IVaultError(IVaultStatus.BadRequest, "InstancePatch with op 'Inserted' must have props");
        const options = { forceUseId: true, useJsNames: true };
        const id = nativeDb.insertInstance(props, options);
        if (!Id64.isValidId64(id))
          throw new IVaultError(IVaultStatus.BadRequest, `Failed to insert instance with id ${props.id}`);
        break;
      }
      case "Updated": {
        if (!props)
          throw new IVaultError(IVaultStatus.BadRequest, "InstancePatch with op 'Updated' must have props");
        const isSuccess = nativeDb.updateInstance(props, { useJsNames: true });
        if (!isSuccess)
          throw new IVaultError(IVaultStatus.BadRequest, `Failed to update instance with id ${props.id}`);
        break;
      }
      case "Deleted": {
        const key = { id: props.id, classFullName: props.className };
        const isSuccess = nativeDb.deleteInstance(key, { useJsNames: true });
        if (!isSuccess)
          throw new IVaultError(IVaultStatus.BadRequest, `Failed to delete instance with id ${props.id}`);
        break;
      }
      default:
        throw new IVaultError(IVaultStatus.BadRequest, `Unknown InstancePatch op '${$meta.op as string}'`);
    }
  }

  /**
   * Determines whether the current transaction can be aborted.
   *
   * This method checks if a transaction is currently in progress and if a specific restore point,
   * identified by `BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME`, exists in the briefcase manager.
   *
   * @returns {boolean} Returns `true` if a transaction is in progress and the required restore point exists; otherwise, returns `false`.
   */
  public canAbort() {
    return this.inProgress() && BriefcaseManager.containsRestorePoint(this._iVault, BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME);
  }

  /**
   * Aborts the current transaction by restoring the iVault to a predefined restore point. This method will
   * automatically discard any unsaved changes before performing the restore.
   *
   * If a restore point is available (as determined by `canAbort()`), this method restores the iVault
   * to the state saved at the restore point named by `BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME`.
   * If no restore point is available, an error is thrown.
   *
   * @returns A promise that resolves when the restore operation is complete.
   * @throws {Error} If there is no restore point to abort to.
   */
  public async abort(): Promise<void> {
    if (this.canAbort()) {
      this._aborting = true;
      try {

        if (this._iVault.txns.hasUnsavedChanges) {
          this._iVault[_nativeDb].abandonChanges();
        }
        await BriefcaseManager.restorePoint(this._iVault, BriefcaseManager.PULL_MERGE_RESTORE_POINT_NAME);
      } finally {
        this._aborting = false;
      }
    } else {
      throw new Error("No restore point to abort to");
    }
  }

  /**
   * Sets the handler to be invoked for rebase operations.
   *
   * @param handler - The {@link RebaseHandler} to handle rebase events.
   */
  public setCustomHandler(handler: RebaseHandler) {
    if (this._customHandler) {
      Logger.logWarning(BackendLoggerCategory.IVaultDb, "Rebase handler already set");
    }
    this._customHandler = handler;
  }

  /**
   * Determines whether rebasing or merging is currently in progress. Same as calling `this.isRebasing || this.isMerging`.
   * @returns {boolean} Returns `true` if this rebase manager is currently rebasing or merging changes; otherwise, `false`.
   */
  public inProgress() {
    return this._iVault[_nativeDb].pullMergeGetStage() !== "None";
  }

  /**
   * Indicates whether the current transaction manager is in the process of aborting a transaction.
   *
   * @returns `true` if the transaction manager is currently aborting; otherwise, `false`.
   */
  public get isAborting(): boolean {
    return this._aborting;
  }

  /**
   * Indicates whether the current transaction manager is in the "Rebasing" stage.
   *
   * This property checks the internal native database's merge stage to determine if a rebase operation is in progress.
   *
   * @returns `true` if the transaction manager is currently rebasing; otherwise, `false`.
   */
  public get isRebasing() {
    return this._iVault[_nativeDb].pullMergeGetStage() === "Rebasing";
  }

  /**
   * Indicates whether the current iVault is in the process of merging changes from a pull operation.
   *
   * @returns `true` if the iVault is currently merging changes; otherwise, `false`.
   */
  public get isMerging() {
    return this._iVault[_nativeDb].pullMergeGetStage() === "Merging";
  }

  /**
   * Attempts to resolve a changeset conflict by invoking registered conflict handlers in sequence.
   *
   * Iterates through the linked list of conflict handlers, passing the provided conflict arguments to each handler.
   * If a handler returns a defined resolution, logs the resolution and returns it immediately.
   * If no handler resolves the conflict, returns `undefined`.
   *
   * @param args - The arguments describing the changeset conflict to resolve.
   * @returns The conflict resolution provided by a handler, or `undefined` if no handler resolves the conflict.
   */
  public onConflict(args: RebaseChangesetConflictArgs): DbConflictResolution | undefined {
    let curr = this._conflictHandlers;
    while (curr) {
      const resolution = curr.handler(args);
      if (resolution !== undefined) {
        Logger.logTrace(BackendLoggerCategory.IVaultDb, `Conflict handler ${curr.id} resolved conflict`);
        return resolution;
      }
      curr = curr.next;
    }
    return undefined
  }

  /**
   * Registers a new conflict handler for rebase changeset conflicts.
   *
   * @param args - An object containing:
   *   - `id`: A unique identifier for the conflict handler.
   *   - `handler`: A function that handles rebase changeset conflicts and returns a `DbConflictResolution` or `undefined`.
   * @throws IVaultError if a conflict handler with the same `id` already exists.
   *
   * @remarks
   * Conflict handlers are used during changeset rebase operations to resolve conflicts.
   * Each handler must have a unique `id`. Attempting to register a handler with a duplicate `id` will result in an error.
   */
  public addConflictHandler(args: { id: string, handler: (args: RebaseChangesetConflictArgs) => DbConflictResolution | undefined }) {
    const idExists = (id: string) => {
      let curr = this._conflictHandlers;
      while (curr) {
        if (curr.id === id)
          return true;
        curr = curr.next;
      }
      return false;
    }
    if (idExists(args.id))
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, `Conflict handler with id ${args.id} already exists`);
    this._conflictHandlers = { ...args, next: this._conflictHandlers };
  }

  /**
   * Removes a conflict handler from the internal linked list by its identifier.
   *
   * @param id - The unique identifier of the conflict handler to remove.
   *
   * If the handler with the specified `id` exists in the list, it will be removed.
   * If no handler with the given `id` is found, the method does nothing.
   */
  public removeConflictHandler(id: string) {
    if (!this._conflictHandlers)
      return;

    if (this._conflictHandlers?.id === id) {
      this._conflictHandlers = this._conflictHandlers.next;
      return;
    }

    let prev = this._conflictHandlers;
    let curr = this._conflictHandlers?.next;
    while (curr) {
      if (curr.id === id) {
        prev.next = curr.next;
        return;
      }
      prev = curr;
      curr = curr.next;
    }
  }
}

/** Manages local changes to a [[BriefcaseDb]] via [Txns]($docs/learning/InteractiveEditing.md)
 * @public @preview
 */
export class TxnManager {
  /** @internal */
  private _isDisposed = false;
  /** @internal */
  private _withIndirectChangeRefCounter = 0;
  /** @internal */
  public get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** @internal */
  public readonly rebaser: RebaseManager;

  /** @internal */
  constructor(private _iVault: BriefcaseDb) {
    this.rebaser = new RebaseManager(_iVault);
    _iVault.onBeforeClose.addOnce(() => {
      this._isDisposed = true;
      this.rebaser.dispose();
    });
  }

  /** Array of errors from dependency propagation */
  public readonly validationErrors: ValidationError[] = [];

  private get _nativeDb() { return this._iVault[_nativeDb]; }
  private _getElementClass(elClassName: string): typeof Element {
    return this._iVault.getJsClass<typeof Element>(elClassName);
  }
  private _getRelationshipClass(relClassName: string): typeof Relationship {
    return this._iVault.getJsClass<typeof Relationship>(relClassName);
  }

  /** If a -watch file exists for this iVault, update its timestamp so watching processes can be
   * notified that we've modified the briefcase.
   * @internal Used by IVaultDb on push/pull.
   */
  public touchWatchFile(): void {
    // This is an async call. We don't have any reason to await it.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    touch(this._iVault.watchFilePathName, { nocreate: true });
  }

  /** @internal */
  protected _onBeforeOutputsHandled(elClassName: string, elId: Id64String): void {
    // as any necessary to access protected static method on Element and subclasses).
    const iVault = this._iVault;
    const indirectEditTxn = iVault.getIndirectTxn();
    assert(undefined !== indirectEditTxn);
    (this._getElementClass(elClassName) as any).onBeforeOutputsHandledArg({ elId, iVault, indirectEditTxn });
  }
  /** @internal */
  protected _onAllInputsHandled(elClassName: string, elId: Id64String): void {
    // as any necessary to access protected static method on Element and subclasses).
    const iVault = this._iVault;
    const indirectEditTxn = iVault.getIndirectTxn();
    assert(undefined !== indirectEditTxn);
    (this._getElementClass(elClassName) as any).onAllInputsHandledArg({ elId, iVault, indirectEditTxn });
  }
  /** @internal */
  protected _onRootChanged(props: RelationshipProps): void {
    const iVault = this._iVault;
    const indirectEditTxn = iVault.getIndirectTxn();
    assert(undefined !== indirectEditTxn);
    this._getRelationshipClass(props.classFullName).onRootChangedArg({ props, iVault, indirectEditTxn });
  }
  /** @internal */
  protected _onDeletedDependency(props: RelationshipProps): void {
    const iVault = this._iVault;
    const indirectEditTxn = iVault.getIndirectTxn();
    assert(undefined !== indirectEditTxn);
    this._getRelationshipClass(props.classFullName).onDeletedDependencyArg({ props, iVault, indirectEditTxn });
  }
  /** @internal */
  protected _onBeginValidate() { this.validationErrors.length = 0; }

  /** called from native code after validation of a Txn, either from saveChanges or apply changeset.
   * @internal
   */
  protected _onEndValidate() {
    ChangedEntitiesProc.process(this._iVault, this);
    this.onEndValidation.raiseEvent();
    // TODO: if (this.validationErrors.length !== 0) throw new IVaultError(validation ...)
  }

  /** Called by native code during semantic rebase while reversing local changes to create instance patches to be used for reinstating changes.
   * @internal */
  protected _captureInstanceChanges(id: TxnIdString) {
    if (BriefcaseManager.semanticRebaseDataFolderExists(this._iVault, id)) return; // if folder already exists that means we have already captured the changes for this txn during this rebase so we can skip capturing again

    using reader = ChangesetReader.openTxn({ db: this._iVault, txnId: id, rowOptions: { useJsName: true, abbreviateBlobs: false } });
    using pcu = new PartialChangeUnifier(ChangeUnifierCache.createSqliteBackedCache());
    while (reader.step()) {
      pcu.appendFrom(reader);
    }
    BriefcaseManager.storeChangedInstancesForSemanticRebase(this._iVault, id, pcu.instances);
  }

  /** @internal */
  protected _onGeometryChanged(modelProps: ModelGeometryChangesProps[]) {
    this.onGeometryChanged.raiseEvent(modelProps);
    IpcHost.notifyEditingScope(this._iVault, "notifyGeometryChanged", modelProps); // send to frontend
  }

  /** @internal */
  protected _onGeometryGuidsChanged(changes: ModelIdAndGeometryGuid[]): void {
    this.onModelGeometryChanged.raiseEvent(changes);
    IpcHost.notifyTxns(this._iVault, "notifyGeometryGuidsChanged", changes);
  }

  /** @internal */
  protected _onCommit() {
    this.onCommit.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyCommit");
  }

  /** @internal */
  protected _onCommitted() {
    this.touchWatchFile();
    this.onCommitted.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyCommitted", this.hasPendingTxns, Date.now());
  }

  /** @internal */
  protected _onReplayExternalTxns() {
    this.onReplayExternalTxns.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyReplayExternalTxns");
  }

  /** @internal */
  protected _onReplayedExternalTxns() {
    this.onReplayedExternalTxns.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyReplayedExternalTxns");
  }

  /** @internal */
  protected _onChangesApplied() {
    // Should only clear instance caches, not all caches
    this._iVault.clearCaches({ instanceCachesOnly: true });
    ChangedEntitiesProc.process(this._iVault, this);
    this.onChangesApplied.raiseEvent();
    IpcHost.notifyTxns(this._iVault, "notifyChangesApplied");
  }

  /** @internal */
  protected _onBeforeUndoRedo(isUndo: boolean) {
    this.onBeforeUndoRedo.raiseEvent(isUndo);
    IpcHost.notifyTxns(this._iVault, "notifyBeforeUndoRedo", isUndo);
  }

  /** @internal */
  protected _onAfterUndoRedo(isUndo: boolean) {
    this.touchWatchFile();
    this.onAfterUndoRedo.raiseEvent(isUndo);
    IpcHost.notifyTxns(this._iVault, "notifyAfterUndoRedo", isUndo);
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public _onChangesPushed(changeset: ChangesetIndexAndId) {
    this.touchWatchFile();
    this.onChangesPushed.raiseEvent(changeset);
    IpcHost.notifyTxns(this._iVault, "notifyPushedChanges", changeset);
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public _onChangesPulled(changeset: ChangesetIndexAndId) {
    this.touchWatchFile();
    this.onChangesPulled.raiseEvent(changeset);
    IpcHost.notifyTxns(this._iVault, "notifyPulledChanges", changeset);
  }

  private _onRebaseLocalTxnConflict(internalArg: DbRebaseChangesetConflictArgs): DbConflictResolution {
    const args = new RebaseChangesetConflictArgs(internalArg, this._iVault);

    const getChangeMetaData = () => {
      return {
        parent: this._iVault.changeset,
        txn: args.txn,
        table: args.tableName,
        op: args.opcode,
        cause: args.cause,
        indirect: args.indirect,
        primarykey: args.getPrimaryKeyValues(),
        fkConflictCount: args.cause === "ForeignKey" ? args.getForeignKeyConflicts() : undefined,
      };
    }

    // Default conflict resolution for which custom handler is never called.
    if (args.cause === "Data" && !args.indirect) {
      if (args.tableName === "be_Prop") {
        if (args.getValueText(0, "Old") === "dm_Db" && args.getValueText(1, "Old") === "localDbInfo") {
          return DbConflictResolution.Skip;
        }
      }
      if (args.tableName.startsWith("dm_")) {
        return DbConflictResolution.Skip;
      }
    }

    if (args.cause === "Conflict") {
      if (args.tableName.startsWith("dm_")) {
        return DbConflictResolution.Skip;
      }
    }

    try {
      const resolution = this.rebaser.onConflict(args);
      if (resolution !== undefined)
        return resolution;
    } catch (err) {
      const msg = `Rebase failed. Custom conflict handler should not throw exception. Aborting txn. ${SzewecError.getErrorMessage(err)}`;
      Logger.logError(BackendLoggerCategory.IVaultDb, msg, getChangeMetaData());
      args.setLastError(msg);
      return DbConflictResolution.Abort;
    }

    if (args.cause === "Data" && !args.indirect) {
      Logger.logInfo(BackendLoggerCategory.IVaultDb, "UPDATE/DELETE before value do not match with one in db or CASCADE action was triggered. Local change will replace existing.", getChangeMetaData());
      return DbConflictResolution.Replace;
    }

    if (args.cause === "Conflict") {
      const msg = "PRIMARY KEY insert conflict. Aborting rebase.";
      Logger.logError(BackendLoggerCategory.IVaultDb, msg, getChangeMetaData());
      args.setLastError(msg);
      return DbConflictResolution.Abort;
    }

    if (args.cause === "ForeignKey") {
      const msg = `Foreign key conflicts in ChangeSet. Aborting rebase.`;
      Logger.logInfo(BackendLoggerCategory.IVaultDb, msg, getChangeMetaData());
      args.setLastError(msg);
      return DbConflictResolution.Abort;
    }

    if (args.cause === "NotFound") {
      Logger.logInfo(BackendLoggerCategory.IVaultDb, "PRIMARY KEY not found. Skipping local change.", getChangeMetaData());
      return DbConflictResolution.Skip;
    }

    if (args.cause === "Constraint") {
      Logger.logInfo(BackendLoggerCategory.IVaultDb, "Constraint violation detected. Generally caused by db constraints like UNIQUE index. Skipping local change.", getChangeMetaData());
      return DbConflictResolution.Skip;
    }

    return DbConflictResolution.Replace;
  }


  /**
   * @alpha
   * Retrieves the txn properties for a given txn ID.
   *
   * @param id - The unique identifier of the transaction.
   * @returns The properties of the transaction if found; otherwise, `undefined`.
   */
  public getTxnProps(id: TxnIdString): TxnProps | undefined {
    return this._iVault[_nativeDb].getTxnProps(id);
  }

  /**
   * @alpha
   * Iterates over all transactions in the sequence, yielding each transaction's properties.
   *
   * @yields {TxnProps} The properties of each transaction in the sequence.
   */
  public *queryTxns(): Generator<TxnProps> {
    let txn = this.getTxnProps(this.queryFirstTxnId());
    while (txn) {
      yield txn;
      txn = txn.nextId ? this.getTxnProps(txn.nextId) : undefined;
    }
  }

  /**
   * @alpha
   * Retrieves the properties of the last saved txn via `IVaultDb.saveChanges()`, if available.
   *
   * @returns The properties of the last saved txn, or `undefined` if none exist.
   */
  public getLastSavedTxnProps(): TxnProps | undefined {
    return this.getTxnProps(this.queryPreviousTxnId(this.getCurrentTxnId()));
  }

  /** Dependency handlers may call method this to report a validation error.
   * @param error The error. If error.fatal === true, the transaction will cancel rather than commit.
   */
  public reportError(error: ValidationError) {
    this.validationErrors.push(error);
    this._nativeDb.logTxnError(error.fatal);
  }

  /** Determine whether any fatal validation errors have occurred during dependency propagation.  */
  public get hasFatalError(): boolean { return this._nativeDb.hasFatalTxnError(); }

  /** @internal */
  public readonly onEndValidation = new BeEvent<() => void>();

  /** Called after validation completes from [[IVaultDb.saveChanges]].
   * The argument to the event holds the list of elements that were inserted, updated, and deleted.
   * @note If there are many changed elements in a single Txn, the notifications are sent in batches so this event *may be called multiple times* per Txn.
   */
  public readonly onElementsChanged = new BeEvent<(changes: TxnChangedEntities) => void>();

  /** Called after validation completes from [[IVaultDb.saveChanges]].
   * The argument to the event holds the list of models that were inserted, updated, and deleted.
   * @note If there are many changed models in a single Txn, the notifications are sent in batches so this event *may be called multiple times* per Txn.
   */
  public readonly onModelsChanged = new BeEvent<(changes: TxnChangedEntities) => void>();

  /** Event raised after the geometry within one or more [[GeometricModel]]s is modified by applying a changeset or validation of a transaction.
   * A model's geometry can change as a result of:
   *  - Insertion or deletion of a geometric element within the model; or
   *  - Modification of an existing element's geometric properties; or
   *  - An explicit request to flag it as changed via [[IVaultDb.Models.updateModel]].
   */
  public readonly onModelGeometryChanged = new BeEvent<(changes: ReadonlyArray<ModelIdAndGeometryGuid>) => void>();

  public readonly onGeometryChanged = new BeEvent<(models: ModelGeometryChangesProps[]) => void>();
  /** Event raised before a commit operation is performed. Initiated by a call to [[IVaultDb.saveChanges]], unless there are no changes to save. */
  public readonly onCommit = new BeEvent<() => void>();
  /** Event raised after a commit operation has been performed. Initiated by a call to [[IVaultDb.saveChanges]], even if there were no changes to save. */
  public readonly onCommitted = new BeEvent<() => void>();
  /** Event raised after a ChangeSet has been applied to this briefcase */
  public readonly onChangesApplied = new BeEvent<() => void>();
  /** Event raised before an undo/redo operation is performed. */
  public readonly onBeforeUndoRedo = new BeEvent<(isUndo: boolean) => void>();
  /** Event raised after an undo/redo operation has been performed.
   * @param _action The action that was performed.
   */
  public readonly onAfterUndoRedo = new BeEvent<(isUndo: boolean) => void>();
  /** Event raised for a read-only briefcase that was opened with the `watchForChanges` flag enabled when changes made by another connection are applied to the briefcase.
   * @see [[onReplayedExternalTxns]] for the event raised after all such changes have been applied.
   */
  public readonly onReplayExternalTxns = new BeEvent<() => void>();
  /** Event raised for a read-only briefcase that was opened with the `watchForChanges` flag enabled when changes made by another connection are applied to the briefcase.
   * @see [[onReplayExternalTxns]] for the event raised before the changes are applied.
   */
  public readonly onReplayedExternalTxns = new BeEvent<() => void>();

  /** Event raised after changes are pulled from iVaultHub.
   * @see [[BriefcaseDb.pullChanges]].
   */
  public readonly onChangesPulled = new BeEvent<(parentChangeset: ChangesetIndexAndId) => void>();

  /** Event raised after changes are pushed to iVaultHub.
   * @see [[BriefcaseDb.pushChanges]].
   */
  public readonly onChangesPushed = new BeEvent<(parentChangeset: ChangesetIndexAndId) => void>();

  /**
   * if handler is set and it does not return undefined then default handler will not be called
   * @internal
   * */
  public appCustomConflictHandler?: (args: DbRebaseChangesetConflictArgs) => DbConflictResolution | undefined;

  /**
   * Restart the current TxnManager session. This causes all Txns in the current session to no longer be undoable (as if the file was closed
   * and reopened.)
   * @note This can be quite disconcerting to the user expecting to be able to undo previously made changes. It should only be used
   * under extreme circumstances where damage to the file or session could happen if the currently committed are reversed. Use sparingly and with care.
   * Probably a good idea to alert the user it happened.
   */
  public restartSession() {
    this._nativeDb.restartTxnSession();
  }

  /** Determine whether current txn is propagating indirect changes or not. */
  public get isIndirectChanges(): boolean { return this.getMode() === "indirect" }

  /** Determine if there are currently any reversible (undoable) changes from this editing session. */
  public get isUndoPossible(): boolean { return this._nativeDb.isUndoPossible(); }

  /** Determine if there are currently any reinstatable (redoable) changes */
  public get isRedoPossible(): boolean { return this._nativeDb.isRedoPossible(); }

  /** Get the description of the operation that would be reversed by calling reverseTxns(1).
   * This is useful for showing the operation that would be undone, for example in a menu.
   */
  public getUndoString(): string { return this._nativeDb.getUndoString(); }

  /** Get a description of the operation that would be reinstated by calling reinstateTxn.
   * This is useful for showing the operation that would be redone, in a pull-down menu for example.
   */
  public getRedoString(): string { return this._nativeDb.getRedoString(); }

  /** Begin a new multi-Txn operation. This can be used to cause a series of Txns that would normally
   * be considered separate actions for undo to be grouped into a single undoable operation. This means that when reverseTxns(1) is called,
   * the entire group of changes are undone together. Multi-Txn operations can be nested and until the outermost operation is closed
   * all changes constitute a single operation.
   * @note This method must always be paired with a call to endMultiTxnAction.
   */
  public beginMultiTxnOperation(): DbResult { return this._nativeDb.beginMultiTxnOperation(); }

  /** End a multi-Txn operation */
  public endMultiTxnOperation(): DbResult { return this._nativeDb.endMultiTxnOperation(); }

  /** Return the depth of the multi-Txn stack. Generally for diagnostic use only. */
  public getMultiTxnOperationDepth(): number { return this._nativeDb.getMultiTxnOperationDepth(); }

  /** Reverse (undo) the most recent operation(s) to this IVaultDb.
   * @note Consider using [[reverseTxnsAsync]] instead.
   * @param numOperations the number of operations to reverse. If this is greater than 1, the entire set of operations will
   *  be reinstated together when/if ReinstateTxn is called.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @note The term "operation" is used rather than Txn, since multiple Txns can be grouped together via [[beginMultiTxnOperation]]. So,
   * even if numOperations is 1, multiple Txns may be reversed if they were grouped together when they were made.
   * @note If numOperations is too large only the operations are reversible are reversed.
   */
  public reverseTxns(numOperations: number): IVaultStatus {
    if (this._nativeDb.hasUnsavedChanges())
      this._nativeDb.abandonChanges();
    return this._nativeDb.reverseTxns(numOperations);
  }

  /** Reverse the most recent operation.
   * @note Consider using [[reverseSingleTxnAsync]] instead.
   */
  public reverseSingleTxn(): IVaultStatus {
    return this.reverseTxns(1);
  }

  /** Reverse all changes back to the beginning of the session.
   * @note Consider using [[reverseAllTxnsAsync]] instead.
   */
  public reverseAll(): IVaultStatus {
    return this._nativeDb.reverseAll();
  }

  /** Reverse all changes back to a previously saved TxnId.
   * @note Consider using [[reverseToTxnAsync]] instead.
   * @param txnId a TxnId obtained from a previous call to GetCurrentTxnId.
   * @returns Success if the transactions were reversed, error status otherwise.
   * @see  [[getCurrentTxnId]] [[cancelTo]]
   */
  public reverseTo(txnId: TxnIdString): IVaultStatus {
    return this._nativeDb.reverseTo(txnId);
  }

  /** Reverse and then cancel (make non-reinstatable) all changes back to a previous TxnId.
   * @note Consider using [[cancelToTxnAsync]] instead.
   * @param txnId a TxnId obtained from a previous call to [[getCurrentTxnId]]
   * @returns Success if the transactions were reversed and cleared, error status otherwise.
   */
  public cancelTo(txnId: TxnIdString): IVaultStatus {
    return this._nativeDb.cancelTo(txnId);
  }

  /** Reverse (undo) the most recent operation(s) to this IVaultDb. By default, this method also
   * abandons the locks that were acquired for those operations.
   * @beta
   * @note This method will also abandon locks associated with any later, reversed Txns, if they have not
   * already been abandoned. For example, if a call to [[reverseTxns]] reverses Txn 2 without abandoning
   * its locks, and then this method is called to reverse Txn 1, it will abandon the locks associated
   * with _both_ Txn 1 and Txn 2.
   * @note If you do not want to abandon any locks, set [ReverseTxnArgs.retainLocks]($common) to true.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @note The term "operation" is used rather than Txn, since multiple Txns can be grouped together via [[beginMultiTxnOperation]]. So,
   * even if numOperations is 1, multiple Txns may be reversed if they were grouped together when they were made.
   * @note If numOperations is too large only the operations are reversible are reversed.
   * @param numOperations the number of operations to reverse. If this is greater than 1, the entire set of operations will
   *  be reinstated together when/if ReinstateTxn is called.
   * @param args Optional arguments to control the behavior of the reverse operation, such as whether to retain locks.
   * @returns A Promise that resolves to success if the transactions were reversed, or rejects with an IVaultError otherwise.
   */
  public async reverseTxnsAsync(numOperations: number, args?: ReverseTxnArgs): Promise<void> {
    await this.withLockAbandonment(args, () => this._nativeDb.reverseTxns(numOperations));
  }

  /** Reverse (undo) the most recent operation to this IVaultDb. By default, this method also
   * abandons the locks that were acquired for that operation.
   * @beta
   * @note This method will also abandon locks associated with any later, reversed Txns, if they have not
   * already been abandoned. For example, if a call to [[reverseTxns]] reverses Txn 2 without abandoning
   * its locks, and then this method is called to reverse Txn 1, it will abandon the locks associated
   * with _both_ Txn 1 and Txn 2.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @note The term "operation" is used rather than Txn, since multiple Txns can be grouped together via [[beginMultiTxnOperation]]. So,
   * even though this method reverses only one operation, multiple Txns may be reversed if they were grouped together when they were made.
   * @note If there are no reversible operations, this method does nothing and returns Success.
   * @param args Optional arguments to control the behavior of the reverse operation, such as whether to retain locks.
   * @returns A Promise that resolves to success if the transactions were reversed, or rejects with an IVaultError otherwise.
   */
  public async reverseSingleTxnAsync(args?: ReverseTxnArgs): Promise<void> {
    await this.reverseTxnsAsync(1, args);
  }

  /** Reverse (undo) all operations back to the beginning of the session. By default, this method also
   * abandons the locks that were acquired for those operations.
   * @beta
   * @note This method will also abandon locks associated with any later, reversed Txns, if they have not
   * already been abandoned. For example, if a call to [[reverseTxns]] reverses Txn 2 without abandoning
   * its locks, and then this method is called to reverse Txn 1, it will abandon the locks associated
   * with _both_ Txn 1 and Txn 2.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @note If there are no reversible operations, this method does nothing and returns Success.
   * @param args Optional arguments to control the behavior of the reverse operation, such as whether to retain locks.
   * @returns A Promise that resolves to success if the transactions were reversed, or rejects with an IVaultError otherwise.
   */
  public async reverseAllTxnsAsync(args?: ReverseTxnArgs): Promise<void> {
    await this.withLockAbandonment(args, () => this._nativeDb.reverseAll());
  }

  /** Reverse (undo) all operations back to a previously saved TxnId. By default, this method also
   * abandons the locks that were acquired for those operations.
   * @beta
   * @note This method will also abandon locks associated with any later, reversed Txns, if they have not
   * already been abandoned. For example, if a call to [[reverseTxns]] reverses Txn 2 without abandoning
   * its locks, and then this method is called to reverse Txn 1, it will abandon the locks associated
   * with _both_ Txn 1 and Txn 2.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @param txnId a TxnId obtained from a previous call to GetCurrentTxnId.
   * @param args Optional arguments to control the behavior of the reverse operation, such as whether to abandon locks.
   * @returns A Promise that resolves to success if the transactions were reversed, or rejects with an IVaultError otherwise.
   * @see  [[getCurrentTxnId]] [[cancelTo]]
   */
  public async reverseToTxnAsync(txnId: TxnIdString, args?: ReverseTxnArgs): Promise<void> {
    await this.withLockAbandonment(args, () => this._nativeDb.reverseTo(txnId));
  }

  /** Reverse and then cancel (make non-reinstatable) all operations back to a previous TxnId. By default, this
   * method also abandons the locks that were acquired for those operations.
   * @beta
   * @note This method will also abandon locks associated with any later, reversed Txns, if they have not
   * already been abandoned. For example, if a call to [[reverseTxns]] reverses Txn 2 without abandoning
   * its locks, and then this method is called to reverse Txn 1, it will abandon the locks associated
   * with _both_ Txn 1 and Txn 2.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @param txnId a TxnId obtained from a previous call to [[getCurrentTxnId]]
   * @param args Optional arguments to control the behavior of the reverse operation, such as whether to abandon locks.
   * @returns A promise that resolves to success if the transactions were reversed and cleared, or rejects with an IVaultError otherwise.
   */
  public async cancelToTxnAsync(txnId: TxnIdString, args?: ReverseTxnArgs): Promise<void> {
    // First reverse and abandon locks. Only cancel if that succeeds.
    // This is important because the locks would become unabandonable if we canceled first and
    // _then_ the abandonment failed. We expect the call to cancelTo to return "NothingToUndo",
    // but that's ok - it will still clear the already-reversed txns.
    await this.withLockAbandonment(args, () => this._nativeDb.reverseTo(txnId));
    const status = this._nativeDb.cancelTo(txnId);
    if (status !== IVaultStatus.Success && status !== IVaultStatus.NothingToUndo)
      throw new IVaultError(status, IVaultError.getErrorKey(status));
    this._iVault.locks.clearTxnLockRecords(txnId);
  }

  private async withLockAbandonment(args: ReverseTxnArgs | undefined, doReverseCallback: () => IVaultStatus): Promise<void> {
    const result = doReverseCallback();
    if (result === IVaultStatus.Success) {
      if (!args?.retainLocks) {
        // Abandon locks for the earliest txn, which abandons locks for the later ones, too.
        await this._iVault.locks.abandonLocksForReversedTxn(this.getCurrentTxnId());
      }
    } else {
      throw new IVaultError(result, IVaultError.getErrorKey(result));
    }
  }

  /** Reinstate the most recently reversed transaction. Since at any time multiple transactions can be reversed, it
   * may take multiple calls to this method to reinstate all reversed operations.
   * @returns Success if a reversed transaction was reinstated, error status otherwise.
   * @note If there are any outstanding uncommitted changes, they are canceled before the Txn is reinstated.
   * @note This method will return [[IVaultStatus.LockNotHeld]] and will not reinstate the Txn if the locks
   * originally acquired by the Txn have been abandoned. Use [[reinstateTxnAsync]] to re-acquire the locks
   * and reinstate the Txn in a single operation.
   */
  public reinstateTxn(): IVaultStatus {
    // Verify that the locks required by this txn have not been abandoned.
    // If so, this method has no way to re-acquire them because it is synchronous. This
    // is basically a developer error, mixing reverseTxnAsync with reinstateTxn (non-Async).
    const reinstateRange: { firstTxnId: TxnIdString, lastTxnId: TxnIdString } = this._nativeDb.getNextReinstateTxnRange();
    if (
      this.isTxnIdValid(reinstateRange.firstTxnId) &&
      !this._iVault.locks.holdsNecessaryLocksForReinstatingTxn(this.queryPreviousTxnId(reinstateRange.lastTxnId))
    ) {
      return IVaultStatus.LockNotHeld;
    }

    return this._iVault.reinstateTxn();
  }

  /** Reinstate the most recently reversed transaction. This method will first attempt
   * to re-acquire the required locks, if they were abandoned after the operation was reversed.
   * Since at any time multiple transactions can be reversed, it may take multiple calls to this
   * method to reinstate all reversed operations.
   * @beta
   * @note If there are any outstanding unsaved changes, they are canceled before the Txn is reinstated. Unless
   * [ReinstateTxnArgs.retainLocks]($common) is true, the locks associated with the unsaved changes are also abandoned.
   * @param args Optional arguments to control the behavior of the reinstate operation, such as whether to retain
   * locks when abandoning unsaved changes.
   * @returns A Promise that resolves to success if a reversed transaction was reinstated, or rejects with an IVaultError otherwise.
   */
  public async reinstateTxnAsync(args?: ReinstateTxnArgs): Promise<void> {
    // We must abandon any unsaved changes here because it will be too late
    // when reinstateTxn does it.
    if (this.hasUnsavedChanges) {
      this._iVault.clearCaches({ instanceCachesOnly: true });
      this._iVault[_nativeDb].abandonChanges();
    }

    if (!args?.retainLocks) {
      await this._iVault.locks.abandonLocksForCurrentUnsavedTxn();
    }

    const reinstateRange: { firstTxnId: TxnIdString, lastTxnId: TxnIdString } = this._nativeDb.getNextReinstateTxnRange();
    if (!this.isTxnIdValid(reinstateRange.firstTxnId)) {
      throw new IVaultError(IVaultStatus.NothingToRedo, IVaultError.getErrorKey(IVaultStatus.NothingToRedo));
    }

    // Reacquire locks for the latest txn in the range, which will reacquire locks for all earlier txns, too.
    await this._iVault.locks.acquireLocksForReinstatingTxn(this.queryPreviousTxnId(reinstateRange.lastTxnId));

    const status = this.reinstateTxn();
    if (status !== IVaultStatus.Success) {
      throw new IVaultError(status, IVaultError.getErrorKey(status));
    }
  }

  /** Get the Id of the first transaction, if any.
   */
  public queryFirstTxnId(): TxnIdString { return this._nativeDb.queryFirstTxnId(); }

  /** Get the successor of the specified TxnId */
  public queryNextTxnId(txnId: TxnIdString): TxnIdString { return this._nativeDb.queryNextTxnId(txnId); }

  /** Get the predecessor of the specified TxnId */
  public queryPreviousTxnId(txnId: TxnIdString): TxnIdString { return this._nativeDb.queryPreviousTxnId(txnId); }

  /** Get the Id of the current (tip) transaction.  */
  public getCurrentTxnId(): TxnIdString { return this._nativeDb.getCurrentTxnId(); }

  /**
   * @alpha
   * Get the Id of the current session.
   */
  public getCurrentSessionId(): number { return this._nativeDb.currentTxnSessionId(); }

  /** Get the description that was supplied when the specified transaction was saved. */
  public getTxnDescription(txnId: TxnIdString): string { return this._nativeDb.getTxnDescription(txnId); }

  /** Test if a TxnId is valid */
  public isTxnIdValid(txnId: TxnIdString): boolean { return this._nativeDb.isTxnIdValid(txnId); }

  /** Query if there are any pending Txns in this IVaultDb that are waiting to be pushed.
   * @see [[IVaultDb.pushChanges]]
   */
  public get hasPendingTxns(): boolean { return this._nativeDb.hasPendingTxns(); }

  /**
   * Query if there are any changes in memory that have yet to be saved to the IVaultDb.
   * @see [[IVaultDb.saveChanges]]
   */
  public get hasUnsavedChanges(): boolean { return this._nativeDb.hasUnsavedChanges(); }

  /**
   * @alpha
   * Query if there are any pending schema changes in this IVaultDb.
   */
  public get hasPendingSchemaChanges(): boolean { return this._nativeDb.hasPendingSchemaChanges(); }

  /**
   * Query if there are changes in memory that have not been saved to the iVaultDb or if there are Txns that are waiting to be pushed.
   * @see [[IVaultDb.saveChanges]]
   * @see [[IVaultDb.pushChanges]]
   */
  public get hasLocalChanges(): boolean { return this.hasUnsavedChanges || this.hasPendingTxns; }

  /** Destroy the record of all local changes that have yet to be saved and/or pushed.
   * This permanently eradicates your changes - use with caution!
   * Typically, callers will want to subsequently use [[LockControl.abandonAllLocks]].
   * After calling this function, [[hasLocalChanges]], [[hasPendingTxns]], and [[hasUnsavedChanges]] will all be `false`.
   */
  public deleteAllTxns(): void {
    this._nativeDb.deleteAllTxns();
  }

  /** Obtain a list of the DM instances that have been changed locally by the [[BriefcaseDb]] associated with this `TxnManager` and have not yet been pushed to the iVault.
   * @beta
  */
  public queryLocalChanges(args?: QueryLocalChangesArgs): Iterable<ChangeInstanceKey> {
    if (!args) {
      args = { includedClasses: [], includeUnsavedChanges: false };
    }
    return this._nativeDb.getLocalChanges(args.includedClasses ?? [], args.includeUnsavedChanges ?? false);
  }

  /** Query the number of bytes of memory currently allocated by SQLite to keep track of
   * changes to the iVault, for debugging/diagnostic purposes, as reported by [sqlite3session_memory_used](https://www.sqlite.org/session/sqlite3session_memory_used.html).
   */
  public getChangeTrackingMemoryUsed(): number {
    return this._iVault[_nativeDb].getChangeTrackingMemoryUsed();
  }

  /**
   * @alpha
   * Get the current transaction mode.
   * @returns The current transaction mode, either "direct" or "indirect".
   */
  public getMode(): TxnMode {
    return this._nativeDb.getTxnMode();
  }

  /**
   * @alpha
   * Execute a series of changes in an indirect transaction.
   * @param callback The function containing the changes to make.
   */
  public withIndirectTxnMode(callback: () => void): void {
    if (this._withIndirectChangeRefCounter === 0) {
      this._nativeDb.setTxnMode("indirect");
    }
    this._withIndirectChangeRefCounter++;
    try {
      callback();
    } finally {
      this._withIndirectChangeRefCounter--;
      if (this._withIndirectChangeRefCounter === 0) {
        this._nativeDb.setTxnMode("direct");
      }
    }
  }

  /**
   * @alpha
   * Execute a series of changes in an indirect transaction.
   * @param callback The function containing the changes to make.
   */
  public async withIndirectTxnModeAsync(callback: () => Promise<void>): Promise<void> {
    if (this._withIndirectChangeRefCounter === 0) {
      this._nativeDb.setTxnMode("indirect");
    }
    this._withIndirectChangeRefCounter++;
    try {
      await callback();
    } finally {
      this._withIndirectChangeRefCounter--;
      if (this._withIndirectChangeRefCounter === 0) {
        this._nativeDb.setTxnMode("direct");
      }
    }
  }
}

/**
 * Interface for handling rebase operations on transactions.
 * @alpha
 */
export interface RebaseHandler {
  /**
   * Determine whether a transaction should be reinstated during a rebase operation.
   * @param txn The transaction to check.
   *
   * @alpha
   */
  shouldReinstate(txn: TxnProps): boolean;
  /**
   * Recompute the changes for a given transaction.
   * @param txn The transaction to recompute.
   *
   * @alpha
   */
  recompute(txn: TxnProps): Promise<void>;
  /**
   * Called when the owning [[RebaseManager]] is disposed (e.g. when the iVault is closed).
   * Override this method to unsubscribe from events or release resources held by this handler.
   *
   * @alpha
   */
  dispose?(): void;
}
