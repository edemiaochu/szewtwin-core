/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Errors
 */

import { DbResult } from "./BeSQLite";
import { RepositoryStatus } from "./internal/RepositoryStatus";
import { JsonUtils } from "./JsonUtils";

/** Uniquely identifies a specific kind of [[SZEWTwinError]].
 * @beta
 */
export interface SZEWTwinErrorId {
  /** A "namespace" serving as a qualifier for the [[key]]. It should be specific enough to ensure uniqueness across all applications.
   * For example, all errors originating from a given package should use that package's full name as their scope.
   */
  readonly scope: string;
  /** Uniquely identifies a specific kind of [[SZEWTwinError]] within the [[scope]]. */
  readonly key: string;
}

/** The interface that all exceptions thrown by szewTwin.js libraries and applications should implement.
 * Specific kinds of `SZEWTwinError`s are identified by an [[SZEWTwinErrorId]] that allows programmers to identify errors when they are caught without relying
 * on specific class hierarchies, which is especially important when errors are marshalled across process boundaries.
 * You can extend `SZEWTwinError` to add properties that provide programmers with additional context for a particular kind of error.
 * When catching errors, programmers can use [[isError]] to determine if the error is of a specific sub-type, and if so access the
 * additional properties.
 * Those additional properties will also be logged as metadata by [[Logger.logException]].
 * @beta
 */
export interface SZEWTwinError extends Error {
  /** Uniquely identifies the kind of error. */
  readonly szewTwinErrorId: SZEWTwinErrorId;
}

/** @beta */
export namespace SZEWTwinError {
  /** Instantiate a new `SZEWTwinError` or subtype thereof.
   * @see [[SZEWTwinError.throwError]] to conveniently instantiate and throw the error.
   */
  export function create<T extends SZEWTwinError>(args: Omit<T, "name">): T {
    const err = new Error(args.message);
    Object.assign(err, args);
    err.name = args.szewTwinErrorId.key; // helpful because this is used by `toString` for Error class
    return err as T;
  }

  /** Instantiate and immediately throw an `SZEWTwinError`.
   * @see [[SZEWTwinError.create]] to instantiate an error without throwing it.
   */
  export function throwError<T extends SZEWTwinError>(args: Omit<T, "name">): never {
    throw create(args);
  }

  /**
   * Determine whether an error object was thrown by szewTwin.js and has a specific scope and key.
   *
   * If the test succeeds, the type of `error` is coerced to `T`
   * @param error The error to ve verified.
   * @param scope value for `error.szewTwinErrorId.scope`
   * @param key value for `error.szewTwinErrorId.key`
  */
  export function isError<T extends SZEWTwinError>(error: unknown, scope: string, key?: string): error is T {
    return JsonUtils.isObject(error) && "szewTwinErrorId" in error && JsonUtils.isObject(error.szewTwinErrorId)
      && error.szewTwinErrorId.scope === scope && (undefined === key || error.szewTwinErrorId.key === key);
  }
}

/** Standard status code.
 * This status code should be rarely used.
 * Prefer to throw an exception to indicate an error, rather than returning a special status code.
 * If a status code is to be returned, prefer to return a more specific error status type such as IVaultStatus or DbResult.
 * @public
 */
export enum SzewecStatus {
  SUCCESS = 0x0000,
  ERROR = 0x8000,
}

/** Status codes that are used in conjunction with [[SzewecError]].
 * Error status codes are divided into separate ranges for different kinds of errors. All known ranges at least should be defined here, to avoid collisions.
 * @public
 */
export enum IVaultStatus {
  IVAULT_ERROR_BASE = 0x10000,
  Success = 0,
  AlreadyLoaded = IVAULT_ERROR_BASE + 1,
  AlreadyOpen = IVAULT_ERROR_BASE + 2,
  BadArg = IVAULT_ERROR_BASE + 3,
  BadElement = IVAULT_ERROR_BASE + 4,
  BadModel = IVAULT_ERROR_BASE + 5,
  BadRequest = IVAULT_ERROR_BASE + 6,
  BadSchema = IVAULT_ERROR_BASE + 7,
  CannotUndo = IVAULT_ERROR_BASE + 8,
  CodeNotReserved = IVAULT_ERROR_BASE + 9,
  DeletionProhibited = IVAULT_ERROR_BASE + 10,
  DuplicateCode = IVAULT_ERROR_BASE + 11,
  DuplicateName = IVAULT_ERROR_BASE + 12,
  ElementBlockedChange = IVAULT_ERROR_BASE + 13,
  FileAlreadyExists = IVAULT_ERROR_BASE + 14,
  FileNotFound = IVAULT_ERROR_BASE + 15,
  FileNotLoaded = IVAULT_ERROR_BASE + 16,
  ForeignKeyConstraint = IVAULT_ERROR_BASE + 17,
  IdExists = IVAULT_ERROR_BASE + 18,
  InDynamicTransaction = IVAULT_ERROR_BASE + 19,
  InvalidCategory = IVAULT_ERROR_BASE + 20,
  InvalidCode = IVAULT_ERROR_BASE + 21,
  InvalidCodeSpec = IVAULT_ERROR_BASE + 22,
  InvalidId = IVAULT_ERROR_BASE + 23,
  InvalidName = IVAULT_ERROR_BASE + 24,
  InvalidParent = IVAULT_ERROR_BASE + 25,
  InvalidProfileVersion = IVAULT_ERROR_BASE + 26,
  IsCreatingChangeSet = IVAULT_ERROR_BASE + 27,
  LockNotHeld = IVAULT_ERROR_BASE + 28,
  Mismatch2d3d = IVAULT_ERROR_BASE + 29,
  MismatchGcs = IVAULT_ERROR_BASE + 30,
  MissingDomain = IVAULT_ERROR_BASE + 31,
  MissingHandler = IVAULT_ERROR_BASE + 32,
  MissingId = IVAULT_ERROR_BASE + 33,
  NoGeometry = IVAULT_ERROR_BASE + 34,
  NoMultiTxnOperation = IVAULT_ERROR_BASE + 35,
  NotEnabled = IVAULT_ERROR_BASE + 37,
  NotFound = IVAULT_ERROR_BASE + 38,
  NotOpen = IVAULT_ERROR_BASE + 39,
  NotOpenForWrite = IVAULT_ERROR_BASE + 40,
  NotSameUnitBase = IVAULT_ERROR_BASE + 41,
  NothingToRedo = IVAULT_ERROR_BASE + 42,
  NothingToUndo = IVAULT_ERROR_BASE + 43,
  ParentBlockedChange = IVAULT_ERROR_BASE + 44,
  ReadError = IVAULT_ERROR_BASE + 45,
  ReadOnly = IVAULT_ERROR_BASE + 46,
  ReadOnlyDomain = IVAULT_ERROR_BASE + 47,
  RepositoryManagerError = IVAULT_ERROR_BASE + 48,
  SQLiteError = IVAULT_ERROR_BASE + 49,
  TransactionActive = IVAULT_ERROR_BASE + 50,
  UnitsMissing = IVAULT_ERROR_BASE + 51,
  UnknownFormat = IVAULT_ERROR_BASE + 52,
  UpgradeFailed = IVAULT_ERROR_BASE + 53,
  ValidationFailed = IVAULT_ERROR_BASE + 54,
  VersionTooNew = IVAULT_ERROR_BASE + 55,
  VersionTooOld = IVAULT_ERROR_BASE + 56,
  ViewNotFound = IVAULT_ERROR_BASE + 57,
  WriteError = IVAULT_ERROR_BASE + 58,
  WrongClass = IVAULT_ERROR_BASE + 59,
  WrongIVault = IVAULT_ERROR_BASE + 60,
  WrongDomain = IVAULT_ERROR_BASE + 61,
  WrongElement = IVAULT_ERROR_BASE + 62,
  WrongHandler = IVAULT_ERROR_BASE + 63,
  WrongModel = IVAULT_ERROR_BASE + 64,
  ConstraintNotUnique = IVAULT_ERROR_BASE + 65,
  NoGeoLocation = IVAULT_ERROR_BASE + 66,
  ServerTimeout = IVAULT_ERROR_BASE + 67,
  NoContent = IVAULT_ERROR_BASE + 68,
  NotRegistered = IVAULT_ERROR_BASE + 69,
  FunctionNotFound = IVAULT_ERROR_BASE + 70,
  NoActiveCommand = IVAULT_ERROR_BASE + 71,
  Aborted = IVAULT_ERROR_BASE + 72,
}

