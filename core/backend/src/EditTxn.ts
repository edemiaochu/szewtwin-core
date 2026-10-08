/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module iVaults
 */

import { DbResult, Id64, Id64Arg, Id64Array, Id64Set, Id64String, IVaultStatus, SZEWTwinError, OpenMode } from "@szewtwin/core-szewec";
import { EcefLocation, EcefLocationProps, EditTxnError, ElementAspectProps, ElementProps, FilePropertyProps, IVaultError, ModelProps, RelationshipProps, SaveChangesArgs } from "@szewtwin/core-common";
import { Range3d, Range3dProps } from "@szewtwin/core-geometry";
import type { CloudSqlite } from "./CloudSqlite";
import type { ImplicitWriteEnforcement } from "./IVaultHost";
import type { IVaultDb, InsertElementOptions, UpdateModelOptions } from "./IVaultDb";
import type { SettingsContainer } from "./workspace/Settings";
import { _activeTxn, _cache, _instanceKeyCache, _nativeDb } from "./internal/Symbols";

/** Options for bulk deleting elements from an iVaultDb.
 * @beta
 */
export interface BulkDeleteElementsArgs {
  /**
   * Skips pre-deletion **NO ACTION** foreign key constraint validation checks, which may improve performance for large deletions.
   * This will improve performance, but if the user supplies elements which have FK constraint violations, it will result in the delete failing and an eventual rollback.
   */
  skipFKConstraintValidations?: boolean;
}

/**
 * Result of a bulk element delete operation.
 * @beta
 */
export interface BulkDeleteElementsResult {
  /**
   * Overall status of the bulk delete operation.
   * - `Success`: All elements were deleted successfully. `failedIds` will be empty.
   * - `PartialSuccess`: Some elements were deleted, but others failed. `failedIds` contains the ids that could not be deleted.
   * - `DeletionFailed`: The delete operation failed entirely (e.g. due to an FK constraint violation). `failedIds` contains the ids that could not be deleted.
   */
  status: BulkDeleteElementsStatus;
  /**
   * The raw SQLite result code from the underlying SQL DELETE statement.
   * `DbResult.BE_SQLITE_OK` on success; a non-OK code indicates a database-level error such as a constraint violation.
   */
  sqlDeleteStatus: DbResult;
  /**
   * The set of element ids that could not be deleted.
   * Empty when `status` is `Success`. Non-empty when `status` is `PartialSuccess` or `DeletionFailed`.
   */
  failedIds: Id64Set;
}

/**
 * Status of a bulk element delete operation, mirroring the C++ `BulkDeleteStatus` enum.
 * @beta
 */
export enum BulkDeleteElementsStatus {
  /** All supplied elements were deleted successfully. */
  Success = 0,
  /** Some elements were deleted but others could not be, typically due to foreign key constraints on the elements not being deleted. */
  PartialSuccess = 1,
  /** No elements were deleted. This occurs when the SQL DELETE statement itself fails, e.g. due to a FK constraint violation that prevents the entire batch from being processed. */
  DeletionFailed = 2,
}

/**
 * Represents an explicit editing transaction for an iVault.
 *
 * An explicit EditTxn lets callers define a deliberate unit of work by choosing when editing
 * starts (`start`) and how it ends (`end()` / `end("save")` or `end("abandon")`). This avoids mixing
 * unrelated edits into one implicit unit of work and makes save/rollback boundaries explicit.
 *
 * Explicit EditTxn instances must be active before mutating operations are performed, regardless of enforcement level.
 * In other words, explicit transaction behavior is independent of `implicitWriteEnforcement`.
 *
 * @see [EditTxn transaction model and migration guidance]($docs/learning/backend/EditTxn.md)
 *
 * *During indirect changes (commit processing):* Use callback args (`indirectEditTxn`) in callbacks like
 * [[Relationship.onRootChangedArg]] and [[Relationship.onDeletedDependencyArg]] that fire during indirect processing.
 *
 * @beta
 */
