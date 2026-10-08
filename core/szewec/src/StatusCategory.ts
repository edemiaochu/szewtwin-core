/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Errors
 */

import {
  SzewecError,
  SzewecStatus,
  BriefcaseStatus,
  ChangeSetStatus,
  GeoServiceStatus,
  HttpStatus,
  IVaultHubStatus,
  IVaultStatus,
  RealityDataStatus,
  RpcInterfaceStatus,
} from "./SzewecError";
import { RepositoryStatus } from "./internal/RepositoryStatus";

/* eslint-disable @typescript-eslint/no-shadow */

/** @alpha */
export type StatusCategoryHandler = (error: Error) => StatusCategory | undefined;

/** A group of related statuses for aggregate reporting purposes.
 * @alpha
 */
export abstract class StatusCategory {
  public static handlers: Set<StatusCategoryHandler> = new Set();

  public static for(error: Error): StatusCategory {
    for (const handler of this.handlers) {
      const category = handler(error);
      if (category) {
        return category;
      }
    }

    const errorNumber = (error as SzewecError).errorNumber as unknown;
    if (typeof errorNumber === "number")
      return lookupHttpStatusCategory(errorNumber);

    return new UnknownError();
  }

  public abstract name: string;
  public abstract code: number;
  public abstract error: boolean;
}

/***
 * A success status.
 * @alpha
 */
export abstract class SuccessCategory extends StatusCategory {
  public error = false;
}

/**
 * An error status.
 * @alpha
 */
export abstract class ErrorCategory extends StatusCategory {
  public error = true;
}

namespace HTTP {
  export class OK extends SuccessCategory { public name = "OK"; public code = 200; }
  export class Accepted extends SuccessCategory { public name = "Accepted"; public code = 202; }
  export class NoContent extends SuccessCategory { public name = "NoContent"; public code = 204; }

  export class BadRequest extends ErrorCategory { public name = "BadRequest"; public code = 400; }
  export class Unauthorized extends ErrorCategory { public name = "Unauthorized"; public code = 401; }
  export class Forbidden extends ErrorCategory { public name = "Forbidden"; public code = 403; }
  export class NotFound extends ErrorCategory { public name = "NotFound"; public code = 404; }
  export class RequestTimeout extends ErrorCategory { public name = "RequestTimeout"; public code = 408; }
  export class Conflict extends ErrorCategory { public name = "Conflict"; public code = 409; }
  export class Gone extends ErrorCategory { public name = "Gone"; public code = 410; }
  export class PreconditionFailed extends ErrorCategory { public name = "PreconditionFailed"; public code = 412; }
  export class ExpectationFailed extends ErrorCategory { public name = "ExpectationFailed"; public code = 417; }
  export class MisdirectedRequest extends ErrorCategory { public name = "MisdirectedRequest"; public code = 421; }
  export class UnprocessableEntity extends ErrorCategory { public name = "UnprocessableEntity"; public code = 422; }
  export class UpgradeRequired extends ErrorCategory { public name = "UpgradeRequired"; public code = 426; }
  export class PreconditionRequired extends ErrorCategory { public name = "PreconditionRequired"; public code = 428; }
  export class TooManyRequests extends ErrorCategory { public name = "TooManyRequests"; public code = 429; }

  export class InternalServerError extends ErrorCategory { public name = "InternalServerError"; public code = 500; }
  export class NotImplemented extends ErrorCategory { public name = "NotImplemented"; public code = 501; }
}

class Success extends HTTP.OK { }

class Pending extends HTTP.Accepted { }

class NoContent extends HTTP.NoContent { }
class NothingToDo extends HTTP.NoContent { }

class BadRequest extends HTTP.BadRequest { }

class Forbidden extends HTTP.Forbidden { }
class PermissionsViolation extends HTTP.Forbidden { }
class ReadOnly extends HTTP.Forbidden { }

class NotFound extends HTTP.NotFound { }