/** Error statuses produced by various briefcase operations, typically encountered as the `errorNumber` of an [IVaultError]($common).
 * @public
 */
export enum BriefcaseStatus {
  BRIEFCASE_STATUS_BASE = 0x20000,
  CannotAcquire = BRIEFCASE_STATUS_BASE,
  CannotDownload = BRIEFCASE_STATUS_BASE + 1,
  CannotUpload = BRIEFCASE_STATUS_BASE + 2,
  CannotCopy = BRIEFCASE_STATUS_BASE + 3,
  CannotDelete = BRIEFCASE_STATUS_BASE + 4,
  VersionNotFound = BRIEFCASE_STATUS_BASE + 5,
  CannotApplyChanges = BRIEFCASE_STATUS_BASE + 6,
  DownloadCancelled = BRIEFCASE_STATUS_BASE + 7,
  ContainsDeletedChangeSets = BRIEFCASE_STATUS_BASE + 8,
}

/** RpcInterface status codes
 * @beta
 */
export enum RpcInterfaceStatus {
  Success = 0,
  RPC_INTERFACE_ERROR_BASE = 0x21000,
  /** The RpcInterface implemented by the server is incompatible with the interface requested by the client. */
  IncompatibleVersion = RPC_INTERFACE_ERROR_BASE,
}

/** Error statuses produced by various Changeset operations, typically encountered as the `errorNumber` of an [IVaultError]($common).
 * @public
 */
export enum ChangeSetStatus { // Note: Values must be kept in sync with ChangeSetStatus in BldPlatform
  Success = 0,
  CHANGESET_ERROR_BASE = 0x16000,
  /** Error applying a change set when reversing or reinstating it */
  ApplyError = CHANGESET_ERROR_BASE + 1,
  /** Change tracking has not been enabled. The ChangeSet API mandates this. */
  ChangeTrackingNotEnabled = CHANGESET_ERROR_BASE + 2,
  /** Contents of the change stream are corrupted and does not match the ChangeSet */
  CorruptedChangeStream = CHANGESET_ERROR_BASE + 3,
  /** File containing the changes to the change set is not found */
  FileNotFound = CHANGESET_ERROR_BASE + 4,
  /** Error writing the contents of the change set to the backing change stream file */
  FileWriteError = CHANGESET_ERROR_BASE + 5,
  /**  Cannot perform the operation since the Db has local changes */
  HasLocalChanges = CHANGESET_ERROR_BASE + 6,
  /**  Cannot perform the operation since current transaction has uncommitted changes */
  HasUncommittedChanges = CHANGESET_ERROR_BASE + 7,
  /**  Invalid ChangeSet Id */
  InvalidId = CHANGESET_ERROR_BASE + 8,
  /**  Invalid version of the change set */
  InvalidVersion = CHANGESET_ERROR_BASE + 9,
  /** Cannot perform the operation since system is in the middle of a dynamic transaction */
  InDynamicTransaction = CHANGESET_ERROR_BASE + 10,
  /** Cannot perform operation since system is in the middle of a creating a change set */
  IsCreatingChangeSet = CHANGESET_ERROR_BASE + 11,
  /** Cannot perform operation since the system is not creating a change set */
  IsNotCreatingChangeSet = CHANGESET_ERROR_BASE + 12,
  /** Error propagating the changes after the merge */
  MergePropagationError = CHANGESET_ERROR_BASE + 13,
  /** No change sets to merge */
  NothingToMerge = CHANGESET_ERROR_BASE + 14,
  /** No transactions are available to create a change set */
  NoTransactions = CHANGESET_ERROR_BASE + 15,
  /** Parent change set of the Db does not match the parent id of the change set */
  ParentMismatch = CHANGESET_ERROR_BASE + 16,
  /** Error performing a SQLite operation on the Db */
  SQLiteError = CHANGESET_ERROR_BASE + 17,
  /** ChangeSet originated in a different Db */
  WrongBldDb = CHANGESET_ERROR_BASE + 18,
  /** Could not open the BldDb to merge change set */
  CouldNotOpenBldDb = CHANGESET_ERROR_BASE + 19,
  /** Cannot merge changes in in an open BldDb. Close the BldDb, and process the operation when it is opened. */
  MergeSchemaChangesOnOpen = CHANGESET_ERROR_BASE + 20,
  /** Cannot reverse or reinstate schema changes. */
  ReverseOrReinstateSchemaChanges = CHANGESET_ERROR_BASE + 21,
  /** Cannot process changes schema changes in an open BldDb. Close the BldDb, and process the operation when it is opened. */
  ProcessSchemaChangesOnOpen = CHANGESET_ERROR_BASE + 22,
  /** Cannot merge changes into a Readonly BldDb. */
  CannotMergeIntoReadonly = CHANGESET_ERROR_BASE + 23,
  /**  Cannot merge changes into a Master BldDb. */
  CannotMergeIntoMaster = CHANGESET_ERROR_BASE + 24,
  /** Cannot merge changes into a BldDb that has reversed change sets. */
  CannotMergeIntoReversed = CHANGESET_ERROR_BASE + 25,
  /** ChangeSet(s) download was cancelled. */
  DownloadCancelled = CHANGESET_ERROR_BASE + 26,
}