export class EditTxn {
  /** Controls how writes through the implicit transaction are handled.
   *
   * This does not relax activation requirements for explicit transactions: explicit EditTxn writes
   * must always come from the active EditTxn.
   *
   * - `allow`: allow implicit writes for backwards compatibility, even while an explicit EditTxn is active.
   * - `log`: allow implicit writes but log `implicit-txn-write-disallowed` errors.
   * - `throw`: reject implicit writes with `implicit-txn-write-disallowed`.
   *
   * This is initialized from [[IVaultHostOptions.implicitWriteEnforcement]] during [[IVaultHost.startup]].
   *
   * Defaults to `allow` for backwards compatibility.
   * @beta
   */
  public static implicitWriteEnforcement: ImplicitWriteEnforcement = "allow";

  /** The iVault this EditTxn may modify. */
  public readonly iVault: IVaultDb;

  /** Default description passed to [[saveChanges]] when saving this transaction. */
  public description: string;

  /** True if this transaction currently owns the iVault write surface. */
  public get isActive(): boolean {
    return this.iVault[_activeTxn] === this;
  }

  public constructor(iVault: IVaultDb, description: string) {
    this.iVault = iVault;
    this.description = description;
  }

  public verifyWriteable(): void {
    // Explicit transactions must always be active before writing.
    if (!this.isActive)
      EditTxnError.throwError("not-active", "EditTxn is not active", this.iVault.key);
  }

  /** Start this EditTxn, making it the active transaction for the iVault.
   * @throws EditTxnError if this EditTxn is already active, another EditTxn is already active, or if unsaved changes are present.
   */
  public start(): void {
    if (this.isActive)
      EditTxnError.throwError("already-active", "This EditTxn is already active", this.iVault.key);

    const activeTxn = this.iVault[_activeTxn];
    if (undefined !== activeTxn)
      EditTxnError.throwError("already-active", "Cannot start EditTxn while another EditTxn is active", this.iVault.key, activeTxn.description);

    if (this.iVault[_nativeDb].hasUnsavedChanges())
      EditTxnError.throwError("unsaved-changes", "Cannot start a new EditTxn with unsaved changes", this.iVault.key);

    this.iVault[_activeTxn] = this;
  }

  /** End this EditTxn, either by saving or abandoning the changes.
   * @param mode Whether to "save" or "abandon" the changes. Defaults to "save".
   * @param args Save changes arguments when saving.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if saving changes fails.
   */
  public end(): void;
  public end(mode: "save" | "abandon", args?: string | SaveChangesArgs): void;
  public end(mode: "save" | "abandon" = "save", args?: string | SaveChangesArgs): void {
    if (!this.isActive)
      EditTxnError.throwError("not-active", "EditTxn is not active", this.iVault.key);

    if (mode === "save") {
      this.saveChanges(args);
    } else {
      this.abandonChanges();
    }
    this.iVault[_activeTxn] = undefined;
  }

  /** Invoked when the owning iVault is closing.
   * The base implementation commits unsaved changes. Subclasses may override to customize how
   * their changes are handled before the iVault closes.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if saving on close fails.
   */
  public onClose(): void {
    if (!this.iVault.isReadonly && this.iVault[_nativeDb].hasUnsavedChanges())
      this.saveChanges();
  }

  /** Abandon database changes while keeping this EditTxn active.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public abandonChanges(): void {
    this.verifyWriteable();
    this.iVault.clearCaches({ instanceCachesOnly: true });
    this.iVault[_nativeDb].abandonChanges();
  }

  /** Save changes with additional arguments.
   * @param args Save changes arguments.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if the iVault is readonly, if indirect changes are active, or if the native save fails.
   */
  public saveChanges(args?: string | SaveChangesArgs): void {
    this.verifyWriteable();
    const iVault = this.iVault;
    if (iVault.openMode === OpenMode.Readonly)
      throw new IVaultError(IVaultStatus.ReadOnly, "IVaultDb was opened read-only");

    if (iVault.isBriefcaseDb() && iVault.txns.isIndirectChanges)
      throw new IVaultError(IVaultStatus.BadRequest, "Cannot save changes while in an indirect change scope");

    args ??= this.description;
    const saveArgs = typeof args === "string" ? { description: args } : args;
    const stat = iVault[_nativeDb].saveChanges(JSON.stringify(saveArgs));
    if (DbResult.BE_SQLITE_ERROR_PropagateChangesFailed === stat)
      throw new IVaultError(stat, "Could not save changes due to propagation failure.");

    if (DbResult.BE_SQLITE_OK !== stat)
      throw new IVaultError(stat, `Could not save changes (${saveArgs.description})`);
  }

