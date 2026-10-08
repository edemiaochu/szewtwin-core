/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */

import { AccessToken, assert, DbResult, GuidString, Id64String, IVaultStatus, Logger } from "@szewtwin/core-szewec";
import { ChangedValueState, ChangeOpCode, ChangesetRange, IVaultError, IVaultVersion } from "@szewtwin/core-common";
import * as path from "path";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BriefcaseManager } from "./BriefcaseManager";
import { DMDb, DMDbOpenMode } from "./DMDb";
import { DMSqlInsertResult, DMSqlStatement, DMSqlWriteStatement } from "./DMSqlStatement";
import { BriefcaseDb, IVaultDb, TokenArg } from "./IVaultDb";
import { IVaultHost, KnownLocations } from "./IVaultHost";
import { IVaultJsFs } from "./IVaultJsFs";
import { _hubAccess, _nativeDb } from "./internal/Symbols";

const loggerCategory: string = BackendLoggerCategory.DMDb;

/** Represents an instance of the `ChangeSummary` DMClass from the `DMDbChange` DMSchema
 * combined with the information from the related `Changeset` instance (from the `IVaultChange` DMSchema) from
 * which the Change Summary was extracted.
 *
 * See also
 * - [ChangeSummaryManager.queryChangeSummary]($backend)
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @beta
 */
export interface ChangeSummary {
  id: Id64String;
  changeSet: { wsgId: GuidString, parentWsgId: GuidString, description: string, pushDate: string, userCreated: GuidString };
}

/** Represents an instance of the `InstanceChange` DMClass from the `DMDbChange` DMSchema
 *
 * See also
 * - [ChangeSummaryManager.queryInstanceChange]($backend)
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @beta
 */
export interface InstanceChange {
  id: Id64String;
  summaryId: Id64String;
  changedInstance: { id: Id64String, className: string };
  opCode: ChangeOpCode;
  isIndirect: boolean;
}

/** Options for [ChangeSummaryManager.createChangeSummaries]($backend).
 * @beta
 */
export interface CreateChangeSummaryArgs extends TokenArg {
  /** Id of the szewTwin that contains the iVault */
  szewTwinId: GuidString;

  /** Id of the iVault */
  iVaultId: GuidString;

  /**
   * Range of change sets
   * - the Change Summary for the first and last versions are also included
   * - if unspecified, all change sets until the latest version are processed
   */
  range: ChangesetRange;
}

/** Class to extract Change Summaries for a briefcase.
 *
 * See also:
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @beta
 */
export class ChangeSummaryManager {
  private static readonly _currentIVaultChangeSchemaVersion = { read: 2, write: 0, minor: 0 };

  /** Determines whether the *Change Cache file* is attached to the specified iVault or not
   * @param iVault iVault to check whether a *Change Cache file* is attached
   * @returns Returns true if the *Change Cache file* is attached to the iVault. false otherwise
   */
  public static isChangeCacheAttached(iVault: IVaultDb): boolean {
    if (!iVault || !iVault.isOpen)
      throw new IVaultError(IVaultStatus.BadRequest, "Briefcase must be open");

    return iVault[_nativeDb].isChangeCacheAttached();
  }