/** Status from returned HTTP status code
 * @beta
 */
export enum HttpStatus {
  /** 2xx Success */
  Success = 0,
  /** 1xx Informational responses */
  Info = 0x17001,
  /** 3xx Redirection */
  Redirection = 0x17002,
  /** 4xx Client errors */
  ClientError = 0x17003,
  /** 5xx Server errors */
  ServerError = 0x17004,
}

/** Statuses produced by APIs that interact with iVaultHub, typically encountered as the `errorNumber` of an [IVaultError]($common).
 * @public
 */
export enum IVaultHubStatus {
  Success = 0,
  IVAULTHUBERROR_BASE = 0x19000,
  IVAULTHUBERROR_REQUESTERRORBASE = 0x19100,
  Unknown = IVAULTHUBERROR_BASE + 1,
  MissingRequiredProperties = IVAULTHUBERROR_BASE + 2,
  InvalidPropertiesValues = IVAULTHUBERROR_BASE + 3,
  UserDoesNotHavePermission = IVAULTHUBERROR_BASE + 4,
  UserDoesNotHaveAccess = IVAULTHUBERROR_BASE + 5,
  InvalidBriefcase = IVAULTHUBERROR_BASE + 6,
  BriefcaseDoesNotExist = IVAULTHUBERROR_BASE + 7,
  BriefcaseDoesNotBelongToUser = IVAULTHUBERROR_BASE + 8,
  AnotherUserPushing = IVAULTHUBERROR_BASE + 9,
  ChangeSetAlreadyExists = IVAULTHUBERROR_BASE + 10,
  ChangeSetDoesNotExist = IVAULTHUBERROR_BASE + 11,
  FileIsNotUploaded = IVAULTHUBERROR_BASE + 12,
  iVaultIsNotInitialized = IVAULTHUBERROR_BASE + 13,
  ChangeSetPointsToBadSeed = IVAULTHUBERROR_BASE + 14,
  OperationFailed = IVAULTHUBERROR_BASE + 15,
  PullIsRequired = IVAULTHUBERROR_BASE + 16,
  MaximumNumberOfBriefcasesPerUser = IVAULTHUBERROR_BASE + 17,
  MaximumNumberOfBriefcasesPerUserPerMinute = IVAULTHUBERROR_BASE + 18,
  DatabaseTemporarilyLocked = IVAULTHUBERROR_BASE + 19,
  iVaultIsLocked = IVAULTHUBERROR_BASE + 20,
  CodesExist = IVAULTHUBERROR_BASE + 21,
  LocksExist = IVAULTHUBERROR_BASE + 22,
  iVaultAlreadyExists = IVAULTHUBERROR_BASE + 23,
  iVaultDoesNotExist = IVAULTHUBERROR_BASE + 24,
  FileDoesNotExist = IVAULTHUBERROR_BASE + 25,
  FileAlreadyExists = IVAULTHUBERROR_BASE + 26,
  LockDoesNotExist = IVAULTHUBERROR_BASE + 27,
  LockOwnedByAnotherBriefcase = IVAULTHUBERROR_BASE + 28,
  CodeStateInvalid = IVAULTHUBERROR_BASE + 29,
  CodeReservedByAnotherBriefcase = IVAULTHUBERROR_BASE + 30,
  CodeDoesNotExist = IVAULTHUBERROR_BASE + 31,
  EventTypeDoesNotExist = IVAULTHUBERROR_BASE + 32,
  EventSubscriptionDoesNotExist = IVAULTHUBERROR_BASE + 33,
  EventSubscriptionAlreadyExists = IVAULTHUBERROR_BASE + 34,
  SZEWTwinIdIsNotSpecified = IVAULTHUBERROR_BASE + 35,
  FailedToGetSZEWTwinPermissions = IVAULTHUBERROR_BASE + 36,
  FailedToGetSZEWTwinMembers = IVAULTHUBERROR_BASE + 37,
  ChangeSetAlreadyHasVersion = IVAULTHUBERROR_BASE + 38,
  VersionAlreadyExists = IVAULTHUBERROR_BASE + 39,
  JobSchedulingFailed = IVAULTHUBERROR_BASE + 40,
  ConflictsAggregate = IVAULTHUBERROR_BASE + 41,
  FailedToGetSZEWTwinById = IVAULTHUBERROR_BASE + 42,

  DatabaseOperationFailed = IVAULTHUBERROR_BASE + 43,
  SeedFileInitializationFailed = IVAULTHUBERROR_BASE + 44,

  FailedToGetAssetPermissions = IVAULTHUBERROR_BASE + 45,
  FailedToGetAssetMembers = IVAULTHUBERROR_BASE + 46,
  SZEWTwinDoesNotExist = IVAULTHUBERROR_BASE + 47,

  LockChunkDoesNotExist = IVAULTHUBERROR_BASE + 49,

  CheckpointAlreadyExists = IVAULTHUBERROR_BASE + 50,
  CheckpointDoesNotExist = IVAULTHUBERROR_BASE + 51,

  // Errors that are returned for incorrect iVaultHub request.
  UndefinedArgumentError = IVAULTHUBERROR_REQUESTERRORBASE + 1,
  InvalidArgumentError = IVAULTHUBERROR_REQUESTERRORBASE + 2,
  MissingDownloadUrlError = IVAULTHUBERROR_REQUESTERRORBASE + 3,
  NotSupportedInBrowser = IVAULTHUBERROR_REQUESTERRORBASE + 4,
  FileHandlerNotSet = IVAULTHUBERROR_REQUESTERRORBASE + 5,
  FileNotFound = IVAULTHUBERROR_REQUESTERRORBASE + 6,
  InitializationTimeout = IVAULTHUBERROR_REQUESTERRORBASE + 7,
}