class NotEnabled extends HTTP.UnprocessableEntity { }
class NotSupported extends HTTP.UnprocessableEntity { }

class ValidationError extends HTTP.BadRequest { }

class Timeout extends HTTP.RequestTimeout { }

class Conflict extends HTTP.Conflict { }

class Cancelled extends HTTP.Gone { }

class ConstraintViolation extends HTTP.Forbidden { }
class VersioningViolation extends HTTP.Forbidden { }

class Corruption extends HTTP.InternalServerError { }
class InvalidData extends HTTP.InternalServerError { }
class OperationFailed extends HTTP.InternalServerError { }
class StateViolation extends HTTP.InternalServerError { }

class Locked extends HTTP.Conflict { }

class NetworkError extends HTTP.InternalServerError { }

class Throttled extends HTTP.TooManyRequests { }

class FileSystemError extends HTTP.InternalServerError { }
class InternalError extends HTTP.InternalServerError { }
class UnknownError extends HTTP.InternalServerError { }

class NotImplemented extends HTTP.NotImplemented { }

class Aborted extends HTTP.BadRequest { }

function lookupHttpStatusCategory(statusCode: number): StatusCategory {
  switch (statusCode) {
    case SzewecStatus.SUCCESS: return new Success();
    case SzewecStatus.ERROR: return new UnknownError();

    case IVaultStatus.Success: return new Success();
    case IVaultStatus.AlreadyLoaded: return new StateViolation();
    case IVaultStatus.AlreadyOpen: return new StateViolation();
    case IVaultStatus.BadArg: return new ValidationError();
    case IVaultStatus.BadElement: return new ValidationError();
    case IVaultStatus.BadModel: return new ValidationError();
    case IVaultStatus.BadRequest: return new BadRequest();
    case IVaultStatus.BadSchema: return new ValidationError();
    case IVaultStatus.CannotUndo: return new OperationFailed();
    case IVaultStatus.CodeNotReserved: return new StateViolation();
    case IVaultStatus.DeletionProhibited: return new Forbidden();
    case IVaultStatus.DuplicateCode: return new Conflict();
    case IVaultStatus.DuplicateName: return new Conflict();
    case IVaultStatus.ElementBlockedChange: return new ConstraintViolation();
    case IVaultStatus.FileAlreadyExists: return new Conflict();
    case IVaultStatus.FileNotFound: return new NotFound();
    case IVaultStatus.FileNotLoaded: return new FileSystemError();
    case IVaultStatus.ForeignKeyConstraint: return new ConstraintViolation();
    case IVaultStatus.IdExists: return new Conflict();
    case IVaultStatus.InDynamicTransaction: return new StateViolation();
    case IVaultStatus.InvalidCategory: return new ValidationError();
    case IVaultStatus.InvalidCode: return new ValidationError();
    case IVaultStatus.InvalidCodeSpec: return new ValidationError();
    case IVaultStatus.InvalidId: return new ValidationError();
    case IVaultStatus.InvalidName: return new ValidationError();
    case IVaultStatus.InvalidParent: return new Conflict();
    case IVaultStatus.InvalidProfileVersion: return new InvalidData();
    case IVaultStatus.IsCreatingChangeSet: return new StateViolation();
    case IVaultStatus.LockNotHeld: return new Forbidden();
    case IVaultStatus.Mismatch2d3d: return new ValidationError();
    case IVaultStatus.MismatchGcs: return new ValidationError();
    case IVaultStatus.MissingDomain: return new ValidationError();
    case IVaultStatus.MissingHandler: return new ValidationError();
    case IVaultStatus.MissingId: return new ValidationError();
    case IVaultStatus.NoGeometry: return new NoContent();
    case IVaultStatus.NoMultiTxnOperation: return new StateViolation();
    case IVaultStatus.NotEnabled: return new NotEnabled();
    case IVaultStatus.NotFound: return new NotFound();
    case IVaultStatus.NotOpen: return new StateViolation();
    case IVaultStatus.NotOpenForWrite: return new Forbidden();
    case IVaultStatus.NotSameUnitBase: return new ValidationError();
    case IVaultStatus.NothingToRedo: return new NothingToDo();
    case IVaultStatus.NothingToUndo: return new NothingToDo();
    case IVaultStatus.ParentBlockedChange: return new Forbidden();
    case IVaultStatus.ReadError: return new FileSystemError();
    case IVaultStatus.ReadOnly: return new ReadOnly();
    case IVaultStatus.ReadOnlyDomain: return new ReadOnly();
    case IVaultStatus.RepositoryManagerError: return new NetworkError();
    case IVaultStatus.SQLiteError: return new InternalError();
    case IVaultStatus.TransactionActive: return new StateViolation();
    case IVaultStatus.UnitsMissing: return new ValidationError();
    case IVaultStatus.UnknownFormat: return new InvalidData();
    case IVaultStatus.UpgradeFailed: return new OperationFailed();
    case IVaultStatus.ValidationFailed: return new ValidationError();
    case IVaultStatus.VersionTooNew: return new VersioningViolation();
    case IVaultStatus.VersionTooOld: return new VersioningViolation();
    case IVaultStatus.ViewNotFound: return new NotFound();
    case IVaultStatus.WriteError: return new FileSystemError();
    case IVaultStatus.WrongClass: return new ValidationError();
    case IVaultStatus.WrongIVault: return new ValidationError();
    case IVaultStatus.WrongDomain: return new ValidationError();
    case IVaultStatus.WrongElement: return new ValidationError();
    case IVaultStatus.WrongHandler: return new ValidationError();
    case IVaultStatus.WrongModel: return new ValidationError();
    case IVaultStatus.ConstraintNotUnique: return new ConstraintViolation();
    case IVaultStatus.NoGeoLocation: return new ValidationError();
    case IVaultStatus.ServerTimeout: return new Timeout();
    case IVaultStatus.NoContent: return new NoContent();
    case IVaultStatus.NotRegistered: return new NotImplemented();
    case IVaultStatus.FunctionNotFound: return new NotImplemented();
    case IVaultStatus.NoActiveCommand: return new StateViolation();
    case IVaultStatus.Aborted: return new Aborted();

    case BriefcaseStatus.CannotAcquire: return new OperationFailed();
    case BriefcaseStatus.CannotDownload: return new OperationFailed();
    case BriefcaseStatus.CannotUpload: return new OperationFailed();
    case BriefcaseStatus.CannotCopy: return new OperationFailed();
    case BriefcaseStatus.CannotDelete: return new OperationFailed();
    case BriefcaseStatus.VersionNotFound: return new NotFound();
    case BriefcaseStatus.CannotApplyChanges: return new OperationFailed();
    case BriefcaseStatus.DownloadCancelled: return new Cancelled();
    case BriefcaseStatus.ContainsDeletedChangeSets: return new ValidationError();

    case RpcInterfaceStatus.Success: return new Success();
    case RpcInterfaceStatus.IncompatibleVersion: return new VersioningViolation();

    case ChangeSetStatus.Success: return new Success();
    case ChangeSetStatus.ApplyError: return new OperationFailed();
    case ChangeSetStatus.ChangeTrackingNotEnabled: return new NotEnabled();
    case ChangeSetStatus.CorruptedChangeStream: return new Corruption();
    case ChangeSetStatus.FileNotFound: return new NotFound();
    case ChangeSetStatus.FileWriteError: return new FileSystemError();
    case ChangeSetStatus.HasLocalChanges: return new StateViolation();
    case ChangeSetStatus.HasUncommittedChanges: return new StateViolation();
    case ChangeSetStatus.InvalidId: return new Corruption();
    case ChangeSetStatus.InvalidVersion: return new Corruption();
    case ChangeSetStatus.InDynamicTransaction: return new StateViolation();
    case ChangeSetStatus.IsCreatingChangeSet: return new StateViolation();
    case ChangeSetStatus.IsNotCreatingChangeSet: return new StateViolation();
    case ChangeSetStatus.MergePropagationError: return new OperationFailed();
    case ChangeSetStatus.NothingToMerge: return new NothingToDo();
    case ChangeSetStatus.NoTransactions: return new OperationFailed();
    case ChangeSetStatus.ParentMismatch: return new ValidationError();
    case ChangeSetStatus.SQLiteError: return new InternalError();
    case ChangeSetStatus.WrongBldDb: return new ValidationError();
    case ChangeSetStatus.CouldNotOpenBldDb: return new OperationFailed();
    case ChangeSetStatus.MergeSchemaChangesOnOpen: return new BadRequest();
    case ChangeSetStatus.ReverseOrReinstateSchemaChanges: return new Conflict();
    case ChangeSetStatus.ProcessSchemaChangesOnOpen: return new BadRequest();
    case ChangeSetStatus.CannotMergeIntoReadonly: return new ValidationError();
    case ChangeSetStatus.CannotMergeIntoMaster: return new ValidationError();
    case ChangeSetStatus.CannotMergeIntoReversed: return new ValidationError();

    case RepositoryStatus.Success: return new Success();
    case RepositoryStatus.ServerUnavailable: return new NetworkError();
    case RepositoryStatus.LockAlreadyHeld: return new Conflict();
    case RepositoryStatus.SyncError: return new NetworkError();
    case RepositoryStatus.InvalidResponse: return new NetworkError();
    case RepositoryStatus.PendingTransactions: return new StateViolation();
    case RepositoryStatus.LockUsed: return new StateViolation();
    case RepositoryStatus.CannotCreateChangeSet: return new InternalError();
    case RepositoryStatus.InvalidRequest: return new NetworkError();
    case RepositoryStatus.ChangeSetRequired: return new StateViolation();
    case RepositoryStatus.CodeUnavailable: return new Conflict();
    case RepositoryStatus.CodeNotReserved: return new StateViolation();
    case RepositoryStatus.CodeUsed: return new StateViolation();
    case RepositoryStatus.LockNotHeld: return new Forbidden();
    case RepositoryStatus.RepositoryIsLocked: return new Locked();
    case RepositoryStatus.ChannelConstraintViolation: return new ConstraintViolation();

    case HttpStatus.Success: return new Success();

    case IVaultHubStatus.Success: return new Success();
    case IVaultHubStatus.Unknown: return new UnknownError();
    case IVaultHubStatus.MissingRequiredProperties: return new ValidationError();
    case IVaultHubStatus.InvalidPropertiesValues: return new ValidationError();
    case IVaultHubStatus.UserDoesNotHavePermission: return new PermissionsViolation();
    case IVaultHubStatus.UserDoesNotHaveAccess: return new PermissionsViolation();
    case IVaultHubStatus.InvalidBriefcase: return new ValidationError();
    case IVaultHubStatus.BriefcaseDoesNotExist: return new NotFound();
    case IVaultHubStatus.BriefcaseDoesNotBelongToUser: return new PermissionsViolation();
    case IVaultHubStatus.AnotherUserPushing: return new StateViolation();
    case IVaultHubStatus.ChangeSetAlreadyExists: return new Conflict();
    case IVaultHubStatus.ChangeSetDoesNotExist: return new NotFound();
    case IVaultHubStatus.FileIsNotUploaded: return new StateViolation();
    case IVaultHubStatus.iVaultIsNotInitialized: return new StateViolation();
    case IVaultHubStatus.ChangeSetPointsToBadSeed: return new InvalidData();
    case IVaultHubStatus.OperationFailed: return new OperationFailed();
    case IVaultHubStatus.PullIsRequired: return new StateViolation();
    case IVaultHubStatus.MaximumNumberOfBriefcasesPerUser: return new Throttled();
    case IVaultHubStatus.MaximumNumberOfBriefcasesPerUserPerMinute: return new Throttled();
    case IVaultHubStatus.DatabaseTemporarilyLocked: return new Locked();
    case IVaultHubStatus.iVaultIsLocked: return new Locked();
    case IVaultHubStatus.CodesExist: return new Conflict();
    case IVaultHubStatus.LocksExist: return new Conflict();
    case IVaultHubStatus.iVaultAlreadyExists: return new Conflict();
    case IVaultHubStatus.iVaultDoesNotExist: return new NotFound();
    case IVaultHubStatus.FileDoesNotExist: return new NotFound();
    case IVaultHubStatus.FileAlreadyExists: return new Conflict();
    case IVaultHubStatus.LockDoesNotExist: return new NotFound();
    case IVaultHubStatus.LockOwnedByAnotherBriefcase: return new Conflict();
    case IVaultHubStatus.CodeStateInvalid: return new StateViolation();
    case IVaultHubStatus.CodeReservedByAnotherBriefcase: return new Conflict();
    case IVaultHubStatus.CodeDoesNotExist: return new NotFound();
    case IVaultHubStatus.EventTypeDoesNotExist: return new NotFound();
    case IVaultHubStatus.EventSubscriptionDoesNotExist: return new NotFound();
    case IVaultHubStatus.EventSubscriptionAlreadyExists: return new StateViolation();
    case IVaultHubStatus.SZEWTwinIdIsNotSpecified: return new ValidationError();
    case IVaultHubStatus.FailedToGetSZEWTwinPermissions: return new OperationFailed();
    case IVaultHubStatus.FailedToGetSZEWTwinMembers: return new OperationFailed();
    case IVaultHubStatus.ChangeSetAlreadyHasVersion: return new Conflict();
    case IVaultHubStatus.VersionAlreadyExists: return new Conflict();
    case IVaultHubStatus.JobSchedulingFailed: return new InternalError();
    case IVaultHubStatus.ConflictsAggregate: return new Conflict();
    case IVaultHubStatus.FailedToGetSZEWTwinById: return new OperationFailed();
    case IVaultHubStatus.DatabaseOperationFailed: return new OperationFailed();
    case IVaultHubStatus.SeedFileInitializationFailed: return new OperationFailed();
    case IVaultHubStatus.FailedToGetAssetPermissions: return new OperationFailed();
    case IVaultHubStatus.FailedToGetAssetMembers: return new OperationFailed();
    case IVaultHubStatus.SZEWTwinDoesNotExist: return new NotFound();
    case IVaultHubStatus.LockChunkDoesNotExist: return new NotFound();
    case IVaultHubStatus.CheckpointAlreadyExists: return new Conflict();
    case IVaultHubStatus.CheckpointDoesNotExist: return new NotFound();
    case IVaultHubStatus.UndefinedArgumentError: return new ValidationError();
    case IVaultHubStatus.InvalidArgumentError: return new ValidationError();
    case IVaultHubStatus.MissingDownloadUrlError: return new ValidationError();
    case IVaultHubStatus.NotSupportedInBrowser: return new NotSupported();
    case IVaultHubStatus.FileHandlerNotSet: return new NotImplemented();
    case IVaultHubStatus.FileNotFound: return new NotFound();
    case IVaultHubStatus.InitializationTimeout: return new Timeout();

    case GeoServiceStatus.Success: return new Success();
    case GeoServiceStatus.NoGeoLocation: return new ValidationError();
    case GeoServiceStatus.OutOfUsefulRange: return new ValidationError();
    case GeoServiceStatus.OutOfMathematicalDomain: return new ValidationError();
    case GeoServiceStatus.NoDatumConverter: return new OperationFailed();
    case GeoServiceStatus.VerticalDatumConvertError: return new OperationFailed();
    case GeoServiceStatus.CSMapError: return new InternalError();
    case GeoServiceStatus.Pending: return new Pending(); // eslint-disable-line @typescript-eslint/no-deprecated

    case RealityDataStatus.Success: return new Success();
    case RealityDataStatus.InvalidData: return new InvalidData();

    default: return new UnknownError();
  }
}