  /** Insert a new element into the iVault.
   * @param elProps The properties of the new element.
   * @returns The newly inserted element's Id.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws [[SZEWTwinError]] if insertion fails.
   */
  public insertElement(elProps: ElementProps, options?: InsertElementOptions): Id64String {
    this.verifyWriteable();
    try {
      this.iVault.elements[_cache].delete({
        id: elProps.id,
        federationGuid: elProps.federationGuid,
        code: elProps.code,
      });
      return elProps.id = this.iVault[_nativeDb].insertElement(elProps, options);
    } catch (err: any) {
      err.message = `Error inserting element [${err.message}]`;
      err.metadata = { elProps };
      throw err;
    }
  }

  /** Update an existing element in the iVault.
   * @param elProps The properties to update.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws [[SZEWTwinError]] if update fails.
   */
  public updateElement<T extends ElementProps>(elProps: Partial<T>): void {
    this.verifyWriteable();
    try {
      if (elProps.id) {
        this.iVault.elements[_instanceKeyCache].deleteById(elProps.id);
      } else {
        this.iVault.elements[_instanceKeyCache].delete({
          federationGuid: elProps.federationGuid,
          code: elProps.code,
        });
      }
      this.iVault.elements[_cache].delete({
        id: elProps.id,
        federationGuid: elProps.federationGuid,
        code: elProps.code,
      });
      this.iVault[_nativeDb].updateElement(elProps);
    } catch (err: any) {
      err.message = `Error updating element [${err.message}], id: ${elProps.id}`;
      err.metadata = { elProps };
      throw err;
    }
  }

  /** Delete elements from the iVault.
   * @param ids The Ids of the elements to delete.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws [[SZEWTwinError]] if deletion fails.
   */
  public deleteElement(ids: Id64Arg): void {
    this.verifyWriteable();
    const iVault = this.iVault;
    Id64.toIdSet(ids).forEach((id) => {
      try {
        this.iVault.elements[_cache].delete({ id });
        this.iVault.elements[_instanceKeyCache].deleteById(id);
        iVault[_nativeDb].deleteElement(id);
      } catch (err: any) {
        err.message = `Error deleting element [${err.message}], id: ${id}`;
        err.metadata = { elementId: id };
        throw err;
      }
    });
  }

  /**
   * Delete multiple elements from the iVault.
   * @param ids The ids of the elements to delete. All ids must be well-formed and valid [[Id64String]]s.
   * @param deleteOptions Options for the delete operation.
   * @returns A result object containing information about the deletion operation success and the element ids that failed to delete (if any).
   * @throws [[SZEWTwinError]] if any of the supplied ids are not well-formed/valid [[Id64String]]s.
   * @beta
   */
  public deleteElements(ids: Id64Array, deleteOptions?: BulkDeleteElementsArgs): BulkDeleteElementsResult {
    this.verifyWriteable();
    const invalidIds: Id64Set = new Set<Id64String>();
    for (const id of ids) {
      if (!Id64.isValidId64(id))
        invalidIds.add(id);
    }

    if (invalidIds.size > 0)
      SZEWTwinError.throwError({ message: `Invalid element ids: ${Array.from(invalidIds).join(", ")}`, szewTwinErrorId: { scope: "ivault", key: "invalid-arguments" } });

    const bulkDeletionResult = this.iVault[_nativeDb].deleteElements(ids, deleteOptions);
    const finalResult = { ...bulkDeletionResult, failedIds: Id64.toIdSet(bulkDeletionResult.failedIds) };

    if (finalResult.status === BulkDeleteElementsStatus.DeletionFailed)
      return finalResult;

    for (const id of ids) {
      if (!finalResult.failedIds.has(id)) {
        this.iVault.elements[_cache].delete({ id });
        this.iVault.elements[_instanceKeyCache].deleteById(id);
      }
    }

    return finalResult;
  }