/** GeoServiceStatus errors
 * @public
 */
export enum GeoServiceStatus {
  Success = 0,
  GEOSERVICESTATUS_BASE = 0x24000,
  // Error mapped from 'IVaultStatus'
  NoGeoLocation = IVaultStatus.NoGeoLocation,
  // Following errors are mapped from 'GeoCoordStatus'
  OutOfUsefulRange = GEOSERVICESTATUS_BASE + 1,
  OutOfMathematicalDomain = GEOSERVICESTATUS_BASE + 2,
  NoDatumConverter = GEOSERVICESTATUS_BASE + 3,
  VerticalDatumConvertError = GEOSERVICESTATUS_BASE + 4,
  CSMapError = GEOSERVICESTATUS_BASE + 5,
  /**
   * @deprecated in 5.0 - will not be removed until after 2026-06-13. This status is never returned.
   */
  Pending = GEOSERVICESTATUS_BASE + 6,
}

/** Error status from various reality data operations
 * @alpha
 */
export enum RealityDataStatus {
  Success = 0,
  REALITYDATA_ERROR_BASE = 0x25000,
  InvalidData = REALITYDATA_ERROR_BASE + 1,
}

/** A function that returns a metadata object for a [[SzewecError]].
 * This is generally used for logging. However not every exception is logged, so use this if the metadata for an exception is expensive to create.
 * @public
 */
export type GetMetaDataFunction = () => object | undefined;

/** Optional metadata attached to a [[SzewecError]]. May either be an object or a function that returns an object.
 * If this exception is logged and metadata is present, the metaData object is attached to the log entry via `JSON.stringify`
 * @public
 */
export type LoggingMetaData = GetMetaDataFunction | object | undefined;


interface ErrorProps {
  message: string;
  stack?: string;
  metadata?: object;
}

/**
 * An [[SZEWTwinError]] that also supplies an `errorNumber`.
 * @note this interface exists *only* for legacy errors derived from `SzewecError`. The concept of "error number" is
 * problematic since it is impossible to enforce across the szewTwin.js library, let alone across applications. New code should
 * use `SZEWTwinError` and identify errors with strings instead.
 * @beta */
export interface LegacySZEWTwinErrorWithNumber extends SZEWTwinError {
  /** a number to identify the error. */
  readonly errorNumber: number;

  /** Logging metadata
   * @note exceptions should *not* include logging data. Logging should be done where exceptions are caught. This member exists
   * only for backwards compatibility.
   */
  loggingMetadata?: object;
}

/**
 * Base exception class for legacy szewTwin.js errors.
 * For backwards compatibility only. Do not create new subclasses of SzewecError. Instead use [[SZEWTwinError]].
 * @public
 */
export class SzewecError extends Error { // note: this class implements LegacySZEWTwinErrorWithNumber but can't be declared as such because that interface is @beta.
  public static readonly szewTwinErrorScope = "szewec-error";
  private readonly _metaData: LoggingMetaData;

  /**
   * @param errorNumber The a number that identifies of the problem.
   * @param message  message that describes the problem (should not be localized).
   * @param metaData metaData about the exception.
   */
  public constructor(public errorNumber: number, message?: string, metaData?: LoggingMetaData) {
    super(message);
    this.errorNumber = errorNumber;
    this._metaData = metaData;
    this.name = this._initName();
  }

  /** supply the value for szewTwinErrorId  */
  public get szewTwinErrorId() {
    return { scope: SzewecError.szewTwinErrorScope, key: this.name };
  }
  /** value for logging metadata */
  public get loggingMetadata() { return this.getMetaData(); }

  /**
   * Determine if an error object implements the `LegacySZEWTwinErrorWithNumber` interface.
   *
   * If the test succeeds, the type of `error` is coerced to `T`
   * @note this method does *not* test that the object is an `instanceOf SzewecError`.
   * @beta
   */
  public static isError<T extends LegacySZEWTwinErrorWithNumber>(error: unknown, errorNumber?: number): error is T {
    return SZEWTwinError.isError<LegacySZEWTwinErrorWithNumber>(error, SzewecError.szewTwinErrorScope) &&
      typeof error.errorNumber === "number" && (errorNumber === undefined || error.errorNumber === errorNumber);
  }

  /** Returns true if this SzewecError includes (optional) metadata. */
  public get hasMetaData(): boolean { return undefined !== this._metaData; }

  /** get the meta data associated with this SzewecError, if any. */
  public getMetaData(): object | undefined {
    return SzewecError.getMetaData(this._metaData);
  }

  /** get the metadata object associated with an ExceptionMetaData, if any. */
  public static getMetaData(metaData: LoggingMetaData): object | undefined {
    return (typeof metaData === "function") ? metaData() : metaData;
  }

  /** This function returns the name of each error status. Override this method to handle more error status codes. */
  protected _initName(): string {
    return SzewecError.getErrorKey(this.errorNumber);
  }

