/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ChangedElementsDb
 */

import { AccessToken, DbResult, IVaultStatus, OpenMode } from "@szewtwin/core-szewec";
import { ChangeData, ChangedElements, ChangedModels, IVaultError } from "@szewtwin/core-common";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { BriefcaseManager } from "./BriefcaseManager";
import { DMDbOpenMode } from "./DMDb";
import { IVaultDb } from "./IVaultDb";
import { IVaultHost } from "./IVaultHost";
import { IVaultNative } from "./internal/NativePlatform";
import { _hubAccess, _nativeDb } from "./internal/Symbols";

/**
 * Options for processChangesets function
 * @internal
 * */
export interface ProcessChangesetOptions {
  startChangesetId: string;
  endChangesetId: string;
  rulesetId: string;
  filterSpatial?: boolean;
  wantParents?: boolean;
  wantPropertyChecksums?: boolean;
  rulesetDir?: string;
  tempDir?: string;
  wantRelationshipCaching?: boolean;
  relationshipCacheSize?: number;
  wantChunkTraversal?: boolean;
  wantBoundingBoxes?: boolean;
}

/** An ChangedElementsDb file
 * @internal
 */
export class ChangedElementsDb implements Disposable {
  private _nativeDb: IVaultJsNative.ChangedElementsDMDb | undefined;

  constructor() {
    this._nativeDb = new IVaultNative.platform.ChangedElementsDMDb();
  }

  public [Symbol.dispose](): void {
    if (!this._nativeDb)
      return;

    this.closeDb();
    this._nativeDb.dispose();
    this._nativeDb = undefined;
  }

  /** Create a ChangedElementsDb
   * @param pathName The path to the DMDb file to create.
   * @throws [IVaultError]($common) if the operation failed.
   */
  private _createDb(briefcase: IVaultDb, pathName: string): void {
    const status: DbResult = this.nativeDb.createDb(briefcase[_nativeDb], pathName);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to created DMDb");
  }

  /** Open the Changed Elements Db.
   * @param pathName The path to the DMDb file to open
   * @param openMode Open mode
   * @throws [IVaultError]($common) if the operation failed.
   */
  private _openDb(pathName: string, openMode: DMDbOpenMode = DMDbOpenMode.Readonly): void {
    const nativeOpenMode = openMode === DMDbOpenMode.Readonly ? OpenMode.Readonly : OpenMode.ReadWrite;
    const tryUpgrade = openMode === DMDbOpenMode.FileUpgrade;
    const status = this.nativeDb.openDb(pathName, nativeOpenMode, tryUpgrade);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to open DMDb");
  }

  /** Open the Changed Elements Db.
   * @param pathName The path to the DMDb file to open
   * @param openMode Open mode
   * @returns ChangedElementsDb
   */
  public static openDb(pathName: string, openMode: DMDbOpenMode = DMDbOpenMode.Readonly): ChangedElementsDb {
    const cacheDb = new ChangedElementsDb();
    cacheDb._openDb(pathName, openMode);
    return cacheDb;
  }

  /** Create the changed elements cache db
   * @param briefcase IVaultDb to use
   * @param pathName The path to the DMDb file to create.
   * @returns The new cache db
   */
  public static createDb(briefcase: IVaultDb, pathName: string): ChangedElementsDb {
    const cacheDb = new ChangedElementsDb();
    cacheDb._createDb(briefcase, pathName);
    return cacheDb;
  }

  /** Processes a range of changesets and adds it to the changed elements cache
   * @param briefcase iVault briefcase to use
   * @param options Options for processing
   */
  public async processChangesets(accessToken: AccessToken, briefcase: IVaultDb, options: ProcessChangesetOptions): Promise<DbResult> {
    const iVaultId = briefcase.iVaultId;
    const first = (await IVaultHost[_hubAccess].queryChangeset({ iVaultId, changeset: { id: options.startChangesetId }, accessToken })).index;
    const end = (await IVaultHost[_hubAccess].queryChangeset({ iVaultId, changeset: { id: options.endChangesetId }, accessToken })).index;
    const changesets = await IVaultHost[_hubAccess].downloadChangesets({ accessToken, iVaultId, range: { first, end }, targetDir: BriefcaseManager.getChangeSetsPath(iVaultId) });

    // ChangeSets need to be processed from newest to oldest
    changesets.reverse();
    const status = this.nativeDb.processChangesets(
      briefcase[_nativeDb],
      changesets,
      options.rulesetId,
      options.filterSpatial,
      options.wantParents,
      options.wantPropertyChecksums,
      options.rulesetDir,
      options.tempDir,
      options.wantChunkTraversal,
    );
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to process changesets");
    return status;
  }