  /** Insert a new aspect into the iVault.
   * @param aspectProps The properties of the new aspect.
   * @returns The newly inserted aspect Id.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if insertion fails.
   */
  public insertAspect(aspectProps: ElementAspectProps): Id64String {
    this.verifyWriteable();
    try {
      return this.iVault[_nativeDb].insertElementAspect(aspectProps);
    } catch (err: any) {
      const error = new IVaultError(err.errorNumber, `Error inserting ElementAspect [${err.message}], class: ${aspectProps.classFullName}`, aspectProps);
      error.cause = err;
      throw error;
    }
  }

  /** Update an existing aspect in the iVault.
   * @param aspectProps The properties of the aspect to update.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if update fails.
   */
  public updateAspect(aspectProps: ElementAspectProps): void {
    this.verifyWriteable();
    try {
      this.iVault[_nativeDb].updateElementAspect(aspectProps);
    } catch (err: any) {
      const error = new IVaultError(err.errorNumber, `Error updating ElementAspect [${err.message}], id: ${aspectProps.id}`, aspectProps);
      error.cause = err;
      throw error;
    }
  }

  /** Delete one or more aspects from the iVault.
   * @param aspectInstanceIds The Ids of the aspects to delete.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if deletion fails.
   */
  public deleteAspect(aspectInstanceIds: Id64Arg): void {
    this.verifyWriteable();
    Id64.toIdSet(aspectInstanceIds).forEach((aspectInstanceId) => {
      try {
        this.iVault[_nativeDb].deleteElementAspect(aspectInstanceId);
      } catch (err: any) {
        const error = new IVaultError(err.errorNumber, `Error deleting ElementAspect [${err.message}], id: ${aspectInstanceId}`);
        error.cause = err;
        throw error;
      }
    });
  }

  /** Delete definition elements from the iVault when they are not referenced.
   * @param definitionElementIds The Ids of the definition elements to attempt to delete.
   * @returns The set of definition elements that were still in use and therefore not deleted.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if usage queries fail.
   */
  public deleteDefinitionElements(definitionElementIds: Id64Array): Id64Set {
    this.verifyWriteable();
    const usageInfo = this.iVault[_nativeDb].queryDefinitionElementUsage(definitionElementIds);
    if (!usageInfo)
      throw new IVaultError(IVaultStatus.BadRequest, "Error querying for DefinitionElement usage");

    const usedIdSet = usageInfo.usedIds ? Id64.toIdSet(usageInfo.usedIds) : new Set<Id64String>();
    const deleteIfUnused = (ids: Id64Array | undefined, used: Id64Set): void => {
      ids?.forEach((id) => {
        if (!used.has(id))
          this.deleteElement(id);
      });
    };

    try {
      this.iVault[_nativeDb].beginPurgeOperation();
      deleteIfUnused(usageInfo.spatialCategoryIds, usedIdSet);
      deleteIfUnused(usageInfo.drawingCategoryIds, usedIdSet);
      deleteIfUnused(usageInfo.viewDefinitionIds, usedIdSet);
      deleteIfUnused(usageInfo.geometryPartIds, usedIdSet);
      deleteIfUnused(usageInfo.lineStyleIds, usedIdSet);
      deleteIfUnused(usageInfo.renderMaterialIds, usedIdSet);
      deleteIfUnused(usageInfo.subCategoryIds, usedIdSet);
      deleteIfUnused(usageInfo.textureIds, usedIdSet);
      deleteIfUnused(usageInfo.displayStyleIds, usedIdSet);
      deleteIfUnused(usageInfo.categorySelectorIds, usedIdSet);
      deleteIfUnused(usageInfo.modelSelectorIds, usedIdSet);
      if (usageInfo.otherDefinitionElementIds)
        this.deleteElement(usageInfo.otherDefinitionElementIds);
    } finally {
      this.iVault[_nativeDb].endPurgeOperation();
    }

    if (usageInfo.viewDefinitionIds) {
      // Recheck view-related definitions after deleting view definitions that may have been their last reference.
      let viewRelatedIds: Id64Array = [];
      if (usageInfo.displayStyleIds)
        viewRelatedIds = viewRelatedIds.concat(usageInfo.displayStyleIds.filter((id) => usedIdSet.has(id)));

      if (usageInfo.categorySelectorIds)
        viewRelatedIds = viewRelatedIds.concat(usageInfo.categorySelectorIds.filter((id) => usedIdSet.has(id)));

      if (usageInfo.modelSelectorIds)
        viewRelatedIds = viewRelatedIds.concat(usageInfo.modelSelectorIds.filter((id) => usedIdSet.has(id)));

      if (viewRelatedIds.length > 0) {
        const viewRelatedUsageInfo = this.iVault[_nativeDb].queryDefinitionElementUsage(viewRelatedIds);
        if (viewRelatedUsageInfo) {
          const usedViewRelatedIdSet: Id64Set = viewRelatedUsageInfo.usedIds ? Id64.toIdSet(viewRelatedUsageInfo.usedIds) : new Set<Id64String>();
          try {
            this.iVault[_nativeDb].beginPurgeOperation();
            deleteIfUnused(viewRelatedUsageInfo.displayStyleIds, usedViewRelatedIdSet);
            deleteIfUnused(viewRelatedUsageInfo.categorySelectorIds, usedViewRelatedIdSet);
            deleteIfUnused(viewRelatedUsageInfo.modelSelectorIds, usedViewRelatedIdSet);
          } finally {
            this.iVault[_nativeDb].endPurgeOperation();
          }

          viewRelatedIds.forEach((id) => {
            if (!usedViewRelatedIdSet.has(id))
              usedIdSet.delete(id);
          });
        }
      }
    }

    return usedIdSet;
  }