  /** This function returns the name of each error status. */
  public static getErrorKey(errorNumber: number) {
    switch (errorNumber) {
      case IVaultStatus.AlreadyLoaded: return "Already Loaded";
      case IVaultStatus.AlreadyOpen: return "Already Open";
      case IVaultStatus.BadArg: return "Bad Arg";
      case IVaultStatus.BadElement: return "Bad Element";
      case IVaultStatus.BadModel: return "Bad Model";
      case IVaultStatus.BadRequest: return "Bad Request";
      case IVaultStatus.BadSchema: return "Bad Schema";
      case IVaultStatus.CannotUndo: return "Can not Undo";
      case IVaultStatus.CodeNotReserved: return "Code Not Reserved";
      case IVaultStatus.DeletionProhibited: return "Deletion Prohibited";
      case IVaultStatus.DuplicateCode: return "Duplicate Code";
      case IVaultStatus.DuplicateName: return "Duplicate Name";
      case IVaultStatus.ElementBlockedChange: return "Element Blocked Change";
      case IVaultStatus.FileAlreadyExists: return "File Already Exists";
      case IVaultStatus.FileNotFound: return "File Not Found";
      case IVaultStatus.FileNotLoaded: return "File Not Loaded";
      case IVaultStatus.ForeignKeyConstraint: return "ForeignKey Constraint";
      case IVaultStatus.IdExists: return "Id Exists";
      case IVaultStatus.InDynamicTransaction: return "InDynamicTransaction";
      case IVaultStatus.InvalidCategory: return "Invalid Category";
      case IVaultStatus.InvalidCode: return "Invalid Code";
      case IVaultStatus.InvalidCodeSpec: return "Invalid CodeSpec";
      case IVaultStatus.InvalidId: return "Invalid Id";
      case IVaultStatus.InvalidName: return "Invalid Name";
      case IVaultStatus.InvalidParent: return "Invalid Parent";
      case IVaultStatus.InvalidProfileVersion: return "Invalid Profile Version";
      case IVaultStatus.IsCreatingChangeSet: return "IsCreatingChangeSet";
      case IVaultStatus.LockNotHeld: return "Lock Not Held";
      case IVaultStatus.Mismatch2d3d: return "Mismatch 2d3d";
      case IVaultStatus.MismatchGcs: return "Mismatch Gcs";
      case IVaultStatus.MissingDomain: return "Missing Domain";
      case IVaultStatus.MissingHandler: return "Missing Handler";
      case IVaultStatus.MissingId: return "Missing Id";
      case IVaultStatus.NoGeometry: return "No Geometry";
      case IVaultStatus.NoMultiTxnOperation: return "NoMultiTxnOperation";
      case IVaultStatus.NotEnabled: return "Not Enabled";
      case IVaultStatus.NotFound: return "Not Found";
      case IVaultStatus.NotOpen: return "Not Open";
      case IVaultStatus.NotOpenForWrite: return "Not Open For Write";
      case IVaultStatus.NotSameUnitBase: return "Not Same Unit Base";
      case IVaultStatus.NothingToRedo: return "Nothing To Redo";
      case IVaultStatus.NothingToUndo: return "Nothing To Undo";
      case IVaultStatus.ParentBlockedChange: return "Parent Blocked Change";
      case IVaultStatus.ReadError: return "Read Error";
      case IVaultStatus.ReadOnly: return "ReadOnly";
      case IVaultStatus.ReadOnlyDomain: return "ReadOnlyDomain";
      case IVaultStatus.RepositoryManagerError: return "RepositoryManagerError";
      case IVaultStatus.SQLiteError: return "SQLiteError";
      case IVaultStatus.TransactionActive: return "Transaction Active";
      case IVaultStatus.UnitsMissing: return "Units Missing";
      case IVaultStatus.UnknownFormat: return "Unknown Format";
      case IVaultStatus.UpgradeFailed: return "Upgrade Failed";
      case IVaultStatus.ValidationFailed: return "Validation Failed";
      case IVaultStatus.VersionTooNew: return "Version Too New";
      case IVaultStatus.VersionTooOld: return "Version Too Old";
      case IVaultStatus.ViewNotFound: return "View Not Found";
      case IVaultStatus.WriteError: return "Write Error";
      case IVaultStatus.WrongClass: return "Wrong Class";
      case IVaultStatus.WrongIVault: return "Wrong IVault";
      case IVaultStatus.WrongDomain: return "Wrong Domain";
      case IVaultStatus.WrongElement: return "Wrong Element";
      case IVaultStatus.WrongHandler: return "Wrong Handler";
      case IVaultStatus.WrongModel: return "Wrong Model";
      case DbResult.BE_SQLITE_ERROR: return "BE_SQLITE_ERROR";
      case DbResult.BE_SQLITE_INTERNAL: return "BE_SQLITE_INTERNAL";
      case DbResult.BE_SQLITE_PERM: return "BE_SQLITE_PERM";
      case DbResult.BE_SQLITE_ABORT: return "BE_SQLITE_ABORT";
      case DbResult.BE_SQLITE_BUSY: return "Db is busy";
      case DbResult.BE_SQLITE_LOCKED: return "Db is Locked";
      case DbResult.BE_SQLITE_NOMEM: return "BE_SQLITE_NOMEM";
      case DbResult.BE_SQLITE_READONLY: return "Readonly";
      case DbResult.BE_SQLITE_INTERRUPT: return "BE_SQLITE_INTERRUPT";
      case DbResult.BE_SQLITE_IOERR: return "BE_SQLITE_IOERR";
      case DbResult.BE_SQLITE_CORRUPT: return "BE_SQLITE_CORRUPT";
      case DbResult.BE_SQLITE_NOTFOUND: return "Not Found";
      case DbResult.BE_SQLITE_FULL: return "BE_SQLITE_FULL";
      case DbResult.BE_SQLITE_CANTOPEN: return "Can't open";
      case DbResult.BE_SQLITE_PROTOCOL: return "BE_SQLITE_PROTOCOL";
      case DbResult.BE_SQLITE_EMPTY: return "BE_SQLITE_EMPTY";
      case DbResult.BE_SQLITE_SCHEMA: return "BE_SQLITE_SCHEMA";
      case DbResult.BE_SQLITE_TOOBIG: return "BE_SQLITE_TOOBIG";
      case DbResult.BE_SQLITE_MISMATCH: return "BE_SQLITE_MISMATCH";
      case DbResult.BE_SQLITE_MISUSE: return "BE_SQLITE_MISUSE";
      case DbResult.BE_SQLITE_NOLFS: return "BE_SQLITE_NOLFS";
      case DbResult.BE_SQLITE_AUTH: return "BE_SQLITE_AUTH";
      case DbResult.BE_SQLITE_FORMAT: return "BE_SQLITE_FORMAT";
      case DbResult.BE_SQLITE_RANGE: return "BE_SQLITE_RANGE";
      case DbResult.BE_SQLITE_NOTADB: return "Not a Database";
      case DbResult.BE_SQLITE_IOERR_READ: return "BE_SQLITE_IOERR_READ";
      case DbResult.BE_SQLITE_IOERR_SHORT_READ: return "BE_SQLITE_IOERR_SHORT_READ";
      case DbResult.BE_SQLITE_IOERR_WRITE: return "BE_SQLITE_IOERR_WRITE";
      case DbResult.BE_SQLITE_IOERR_FSYNC: return "BE_SQLITE_IOERR_FSYNC";
      case DbResult.BE_SQLITE_IOERR_DIR_FSYNC: return "BE_SQLITE_IOERR_DIR_FSYNC";
      case DbResult.BE_SQLITE_IOERR_TRUNCATE: return "BE_SQLITE_IOERR_TRUNCATE";
      case DbResult.BE_SQLITE_IOERR_FSTAT: return "BE_SQLITE_IOERR_FSTAT";
      case DbResult.BE_SQLITE_IOERR_UNLOCK: return "BE_SQLITE_IOERR_UNLOCK";
      case DbResult.BE_SQLITE_IOERR_RDLOCK: return "BE_SQLITE_IOERR_RDLOCK";
      case DbResult.BE_SQLITE_IOERR_DELETE: return "BE_SQLITE_IOERR_DELETE";
      case DbResult.BE_SQLITE_IOERR_BLOCKED: return "BE_SQLITE_IOERR_BLOCKED";
      case DbResult.BE_SQLITE_IOERR_NOMEM: return "BE_SQLITE_IOERR_NOMEM";
      case DbResult.BE_SQLITE_IOERR_ACCESS: return "BE_SQLITE_IOERR_ACCESS";
      case DbResult.BE_SQLITE_IOERR_CHECKRESERVEDLOCK: return "BE_SQLITE_IOERR_CHECKRESERVEDLOCK";
      case DbResult.BE_SQLITE_IOERR_LOCK: return "BE_SQLITE_IOERR_LOCK";
      case DbResult.BE_SQLITE_IOERR_CLOSE: return "BE_SQLITE_IOERR_CLOSE";
      case DbResult.BE_SQLITE_IOERR_DIR_CLOSE: return "BE_SQLITE_IOERR_DIR_CLOSE";
      case DbResult.BE_SQLITE_IOERR_SHMOPEN: return "BE_SQLITE_IOERR_SHMOPEN";
      case DbResult.BE_SQLITE_IOERR_SHMSIZE: return "BE_SQLITE_IOERR_SHMSIZE";
      case DbResult.BE_SQLITE_IOERR_SHMLOCK: return "BE_SQLITE_IOERR_SHMLOCK";
      case DbResult.BE_SQLITE_IOERR_SHMMAP: return "BE_SQLITE_IOERR_SHMMAP";
      case DbResult.BE_SQLITE_IOERR_SEEK: return "BE_SQLITE_IOERR_SEEK";
      case DbResult.BE_SQLITE_IOERR_DELETE_NOENT: return "BE_SQLITE_IOERR_DELETE_NOENT";

      case DbResult.BE_SQLITE_ERROR_DataTransformRequired: return "Schema update require to transform data";
      case DbResult.BE_SQLITE_ERROR_FileExists: return "File Exists";
      case DbResult.BE_SQLITE_ERROR_AlreadyOpen: return "Already Open";
      case DbResult.BE_SQLITE_ERROR_NoPropertyTable: return "No Property Table";
      case DbResult.BE_SQLITE_ERROR_FileNotFound: return "File Not Found";
      case DbResult.BE_SQLITE_ERROR_NoTxnActive: return "No Txn Active";
      case DbResult.BE_SQLITE_ERROR_BadDbProfile: return "Bad Db Profile";
      case DbResult.BE_SQLITE_ERROR_InvalidProfileVersion: return "Invalid Profile Version";
      case DbResult.BE_SQLITE_ERROR_ProfileUpgradeFailed: return "Profile Upgrade Failed";
      case DbResult.BE_SQLITE_ERROR_ProfileTooOldForReadWrite: return "Profile Too Old For ReadWrite";
      case DbResult.BE_SQLITE_ERROR_ProfileTooOld: return "Profile Too Old";
      case DbResult.BE_SQLITE_ERROR_ProfileTooNewForReadWrite: return "Profile Too New For ReadWrite";
      case DbResult.BE_SQLITE_ERROR_ProfileTooNew: return "Profile Too New";
      case DbResult.BE_SQLITE_ERROR_ChangeTrackError: return "ChangeTrack Error";
      case DbResult.BE_SQLITE_ERROR_InvalidChangeSetVersion: return "Invalid ChangeSet Version";
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeRequired: return "Schema Upgrade Required";
      case DbResult.BE_SQLITE_ERROR_SchemaTooNew: return "Schema Too New";
      case DbResult.BE_SQLITE_ERROR_SchemaTooOld: return "Schema Too Old";
      case DbResult.BE_SQLITE_ERROR_SchemaLockFailed: return "Schema Lock Failed";
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeFailed: return "Schema Upgrade Failed";
      case DbResult.BE_SQLITE_ERROR_SchemaImportFailed: return "Schema Import Failed";
      case DbResult.BE_SQLITE_ERROR_CouldNotAcquireLocksOrCodes: return "Could Not Acquire Locks Or Codes";
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeRecommended: return "Recommended that the schemas found in the database be upgraded";
      case DbResult.BE_SQLITE_LOCKED_SHAREDCACHE: return "BE_SQLITE_LOCKED_SHAREDCACHE";
      case DbResult.BE_SQLITE_BUSY_RECOVERY: return "BE_SQLITE_BUSY_RECOVERY";
      case DbResult.BE_SQLITE_CANTOPEN_NOTEMPDIR: return "SQLite No Temp Dir";
      case DbResult.BE_SQLITE_CANTOPEN_ISDIR: return "BE_SQLITE_CANTOPEN_ISDIR";
      case DbResult.BE_SQLITE_CANTOPEN_FULLPATH: return "BE_SQLITE_CANTOPEN_FULLPATH";
      case DbResult.BE_SQLITE_CORRUPT_VTAB: return "BE_SQLITE_CORRUPT_VTAB";
      case DbResult.BE_SQLITE_READONLY_RECOVERY: return "BE_SQLITE_READONLY_RECOVERY";
      case DbResult.BE_SQLITE_READONLY_CANTLOCK: return "BE_SQLITE_READONLY_CANTLOCK";
      case DbResult.BE_SQLITE_READONLY_ROLLBACK: return "BE_SQLITE_READONLY_ROLLBACK";
      case DbResult.BE_SQLITE_ABORT_ROLLBACK: return "BE_SQLITE_ABORT_ROLLBACK";
      case DbResult.BE_SQLITE_CONSTRAINT_CHECK: return "BE_SQLITE_CONSTRAINT_CHECK";
      case DbResult.BE_SQLITE_CONSTRAINT_COMMITHOOK: return "CommitHook Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_FOREIGNKEY: return "Foreign Key Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_FUNCTION: return "Function Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_NOTNULL: return "NotNull Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_PRIMARYKEY: return "Primary Key Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_TRIGGER: return "Trigger Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_UNIQUE: return "Unique Constraint Error";
      case DbResult.BE_SQLITE_CONSTRAINT_VTAB: return "VTable Constraint Error";
      case SzewecStatus.ERROR: return "Error";
      case BriefcaseStatus.CannotAcquire: return "CannotAcquire";
      case BriefcaseStatus.CannotDownload: return "CannotDownload";
      case BriefcaseStatus.CannotCopy: return "CannotCopy";
      case BriefcaseStatus.CannotDelete: return "CannotDelete";
      case BriefcaseStatus.VersionNotFound: return "VersionNotFound";
      case BriefcaseStatus.DownloadCancelled: return "DownloadCancelled";
      case BriefcaseStatus.ContainsDeletedChangeSets: return "ContainsDeletedChangeSets";
      case RpcInterfaceStatus.IncompatibleVersion: return "RpcInterfaceStatus.IncompatibleVersion";
      case ChangeSetStatus.ApplyError: return "Error applying a change set";
      case ChangeSetStatus.ChangeTrackingNotEnabled: return "Change tracking has not been enabled. The ChangeSet API mandates this";
      case ChangeSetStatus.CorruptedChangeStream: return "Contents of the change stream are corrupted and does not match the ChangeSet";
      case ChangeSetStatus.FileNotFound: return "File containing the changes was not found";
      case ChangeSetStatus.FileWriteError: return "Error writing the contents of the change set to the backing change stream file";
      case ChangeSetStatus.HasLocalChanges: return "Cannot perform the operation since the Db has local changes";
      case ChangeSetStatus.HasUncommittedChanges: return "Cannot perform the operation since current transaction has uncommitted changes";
      case ChangeSetStatus.InvalidId: return "Invalid ChangeSet Id";
      case ChangeSetStatus.InvalidVersion: return "Invalid version of the change set";
      case ChangeSetStatus.InDynamicTransaction: return "Cannot perform the operation since system is in the middle of a dynamic transaction";
      case ChangeSetStatus.IsCreatingChangeSet: return "Cannot perform operation since system is in the middle of a creating a change set";
      case ChangeSetStatus.IsNotCreatingChangeSet: return "Cannot perform operation since the system is not creating a change set";
      case ChangeSetStatus.MergePropagationError: return "Error propagating the changes after the merge";
      case ChangeSetStatus.NothingToMerge: return "No change sets to merge";
      case ChangeSetStatus.NoTransactions: return "No transactions are available to create a change set";
      case ChangeSetStatus.ParentMismatch: return "Parent change set of the Db does not match the parent id of the change set";
      case ChangeSetStatus.SQLiteError: return "Error performing a SQLite operation on the Db";
      case ChangeSetStatus.WrongBldDb: return "ChangeSet originated in a different Db";
      case ChangeSetStatus.CouldNotOpenBldDb: return "Could not open the BldDb to merge change set";
      case ChangeSetStatus.MergeSchemaChangesOnOpen: return "Cannot merge changes in in an open BldDb. Close the BldDb, and process the operation when it is opened";
      case ChangeSetStatus.ReverseOrReinstateSchemaChanges: return "Cannot reverse or reinstate schema changes.";
      case ChangeSetStatus.ProcessSchemaChangesOnOpen: return "Cannot process changes schema changes in an open BldDb. Close the BldDb, and process the operation when it is opened";
      case ChangeSetStatus.CannotMergeIntoReadonly: return "Cannot merge changes into a Readonly BldDb";
      case ChangeSetStatus.CannotMergeIntoMaster: return "Cannot merge changes into a Master BldDb";
      case ChangeSetStatus.CannotMergeIntoReversed: return "Cannot merge changes into a BldDb that has reversed change sets";
      case ChangeSetStatus.DownloadCancelled: return "ChangeSet(s) download was cancelled.";
      case RepositoryStatus.ServerUnavailable: return "ServerUnavailable";
      case RepositoryStatus.LockAlreadyHeld: return "LockAlreadyHeld";
      case RepositoryStatus.SyncError: return "SyncError";
      case RepositoryStatus.InvalidResponse: return "InvalidResponse";
      case RepositoryStatus.PendingTransactions: return "PendingTransactions";
      case RepositoryStatus.LockUsed: return "LockUsed";
      case RepositoryStatus.CannotCreateChangeSet: return "CannotCreateChangeSet";
      case RepositoryStatus.InvalidRequest: return "InvalidRequest";
      case RepositoryStatus.ChangeSetRequired: return "ChangeSetRequired";
      case RepositoryStatus.CodeUnavailable: return "CodeUnavailable";
      case RepositoryStatus.CodeNotReserved: return "CodeNotReserved";
      case RepositoryStatus.CodeUsed: return "CodeUsed";
      case RepositoryStatus.LockNotHeld: return "LockNotHeld";
      case RepositoryStatus.RepositoryIsLocked: return "RepositoryIsLocked";
      case RepositoryStatus.ChannelConstraintViolation: return "ChannelConstraintViolation";
      case HttpStatus.Info: return "HTTP Info";
      case HttpStatus.Redirection: return "HTTP Redirection";
      case HttpStatus.ClientError: return "HTTP Client error";
      case HttpStatus.ServerError: return "HTTP Server error";
      case IVaultHubStatus.Unknown: return "Unknown error";
      case IVaultHubStatus.MissingRequiredProperties: return "Missing required properties";
      case IVaultHubStatus.InvalidPropertiesValues: return "Invalid properties values";
      case IVaultHubStatus.UserDoesNotHavePermission: return "User does not have permission";
      case IVaultHubStatus.UserDoesNotHaveAccess: return "User does not have access";
      case IVaultHubStatus.InvalidBriefcase: return "Invalid briefcase";
      case IVaultHubStatus.BriefcaseDoesNotExist: return "Briefcase does not exist";
      case IVaultHubStatus.BriefcaseDoesNotBelongToUser: return "Briefcase does not belong to user";
      case IVaultHubStatus.AnotherUserPushing: return "Another user pushing";
      case IVaultHubStatus.ChangeSetAlreadyExists: return "ChangeSet already exists";
      case IVaultHubStatus.ChangeSetDoesNotExist: return "ChangeSet does not exist";
      case IVaultHubStatus.FileIsNotUploaded: return "File is not uploaded";
      case IVaultHubStatus.iVaultIsNotInitialized: return "iVault is not initialized";
      case IVaultHubStatus.ChangeSetPointsToBadSeed: return "ChangeSet points to a bad seed file";
      case IVaultHubStatus.OperationFailed: return "iVaultHub operation has failed";
      case IVaultHubStatus.PullIsRequired: return "Pull is required";
      case IVaultHubStatus.MaximumNumberOfBriefcasesPerUser: return "Limit of briefcases per user was reached";
      case IVaultHubStatus.MaximumNumberOfBriefcasesPerUserPerMinute: return "Limit of briefcases per user per minute was reached";
      case IVaultHubStatus.DatabaseTemporarilyLocked: return "Database is temporarily locked";
      case IVaultHubStatus.iVaultIsLocked: return "iVault is locked";
      case IVaultHubStatus.CodesExist: return "Code already exists";
      case IVaultHubStatus.LocksExist: return "Lock already exists";
      case IVaultHubStatus.iVaultAlreadyExists: return "iVault already exists";
      case IVaultHubStatus.iVaultDoesNotExist: return "iVault does not exist";
      case IVaultHubStatus.LockDoesNotExist: return "Lock does not exist";
      case IVaultHubStatus.LockChunkDoesNotExist: return "Lock chunk does not exist";
      case IVaultHubStatus.LockOwnedByAnotherBriefcase: return "Lock is owned by another briefcase";
      case IVaultHubStatus.CodeStateInvalid: return "Code state is invalid";
      case IVaultHubStatus.CodeReservedByAnotherBriefcase: return "Code is reserved by another briefcase";
      case IVaultHubStatus.CodeDoesNotExist: return "Code does not exist";
      case IVaultHubStatus.FileDoesNotExist: return "File does not exist";
      case IVaultHubStatus.FileAlreadyExists: return "File already exists";
      case IVaultHubStatus.EventTypeDoesNotExist: return "Event type does not exist";
      case IVaultHubStatus.EventSubscriptionDoesNotExist: return "Event subscription does not exist";
      case IVaultHubStatus.EventSubscriptionAlreadyExists: return "Event subscription already exists";
      case IVaultHubStatus.SZEWTwinIdIsNotSpecified: return "SZEWTwin Id is not specified";
      case IVaultHubStatus.FailedToGetSZEWTwinPermissions: return "Failed to get szewTwin permissions";
      case IVaultHubStatus.FailedToGetSZEWTwinMembers: return "Failed to get szewTwin members";
      case IVaultHubStatus.FailedToGetAssetPermissions: return "Failed to get asset permissions";
      case IVaultHubStatus.FailedToGetAssetMembers: return "Failed to get asset members";
      case IVaultHubStatus.ChangeSetAlreadyHasVersion: return "ChangeSet already has version";
      case IVaultHubStatus.VersionAlreadyExists: return "Version already exists";
      case IVaultHubStatus.JobSchedulingFailed: return "Failed to schedule a background job";
      case IVaultHubStatus.ConflictsAggregate: return "Codes or locks are owned by another briefcase";
      case IVaultHubStatus.FailedToGetSZEWTwinById: return "Failed to query szewTwin by its id";
      case IVaultHubStatus.DatabaseOperationFailed: return "Database operation has failed";
      case IVaultHubStatus.SZEWTwinDoesNotExist: return "SZEWTwin does not exist";
      case IVaultHubStatus.UndefinedArgumentError: return "Undefined argument";
      case IVaultHubStatus.InvalidArgumentError: return "Invalid argument";
      case IVaultHubStatus.MissingDownloadUrlError: return "Missing download url";
      case IVaultHubStatus.NotSupportedInBrowser: return "Not supported in browser";
      case IVaultHubStatus.FileHandlerNotSet: return "File handler is not set";
      case IVaultHubStatus.FileNotFound: return "File not found";
      case GeoServiceStatus.NoGeoLocation: return "No GeoLocation";
      case GeoServiceStatus.OutOfUsefulRange: return "Out of useful range";
      case GeoServiceStatus.OutOfMathematicalDomain: return "Out of mathematical domain";
      case GeoServiceStatus.NoDatumConverter: return "No datum converter";
      case GeoServiceStatus.VerticalDatumConvertError: return "Vertical datum convert error";
      case GeoServiceStatus.CSMapError: return "CSMap error";
      case GeoServiceStatus.Pending: return "Pending"; // eslint-disable-line @typescript-eslint/no-deprecated
      case RealityDataStatus.InvalidData: return "Invalid or unknown data";
      case DbResult.BE_SQLITE_OK:
      case DbResult.BE_SQLITE_ROW:
      case DbResult.BE_SQLITE_DONE:
      case SzewecStatus.SUCCESS:
        return "Success";

      default:
        return `Error (${errorNumber})`;
    }
  }