  /** Processes a range of changesets and adds it to the changed elements cache
   * This call will close the IVaultDb object as it is required for processing and applying changesets
   * @param briefcase iVault briefcase to use
   * @param options options for processing
   */
  public async processChangesetsAndRoll(accessToken: AccessToken, briefcase: IVaultDb, options: ProcessChangesetOptions): Promise<DbResult> {
    const iVaultId = briefcase.iVaultId;
    const first = (await IVaultHost[_hubAccess].queryChangeset({ iVaultId, changeset: { id: options.startChangesetId }, accessToken })).index;
    const end = (await IVaultHost[_hubAccess].queryChangeset({ iVaultId, changeset: { id: options.endChangesetId }, accessToken })).index;
    const changesets = await IVaultHost[_hubAccess].downloadChangesets({ accessToken, iVaultId, range: { first, end }, targetDir: BriefcaseManager.getChangeSetsPath(iVaultId) });

    // ChangeSets need to be processed from newest to oldest
    changesets.reverse();
    // Close briefcase before doing processing and rolling briefcase
    const dbFilename = briefcase.pathName;
    const dbGuid = briefcase.iVaultId;
    briefcase.close();
    // Process changesets
    const status = this.nativeDb.processChangesetsAndRoll(
      dbFilename,
      dbGuid,
      changesets,
      options.rulesetId,
      options.filterSpatial,
      options.wantParents,
      options.wantPropertyChecksums,
      options.rulesetDir,
      options.tempDir,
      options.wantRelationshipCaching,
      options.relationshipCacheSize,
      options.wantChunkTraversal,
      options.wantBoundingBoxes,
    );
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(status, "Failed to process changesets");
    return status;
  }

  /** Get changed elements between two changesets
   * @param startChangesetId Start Changeset Id
   * @param endChangesetId End Changeset Id
   * @returns Returns the changed elements between the changesets provided
   * @throws [IVaultError]($common) if the operation failed.
   */
  public getChangedElements(startChangesetId: string, endChangesetId: string): ChangedElements | undefined {
    const result = this.nativeDb.getChangedElements(startChangesetId, endChangesetId);
    if (result.error || !result.result)
      throw new IVaultError(result.error ? result.error.status : -1, result.error ? result.error.message : "Problem getting changed elements");
    return (result.result.changedElements) as ChangedElements;
  }

  /** Get changed models between two changesets
   * @param startChangesetId Start Changeset Id
   * @param endChangesetId End Changeset Id
   * @returns Returns the changed models between the changesets provided
   * @throws [IVaultError]($common) if the operation failed.
   */
  public getChangedModels(startChangesetId: string, endChangesetId: string): ChangedModels | undefined {
    const result = this.nativeDb.getChangedElements(startChangesetId, endChangesetId);
    if (result.error || !result.result)
      throw new IVaultError(result.error ? result.error.status : -1, result.error ? result.error.message : "Problem getting changed models");
    return (result.result.changedModels) as ChangedModels;
  }

  /** Get changed models between two changesets
   * @param startChangesetId Start Changeset Id
   * @param endChangesetId End Changeset Id
   * @returns Returns the changed models between the changesets provided
   * @throws [IVaultError]($common) if the operation failed.
   */
  public getChangeData(startChangesetId: string, endChangesetId: string): ChangeData | undefined {
    const result = this.nativeDb.getChangedElements(startChangesetId, endChangesetId);
    if (result.error)
      throw new IVaultError(result.error.status, result.error.message);
    return result.result as ChangeData;
  }

  /** Returns true if the Changed Elements Db is open */
  public get isOpen(): boolean { return this.nativeDb.isOpen(); }

  /** Returns true if the cache already contains this changeset Id */
  public isProcessed(changesetId: string): boolean { return this.nativeDb.isProcessed(changesetId); }

  /** Close the Db after saving any uncommitted changes.
   * @throws [IVaultError]($common) if the database is not open.
   */
  public closeDb(): void {
    this.nativeDb.closeDb();
  }

  public cleanCaches(): void {
    this.nativeDb.cleanCaches();
  }

  /** @internal */
  public get nativeDb(): IVaultJsNative.ChangedElementsDMDb {
    if (!this._nativeDb)
      throw new IVaultError(IVaultStatus.BadRequest, "ChangedElementsDb object has already been disposed.");

    return this._nativeDb;
  }
}