  /** Insert a new model into the iVault.
   * @param props The data for the new model.
   * @returns The newly inserted model's Id.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if insertion fails.
   */
  public insertModel(props: ModelProps): Id64String {
    this.verifyWriteable();
    try {
      return props.id = this.iVault[_nativeDb].insertModel(props);
    } catch (err: any) {
      const error = new IVaultError(err.errorNumber, `Error inserting model [${err.message}], class=${props.classFullName}`);
      error.cause = err;
      throw error;
    }
  }

  /** Update an existing model in the iVault.
   * @param props the properties of the model to change
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if update fails.
   */
  public updateModel(props: UpdateModelOptions): void {
    this.verifyWriteable();
    try {
      if (props.id)
        this.iVault.models[_cache].delete(props.id);

      this.iVault[_nativeDb].updateModel(props);
    } catch (err: any) {
      const error = new IVaultError(err.errorNumber, `Error updating model [${err.message}], id: ${props.id}`);
      error.cause = err;
      throw error;
    }
  }

  /** Update the geometry guid of a model.
   * @param modelId The Id of the model to update.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if the update fails.
   */
  public updateGeometryGuid(modelId: Id64String): void {
    this.verifyWriteable();
    this.iVault.models[_cache].delete(modelId);
    const error = this.iVault[_nativeDb].updateModelGeometryGuid(modelId);
    if (error !== IVaultStatus.Success)
      throw new IVaultError(error, `Error updating geometry guid for model ${modelId}`);
  }

  /** Delete models from the iVault.
   * @param ids The Ids of the models to delete.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if deletion fails.
   */
  public deleteModel(ids: Id64Arg): void {
    this.verifyWriteable();
    Id64.toIdSet(ids).forEach((id) => {
      try {
        this.iVault.models[_cache].delete(id);
        this.iVault.models[_instanceKeyCache].deleteById(id);
        this.iVault[_nativeDb].deleteModel(id);
      } catch (err: any) {
        const error = new IVaultError(err.errorNumber, `Error deleting model [${err.message}], id: ${id}`);
        error.cause = err;
        throw error;
      }
    });
  }

  /** Insert a new relationship into the iVault.
   * @param props The properties of the new relationship.
   * @returns The Id of the newly inserted relationship.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if the class is invalid for link-table insertion.
   */
  public insertRelationship(props: RelationshipProps): Id64String {
    this.verifyWriteable();
    if (!this.iVault[_nativeDb].isLinkTableRelationship(props.classFullName.replace(".", ":")))
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, `Class '${props.classFullName}' must be a relationship class and it should be subclass of BisCore:ElementRefersToElements or BisCore:ElementDrivesElement.`);