  /** Use run-time type checking to safely get a useful string summary of an unknown error value, or `""` if none exists.
   * @note It's recommended to use this function in `catch` clauses, where a caught value cannot be assumed to be `instanceof Error`
   * @public
   */
  public static getErrorMessage(error: unknown): string {
    if (typeof error === "string")
      return error;

    if (error instanceof Error)
      return error.toString();

    if (JsonUtils.isObject(error)) {
      if (typeof error.message === "string")
        return error.message;

      if (typeof error.msg === "string")
        return error.msg;

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      if (error.toString() !== "[object Object]")
        return error.toString();  // eslint-disable-line @typescript-eslint/no-base-to-string
    }

    return "";
  }

  /** Use run-time type checking to safely get the call stack of an unknown error value, if possible.
   * @note It's recommended to use this function in `catch` clauses, where a caught value cannot be assumed to be `instanceof Error`
   * @public
   */
  public static getErrorStack(error: unknown): string | undefined {
    if (JsonUtils.isObject(error) && typeof error.stack === "string")
      return error.stack;

    return undefined;
  }

  /** Use run-time type checking to safely get the metadata with an unknown error value, if possible.
   * @note It's recommended to use this function in `catch` clauses, where a caught value cannot be assumed to be `instanceof SzewecError`
   * @see [[SzewecError.getMetaData]]
   * @public
   */
  public static getErrorMetadata(error: unknown): object | undefined {
    if (JsonUtils.isObject(error) && typeof error.getMetaData === "function") {
      const metadata = error.getMetaData();
      if (typeof metadata === "object" && metadata !== null)
        return metadata;
    }

    return undefined;
  }

  /** Returns a new `ErrorProps` object representing an unknown error value.  Useful for logging or wrapping/re-throwing caught errors.
   * @note Unlike `Error` objects (which lose messages and call stacks when serialized to JSON), objects
   *       returned by this are plain old JavaScript objects, and can be easily logged/serialized to JSON.
   * @public
   */
  public static getErrorProps(error: unknown): ErrorProps {
    const serialized: ErrorProps = {
      message: SzewecError.getErrorMessage(error),
    };

    const stack = SzewecError.getErrorStack(error);
    if (stack)
      serialized.stack = stack;

    const metadata = SzewecError.getErrorMetadata(error);
    if (metadata)
      serialized.metadata = metadata;

    return serialized;
  }
}