  /** Attaches the *Change Cache file* to the specified iVault if it hasn't been attached yet.
   * A new *Change Cache file* will be created for the iVault if it hasn't existed before.
   * @param iVault iVault to attach the *Change Cache file* file to
   * @throws [IVaultError]($common)
   */
  public static attachChangeCache(iVault: IVaultDb): void {
    if (!iVault || !iVault.isOpen)
      throw new IVaultError(IVaultStatus.BadRequest, "Briefcase must be open");

    if (ChangeSummaryManager.isChangeCacheAttached(iVault))
      return;

    const changesCacheFilePath: string = BriefcaseManager.getChangeCachePathName(iVault.iVaultId);
    if (!IVaultJsFs.existsSync(changesCacheFilePath)) {
      using changeCacheFile = new DMDb();
      ChangeSummaryManager.createChangeCacheFile(iVault, changeCacheFile, changesCacheFilePath);
    }

    assert(IVaultJsFs.existsSync(changesCacheFilePath));
    const res: DbResult = iVault[_nativeDb].attachChangeCache(changesCacheFilePath);
    if (res !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(res, `Failed to attach Change Cache file to ${iVault.pathName}.`);
  }

  /** Detaches the *Change Cache file* from the specified iVault.
   * - note that this method will cause any pending (currently running or queued) queries to fail
   * @param iVault iVault to detach the *Change Cache file* to
   * @throws [IVaultError]($common) in case of errors, e.g. if no *Change Cache file* was attached before.
   */
  public static detachChangeCache(iVault: IVaultDb): void {
    if (!iVault || !iVault.isOpen)
      throw new IVaultError(IVaultStatus.BadRequest, "Briefcase must be open");

    iVault.clearCaches();
    const res: DbResult = iVault[_nativeDb].detachChangeCache();
    if (res !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(res, `Failed to detach Change Cache file from ${iVault.pathName}.`);
  }

  private static openOrCreateChangesFile(iVault: BriefcaseDb): DMDb {
    if (!iVault?.isOpen)
      throw new IVaultError(IVaultStatus.BadArg, "Invalid iVault handle. iVault must be open.");

    const changesFile = new DMDb();
    const changeCacheFilePath = BriefcaseManager.getChangeCachePathName(iVault.iVaultId);
    if (IVaultJsFs.existsSync(changeCacheFilePath)) {
      ChangeSummaryManager.openChangeCacheFile(changesFile, changeCacheFilePath);
      return changesFile;
    }

    try {
      ChangeSummaryManager.createChangeCacheFile(iVault, changesFile, changeCacheFilePath);
      return changesFile;
    } catch (e) {
      // delete cache file again in case it was created but schema import failed
      if (IVaultJsFs.existsSync(changeCacheFilePath))
        IVaultJsFs.removeSync(changeCacheFilePath);

      throw e;
    }
  }

  private static createChangeCacheFile(iVault: IVaultDb, changesFile: DMDb, changeCacheFilePath: string): void {
    if (!iVault?.isOpen)
      throw new IVaultError(IVaultStatus.BadArg, "Invalid iVault object. iVault must be open.");

    const stat: DbResult = iVault[_nativeDb].createChangeCache(changesFile[_nativeDb], changeCacheFilePath);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IVaultError(stat, `Failed to create Change Cache file at "${changeCacheFilePath}".`);

    // Extended information like changeset ids, push dates are persisted in the IVaultChange DMSchema
    changesFile.importSchema(ChangeSummaryManager.getExtendedSchemaPath());
  }

  private static openChangeCacheFile(changesFile: DMDb, changeCacheFilePath: string): void {
    changesFile.openDb(changeCacheFilePath, DMDbOpenMode.FileUpgrade);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const actualSchemaVersion: { read: number, write: number, minor: number } = changesFile.withPreparedStatement("SELECT VersionMajor read,VersionWrite write,VersionMinor minor FROM meta.DMSchemaDef WHERE Name='IVaultChange'", (stmt: DMSqlStatement) => {
      if (stmt.step() !== DbResult.BE_SQLITE_ROW)
        throw new IVaultError(DbResult.BE_SQLITE_ERROR, "File is not a valid Change Cache file.");

      return stmt.getRow();
    });

    if (actualSchemaVersion.read === ChangeSummaryManager._currentIVaultChangeSchemaVersion.read &&
      actualSchemaVersion.write === ChangeSummaryManager._currentIVaultChangeSchemaVersion.write &&
      actualSchemaVersion.minor === ChangeSummaryManager._currentIVaultChangeSchemaVersion.minor)
      return;

    changesFile.importSchema(ChangeSummaryManager.getExtendedSchemaPath());
  }

  private static getExtendedSchemaPath(): string { return path.join(KnownLocations.packageAssetsDir, "IVaultChange.02.00.00.dmschema.xml"); }

  private static isSummaryAlreadyExtracted(changesFile: DMDb, changeSetId: GuidString): Id64String | undefined {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return changesFile.withPreparedStatement("SELECT Summary.Id summaryid FROM ivaultchange.ChangeSet WHERE WsgId=?", (stmt: DMSqlStatement) => {
      stmt.bindString(1, changeSetId);
      if (DbResult.BE_SQLITE_ROW === stmt.step())
        return stmt.getValue(0).getId();

      return undefined;
    });
  }

  private static addExtendedInfos(changesFile: DMDb, changeSummaryId: Id64String, changesetWsgId: GuidString, changesetParentWsgId?: GuidString, description?: string, changesetPushDate?: string, changeSetUserCreated?: GuidString): void {
    changesFile.withCachedWriteStatement("INSERT INTO ivaultchange.ChangeSet(Summary.Id,WsgId,ParentWsgId,Description,PushDate,UserCreated) VALUES(?,?,?,?,?,?)",
      (stmt: DMSqlWriteStatement) => {
        stmt.bindId(1, changeSummaryId);
        stmt.bindString(2, changesetWsgId);
        if (changesetParentWsgId)
          stmt.bindString(3, changesetParentWsgId);

        if (description)
          stmt.bindString(4, description);

        if (changesetPushDate)
          stmt.bindDateTime(5, changesetPushDate);

        if (changeSetUserCreated)
          stmt.bindString(6, changeSetUserCreated);

        const r: DMSqlInsertResult = stmt.stepForInsert();
        if (r.status !== DbResult.BE_SQLITE_DONE)
          throw new IVaultError(r.status, `Failed to add changeset information to extracted change summary ${changeSummaryId}`);
      });
  }

  /** Queries the ChangeSummary for the specified change summary id
   *
   * See also
   * - `DMDbChange.ChangeSummary` DMClass in the *DMDbChange* DMSchema
   * - [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iVault iVault
   * @param changeSummaryId DMInstanceId of the ChangeSummary
   * @returns Returns the requested ChangeSummary object
   * @throws [IVaultError]($common) If change summary does not exist for the specified id, or if the
   * change cache file hasn't been attached, or in case of other errors.
   */
  public static queryChangeSummary(iVault: BriefcaseDb, changeSummaryId: Id64String): ChangeSummary {
    if (!ChangeSummaryManager.isChangeCacheAttached(iVault))
      throw new IVaultError(IVaultStatus.BadArg, "Change Cache file must be attached to iVault.");

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return iVault.withPreparedStatement("SELECT WsgId,ParentWsgId,Description,PushDate,UserCreated FROM dmchange.ivaultchange.ChangeSet WHERE Summary.Id=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, changeSummaryId);
      if (stmt.step() !== DbResult.BE_SQLITE_ROW)
        throw new IVaultError(IVaultStatus.BadArg, `No ChangeSet information found for ChangeSummary ${changeSummaryId}.`);

      const row = stmt.getRow();
      return { id: changeSummaryId, changeSet: { wsgId: row.wsgId, parentWsgId: row.parentWsgId, description: row.description, pushDate: row.pushDate, userCreated: row.userCreated } };
    });
  }

  /** Queries the InstanceChange for the specified instance change id.
   *
   * See also
   * - `DMDbChange.InstanceChange` DMClass in the *DMDbChange* DMSchema
   * - [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iVault iVault
   * @param instanceChangeId DMInstanceId of the InstanceChange (see `DMDbChange.InstanceChange` DMClass in the *DMDbChange* DMSchema)
   * @returns Returns the requested InstanceChange object (see `DMDbChange.InstanceChange` DMClass in the *DMDbChange* DMSchema)
   * @throws [IVaultError]($common) if instance change does not exist for the specified id, or if the
   * change cache file hasn't been attached, or in case of other errors.
   */
  public static queryInstanceChange(iVault: BriefcaseDb, instanceChangeId: Id64String): InstanceChange {
    if (!ChangeSummaryManager.isChangeCacheAttached(iVault))
      throw new IVaultError(IVaultStatus.BadArg, "Change Cache file must be attached to iVault.");

    // query instance changes
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const instanceChange: InstanceChange = iVault.withPreparedStatement(`SELECT ic.Summary.Id summaryId, s.Name changedInstanceSchemaName, c.Name changedInstanceClassName, ic.ChangedInstance.Id changedInstanceId,
       ic.OpCode, ic.IsIndirect FROM dmchange.change.InstanceChange ic JOIN main.meta.DMClassDef c ON c.DMInstanceId = ic.ChangedInstance.ClassId
       JOIN main.meta.DMSchemaDef s ON c.Schema.Id = s.DMInstanceId WHERE ic.DMInstanceId =? `,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      (stmt: DMSqlStatement) => {
        stmt.bindId(1, instanceChangeId);
        if (stmt.step() !== DbResult.BE_SQLITE_ROW)
          throw new IVaultError(IVaultStatus.BadArg, `No InstanceChange found for id ${instanceChangeId}.`);

        const row = stmt.getRow();
        const changedInstanceId: Id64String = row.changedInstanceId;
        const changedInstanceClassName: string = `[${row.changedInstanceSchemaName}].[${row.changedInstanceClassName}]`;
        const op: ChangeOpCode = row.opCode as ChangeOpCode;

        return {
          id: instanceChangeId, summaryId: row.summaryId, changedInstance: { id: changedInstanceId, className: changedInstanceClassName },
          opCode: op, isIndirect: row.isIndirect,
        };
      });

    return instanceChange;
  }

  /** Retrieves the names of the properties whose values have changed for the given instance change
   *
   * See also [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iVault iVault
   * @param instanceChangeId Id of the InstanceChange to query the properties whose values have changed
   * @returns Returns names of the properties whose values have changed for the given instance change
   * @throws [IVaultError]($common) if the change cache file hasn't been attached, or in case of other errors.
   */
  public static getChangedPropertyValueNames(iVault: IVaultDb, instanceChangeId: Id64String): string[] {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return iVault.withPreparedStatement("SELECT AccessString FROM dmchange.change.PropertyValueChange WHERE InstanceChange.Id=?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, instanceChangeId);

      const selectClauseItems: string[] = [];
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        // access string tokens need to be escaped as they might collide with reserved words in DMSQL or SQLite
        const accessString: string = stmt.getValue(0).getString();
        const accessStringTokens: string[] = accessString.split(".");
        assert(accessStringTokens.length > 0);

        let isFirstToken: boolean = true;
        let item: string = "";
        for (const token of accessStringTokens) {
          if (!isFirstToken)
            item += ".";

          item += `[${token}]`;
          isFirstToken = false;
        }
        selectClauseItems.push(item);
      }

      return selectClauseItems;
    });
  }

  /** Builds the DMSQL to query the property value changes for the specified instance change and the specified ChangedValueState.
   *
   * See also [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iVault iVault
   * @param instanceChangeInfo InstanceChange to query the property value changes for
   *        changedInstance.className must be fully qualified and schema and class name must be escaped with square brackets if they collide with reserved DMSQL words: `[schema name].[class name]`
   * @param changedValueState The Changed State to query the values for. This must correspond to the [InstanceChange.OpCode]($backend) of the InstanceChange.
   * @param changedPropertyNames List of the property names for which values have changed for the specified instance change.
   *        The list can be obtained by calling [ChangeSummaryManager.getChangedPropertyValueNames]($core-backend).
   *        If omitted, the method will call the above method by itself. The parameter allows for checking first whether
   *        an instance change has any property value changes at all. If there are no property value changes, this method
   *        should not be called, as it will throw an error.
   * @returns Returns the DMSQL that will retrieve the property value changes
   * @throws [IVaultError]($common) if instance change does not exist, if there are not property value changes for the instance change,
   *        if the change cache file hasn't been attached, or in case of other errors.
   */
  public static buildPropertyValueChangesDMSql(iVault: IVaultDb, instanceChangeInfo: { id: Id64String, summaryId: Id64String, changedInstance: { id: Id64String, className: string } }, changedValueState: ChangedValueState, changedPropertyNames?: string[]): string {
    let selectClauseItems: string[];
    if (!changedPropertyNames) {
      // query property value changes just to build a SELECT statement against the class of the changed instance
      selectClauseItems = ChangeSummaryManager.getChangedPropertyValueNames(iVault, instanceChangeInfo.id);
    } else
      selectClauseItems = changedPropertyNames;

    if (selectClauseItems.length === 0)
      throw new IVaultError(IVaultStatus.BadArg, `No property value changes found for InstanceChange ${instanceChangeInfo.id}.`);

    let dmsql: string = "SELECT ";
    selectClauseItems.map((item: string, index: number) => {
      if (index !== 0)
        dmsql += ",";

      dmsql += item;
    });

    // Avoiding parameters in the Changes function speeds up performance because DMDb can do optimizations
    // if it knows the function args at prepare time
    dmsql += ` FROM main.${instanceChangeInfo.changedInstance.className}.Changes(${instanceChangeInfo.summaryId},${changedValueState}) WHERE DMInstanceId=${instanceChangeInfo.changedInstance.id}`;
    return dmsql;
  }

  /**
   * Creates a change summary for the last applied change set to the iVault
   * @param accessToken A valid access token string
   * @param iVault iVault to extract change summaries for. The iVault must not be a standalone iVault, and must have at least one change set applied to it.
   * @returns The id of the extracted change summary.
   * @beta
   */
  public static async createChangeSummary(accessToken: AccessToken, iVault: BriefcaseDb): Promise<Id64String> {
    if (!iVault?.isOpen)
      throw new IVaultError(IVaultStatus.BadRequest, "Briefcase must be open");
    const changesetId = iVault.changeset.id;
    if (!changesetId)
      throw new IVaultError(IVaultStatus.BadRequest, "No change set was applied to the iVault");
    if (this.isChangeCacheAttached(iVault))
      throw new IVaultError(IVaultStatus.BadRequest, "Change cache must be detached before extraction");

    const iVaultId = iVault.iVaultId;
    const changesetsFolder: string = BriefcaseManager.getChangeSetsPath(iVaultId);
    const changeset = await IVaultHost[_hubAccess].downloadChangeset({ accessToken: IVaultHost.authorizationClient ? undefined : accessToken, iVaultId, changeset: { id: iVault.changeset.id }, targetDir: changesetsFolder });

    if (!IVaultJsFs.existsSync(changeset.pathname))
      throw new IVaultError(IVaultStatus.FileNotFound, `Failed to download change set: ${changeset.pathname}`);

    try {
      using changesFile = ChangeSummaryManager.openOrCreateChangesFile(iVault);
      assert(changesFile[_nativeDb] !== undefined, "Invalid changesFile - should've caused an exception");

      let changeSummaryId = ChangeSummaryManager.isSummaryAlreadyExtracted(changesFile, changesetId);
      if (changeSummaryId !== undefined) {
        Logger.logInfo(loggerCategory, `Change Summary for changeset already exists. It is not extracted again.`, () => ({ iVaultId, changeSetId: changesetId }));
        return changeSummaryId;
      }

      const stat = iVault[_nativeDb].extractChangeSummary(changesFile[_nativeDb], changeset.pathname);
      if (stat.error && stat.error.status !== DbResult.BE_SQLITE_OK)
        throw new IVaultError(stat.error.status, stat.error.message);

      assert(undefined !== stat.result);
      changeSummaryId = stat.result;
      ChangeSummaryManager.addExtendedInfos(changesFile, changeSummaryId, changesetId, changeset.parentId, changeset.description, changeset.pushDate, changeset.userCreated);

      changesFile.saveChanges();
      return changeSummaryId;
    } finally {
      IVaultJsFs.unlinkSync(changeset.pathname);
    }
  }

  /**
   * Creates change summaries for the specified iVault and a specified range of versions
   * @note This may be an expensive operation - downloads the first version and starts applying the change sets, extracting summaries one by one
   * @param args Arguments including the range of versions for which Change Summaries are to be created, and other necessary input for creation
   */
  public static async createChangeSummaries(args: CreateChangeSummaryArgs): Promise<Id64String[]> {
    // if we pass undefined to hubAccess methods they will use our authorizationClient to refresh the token as needed.
    const accessToken = IVaultHost.authorizationClient ? undefined : args.accessToken ?? "";
    const { iVaultId, szewTwinId, range } = args;
    range.end = range.end ?? (await IVaultHost[_hubAccess].getChangesetFromVersion({ accessToken, iVaultId, version: IVaultVersion.latest() })).index;
    if (range.first > range.end)
      throw new IVaultError(IVaultStatus.BadArg, "Invalid range of changesets");
    if (range.first === 0 && range.end === 0)
      return []; // no changesets exist, so the inclusive range is empty

    const changesets = await IVaultHost[_hubAccess].queryChangesets({ accessToken, iVaultId, range });

    // Setup a temporary briefcase to help with extracting change summaries
    const briefcasePath = BriefcaseManager.getBriefcaseBasePath(iVaultId);
    const fileName: string = path.join(briefcasePath, `ChangeSummaryBriefcase.dtw`);
    if (IVaultJsFs.existsSync(fileName))
      IVaultJsFs.removeSync(fileName);

    let iVault: BriefcaseDb | undefined;
    try {
      // Download a version that has the first change set applied
      const props = await BriefcaseManager.downloadBriefcase({ accessToken, szewTwinId, iVaultId, asOf: { afterChangeSetId: changesets[0].id }, briefcaseId: 0, fileName });
      iVault = await BriefcaseDb.open({ fileName: props.fileName });

      const summaryIds = new Array<Id64String>();
      for (let index = 0; index < changesets.length; index++) {
        // Apply a change set if necessary
        if (index > 0)
          await iVault.pullChanges({ accessToken, toIndex: changesets[index].index });

        // Create a change summary for the last change set that was applied
        const summaryId = await this.createChangeSummary(accessToken ?? await IVaultHost.authorizationClient?.getAccessToken() ?? "", iVault);
        summaryIds.push(summaryId);
      }
      return summaryIds;
    } finally {
      if (iVault !== undefined)
        iVault.close();
      IVaultJsFs.removeSync(fileName);
    }
  }
}