    return props.id = this.iVault[_nativeDb].insertLinkTableRelationship(props);
  }

  /** Update an existing relationship in the iVault.
   * @param props the properties of the relationship to update.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public updateRelationship(props: RelationshipProps): void {
    this.verifyWriteable();
    this.iVault[_nativeDb].updateLinkTableRelationship(props);
  }

  /** Delete a relationship from the iVault.
   * @param props The properties of the relationship to delete.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public deleteRelationship(props: RelationshipProps): void {
    this.verifyWriteable();
    this.iVault[_nativeDb].deleteLinkTableRelationship(props);
  }

  /** Delete multiple relationships from the iVault.
   * @param props The properties of the relationships to delete.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public deleteRelationships(props: ReadonlyArray<RelationshipProps>): void {
    this.verifyWriteable();
    this.iVault[_nativeDb].deleteLinkTableRelationships(props);
  }


  /** Save a file property to the iVault.
   * @param prop The file property to save.
   * @param strValue String value.
   * @param blobVal Blob value.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public saveFileProperty(prop: FilePropertyProps, strValue: string | undefined, blobVal?: Uint8Array): void {
    this.verifyWriteable();
    const ivault = this.iVault;
    if (ivault.isBriefcaseDb()) {
      if (ivault.txns.isIndirectChanges) {
        throw new IVaultError(IVaultStatus.BadRequest, "Cannot save file property while in an indirect change scope");
      }
    }
    ivault[_nativeDb].saveFileProperty(prop, strValue, blobVal);
  }

  /** Delete a file property from the iVault.
   * @param prop The file property to delete.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public deleteFileProperty(prop: FilePropertyProps): void {
    this.saveFileProperty(prop, undefined, undefined);
  }

  /** Update the project extents of the iVault.
   * @param newExtents The new project extents.
   * @throws EditTxnError if this EditTxn is not active.
   * @throws IVaultError if extents are invalid.
   */
  public updateProjectExtents(newExtents: Range3dProps): void {
    this.verifyWriteable();
    const extents = Range3d.fromJSON(newExtents);
    if (extents.isNull)
      throw new IVaultError(DbResult.BE_SQLITE_ERROR, "Invalid project extents");

    this.iVault.projectExtents = extents;
    this.updateIVaultProps();
  }

  /** Update the ECEF location of the iVault.
   * @param ecef The new ECEF location.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public updateEcefLocation(ecef: EcefLocationProps): void {
    this.verifyWriteable();
    this.iVault.setEcefLocation(new EcefLocation(ecef));
    this.updateIVaultProps();
  }

  /** Update the iVault props in the database from the current in-memory state.
   * @throws EditTxnError if this EditTxn is not active.
   */
  public updateIVaultProps(): void {
    this.verifyWriteable();
    this.iVault[_nativeDb].updateIVaultProps(this.iVault.toJSON());
  }

  private static readonly _settingPropNamespace = "settings";
  private static readonly _viewStoreProperty: FilePropertyProps = { namespace: "szewtwinjs", name: "DefaultViewStore" };

  /** Save a `SettingDictionary` in this iVault.
   * @param name The name for the SettingDictionary. If a dictionary by that name already exists, its value is replaced.
   * @param dict The SettingDictionary object to stringify and save.
   * @throws EditTxnError if this EditTxn is not active.
   * @beta
   */
  public saveSettingDictionary(name: string, dict: SettingsContainer): void {
    this.verifyWriteable();
    this.iVault.withSqliteStatement("REPLACE INTO be_Prop(id,SubId,TxnMode,Namespace,Name,strData) VALUES(0,0,0,?,?,?)", (stmt) => {
      stmt.bindString(1, EditTxn._settingPropNamespace);
      stmt.bindString(2, name);
      stmt.bindString(3, JSON.stringify(dict));
      stmt.stepForWrite();
    });
    this.saveChanges("add settings");
  }

  /** Delete a SettingDictionary from this iVault.
   * @param name The name of the dictionary to delete.
   * @throws EditTxnError if this EditTxn is not active.
   * @beta
   */
  public deleteSettingDictionary(name: string): void {
    this.verifyWriteable();
    this.iVault.withSqliteStatement("DELETE FROM be_Prop WHERE Namespace=? AND Name=?", (stmt) => {
      stmt.bindString(1, EditTxn._settingPropNamespace);
      stmt.bindString(2, name);
      stmt.stepForWrite();
    });
    this.saveChanges("delete settings");
  }

  /** Save a default ViewStore container reference in this iVault.
   * @param arg The cloud container properties for the ViewStore.
   * @throws EditTxnError if this EditTxn is not active.
   * @beta
   */
  public saveDefaultViewStore(arg: CloudSqlite.ContainerProps): void {
    this.verifyWriteable();
    const props = { baseUri: arg.baseUri, containerId: arg.containerId, storageType: arg.storageType }; // sanitize to only known properties
    this.saveFileProperty(EditTxn._viewStoreProperty, JSON.stringify(props));
    this.saveChanges("update default ViewStore");
  }
}

/** Execute a callback within an explicit editing transaction. A new [[EditTxn]] is created, started,
 * and passed to `fn`. If `fn` returns normally (or its returned Promise resolves), the transaction
 * is committed. If `fn` throws (or its returned Promise rejects), the transaction is abandoned —
 * none of the changes made during the callback are saved — and the error is re-thrown.
 *
 * This is the recommended way to perform a scoped unit of work on an iVault. It ensures that
 * edits are committed atomically on success and rolled back on failure, without the caller needing
 * to manage `start` / `end` manually.
 *
 * @param iVault The iVault to edit.
 * @param fn A callback that receives the active [[EditTxn]] and performs edits.
 * @returns The value returned by `fn`.
 * @throws EditTxnError if the transaction cannot be started (e.g. unsaved changes or another EditTxn is active).
 * @throws Re-throws any error thrown by `fn` after abandoning the transaction.
 * @beta
 */
export function withEditTxn<T>(iVault: IVaultDb, fn: (txn: EditTxn) => T): T;
/** Execute a callback within an explicit editing transaction, supplying commit arguments.
 * @param iVault The iVault to edit.
 * @param saveArgs Description or structured arguments passed to [[EditTxn.saveChanges]] on save.
 * @param fn A callback that receives the active [[EditTxn]] and performs edits.
 * @returns The value returned by `fn`.
 * @beta
 */
export function withEditTxn<T>(iVault: IVaultDb, saveArgs: string | SaveChangesArgs, fn: (txn: EditTxn) => T): T;
/** Execute an async callback within an explicit editing transaction.
 * @param iVault The iVault to edit.
 * @param fn An async callback that receives the active [[EditTxn]] and performs edits.
 * @returns A Promise that resolves to the value returned by `fn`.
 * @beta
 */
export function withEditTxn<T>(iVault: IVaultDb, fn: (txn: EditTxn) => Promise<T>): Promise<T>;
/** Execute an async callback within an explicit editing transaction, supplying commit arguments.
 * @param iVault The iVault to edit.
 * @param saveArgs Description or structured arguments passed to [[EditTxn.saveChanges]] on save.
 * @param fn An async callback that receives the active [[EditTxn]] and performs edits.
 * @returns A Promise that resolves to the value returned by `fn`.
 * @beta
 */
export function withEditTxn<T>(iVault: IVaultDb, saveArgs: string | SaveChangesArgs, fn: (txn: EditTxn) => Promise<T>): Promise<T>;
export function withEditTxn<T>(iVault: IVaultDb, saveArgsOrFn: string | SaveChangesArgs | ((txn: EditTxn) => T | Promise<T>), maybeFn?: (txn: EditTxn) => T | Promise<T>): T | Promise<T> {
  const saveArgs = "function" === typeof saveArgsOrFn ? undefined : saveArgsOrFn;
  const fn = "function" === typeof saveArgsOrFn ? saveArgsOrFn : maybeFn;

  if (undefined === fn)
    throw new Error("withEditTxn requires a callback");

  const txn = new EditTxn(iVault, "");
  txn.start();

  try {
    const result = fn(txn);
    if (result instanceof Promise) {
      return result.then((value) => {
        txn.end("save", saveArgs);
        return value;
      }, (err) => {
        if (txn.isActive)
          txn.end("abandon");

        throw err;
      });
    }

    txn.end("save", saveArgs);
    return result;
  } catch (err) {
    if (txn.isActive)
      txn.end("abandon");

    throw err;
  }
}
