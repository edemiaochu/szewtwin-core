/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */

import { GuidString, SZEWTwinError } from "@szewtwin/core-szewec";

/**
 * An error originating from the [SQLiteDb]($backend) API.
 * @beta
 */
export interface SqliteError extends SZEWTwinError {
  /** The name of the database for this problem. */
  dbName: string;
}

/** @beta */
export namespace SqliteError {
  export const scope = "szewtwin-Sqlite";
  export type Key =
    "already-open" |
    "incompatible-version" |
    "invalid-versions-property" |
    "readonly";

  /** Determine whether an error object is a SqliteError */
  export function isError(error: unknown, key?: Key): error is SqliteError {
    return SZEWTwinError.isError<SqliteError>(error, scope, key) && typeof error.dbName === "string";
  }

  /** Instantiate and throw a SqliteError */
  export function throwError(key: Key, message: string, dbName: string): never {
    SZEWTwinError.throwError<SqliteError>({ szewTwinErrorId: { scope, key }, message, dbName });
  }
}

/**
 * An error originating from the [CloudSqlite]($backend) API.
 * @beta
 */
export interface CloudSqliteError extends SZEWTwinError {
  /** The name of the database that generated the error */
  readonly dbName?: string;
  /** The name of the container associated with the error */
  readonly containerId?: string;
}

/** @beta */
export namespace CloudSqliteError {
  export const scope = "szewtwin-CloudSqlite";
  export type Key =
    "already-published" |
    "copy-error" |
    "invalid-name" |
    "no-version-available" |
    "not-a-function" |
    "service-not-available" |
    /** The write lock cannot be acquired because it is currently held by somebody else.
     * @see WriteLockHeld for details
     */
    "write-lock-held" |
    /** The write lock on a container is not held, but is required for this operation */
    "write-lock-not-held";

  /** thrown when an attempt to acquire the write lock for a container fails because the lock is already held by somebody else ("write-lock-held").  */
  export interface WriteLockHeld extends CloudSqliteError {
    /** @internal */
    errorNumber: number;
    /** moniker of user currently holding container's lock */
    lockedBy: string;
    /** time the lock expires */
    expires: string;
  }

  /** Determine whether an error object is a CloudSqliteError */
  export function isError<T extends CloudSqliteError>(error: unknown, key?: Key): error is T {
    return SZEWTwinError.isError<T>(error, scope, key);
  }

  /** Instantiate and throw a CloudSqliteError */
  export function throwError<T extends CloudSqliteError>(key: Key, e: Omit<T, "name" | "szewTwinErrorId">): never {
    SZEWTwinError.throwError<CloudSqliteError>({ ...e, szewTwinErrorId: { scope, key } });
  }
}

/** Errors thrown by the [ViewStore]($backend) API.
 * @beta
 */
export interface ViewStoreError extends SZEWTwinError {
  /** The name of the ViewStore that generated the error */
  viewStoreName?: string;
}

/** @beta */
export namespace ViewStoreError {
  export const scope = "szewtwin-ViewStore";
  export type Key =
    "invalid-value" |
    "invalid-member" |
    "no-owner" |
    "not-found" |
    "not-unique" |
    "no-viewstore" |
    "group-error";

  /** Determine whether an error object is a ViewStoreError */
  export function isError<T extends ViewStoreError>(error: unknown, key?: Key): error is T {
    return SZEWTwinError.isError<T>(error, scope, key);
  }

  /** Instantiate and throw a ViewStoreError */
  export function throwError<T extends ViewStoreError>(key: Key, e: Omit<T, "name" | "szewTwinErrorId">): never {
    SZEWTwinError.throwError<ViewStoreError>({ ...e, szewTwinErrorId: { scope, key } });
  }
}

/**
 * Errors thrown by the [Workspace]($backend) APIs.
 * @beta
 */
export namespace WorkspaceError {
  export const scope = "szewtwin-Workspace";
  export type Key =
    "already-exists" |
    "container-exists" |
    "does-not-exist" |
    "invalid-name" |
    "no-cloud-container" |
    "load-error" |
    "load-errors" |
    "resource-exists" |
    "too-large" |
    "write-error";

  /** Determine whether an error object is a WorkspaceError */
  export function isError<T extends SZEWTwinError>(error: unknown, key?: Key): error is T {
    return SZEWTwinError.isError<T>(error, scope, key);
  }

  export function throwError<T extends SZEWTwinError>(key: Key, e: Omit<T, "name" | "szewTwinErrorId">): never {
    SZEWTwinError.throwError<SZEWTwinError>({ ...e, szewTwinErrorId: { key, scope } });
  }
}

/**
 * Errors thrown by szewTwin settings container APIs.
 * @beta
 */
export interface SZEWTwinSettingsError extends SZEWTwinError {
  /** The szewTwin associated with this settings error, when available. */
  readonly szewTwinId?: GuidString;
  /** The priority associated with this settings error, when available. */
  readonly priority?: number;
}

/** @beta */
export namespace SZEWTwinSettingsError {
  export const scope = "szewtwin-settings";
  export type Key =
    "failed-to-obtain-container-token" |
    "multiple-szewtwin-settings-containers" |
    "no-cloud-container" |
    "blob-service-unavailable" |
    "invalid-priority" |
    "unknown-setting";

  /** Determine whether an error object is an SZEWTwinSettingsError. */
  export function isError(error: unknown, key?: Key): error is SZEWTwinSettingsError {
    return SZEWTwinError.isError<SZEWTwinSettingsError>(error, scope, key);
  }

  /** Instantiate and throw an SZEWTwinSettingsError. */
  export function throwError<T extends SZEWTwinSettingsError>(key: Key, e: Omit<T, "name" | "szewTwinErrorId">): never {
    SZEWTwinError.throwError<SZEWTwinSettingsError>({ ...e, szewTwinErrorId: { scope, key } });
  }
}


/** Errors originating from the [ChannelControl]($backend) interface.
 * @beta
 */
export interface ChannelControlError extends SZEWTwinError {
  /** The channel key that caused the error. */
  readonly channelKey: string;
}

/** @beta */
export namespace ChannelControlError {
  /** the SZEWTwinError scope for `ChannelControlError`s. */
  export const scope = "szewtwin-ChannelControl";

  /** Keys that identify `ChannelControlError`s */
  export type Key =
    /** an attempt to create a channel within an existing channel */
    "may-not-nest" |
    /** an attempt to use a channel that was not "allowed" */
    "not-allowed" |
    /** the root channel already exists */
    "root-exists";

  /** Instantiate and throw a ChannelControlError */
  export function throwError(key: Key, message: string, channelKey: string): never {
    SZEWTwinError.throwError<ChannelControlError>({ szewTwinErrorId: { scope, key }, message, channelKey });
  }
  /** Determine whether an error object is a ChannelControlError */
  export function isError(error: unknown, key?: Key): error is ChannelControlError {
    return SZEWTwinError.isError<ChannelControlError>(error, scope, key) && typeof error.channelKey === "string";
  }
}

/**
 * An error originating from the [EditTxn]($backend) API.
 * @beta
 */
export interface EditTxnError extends SZEWTwinError {
  /** The iVault key associated with the error. */
  readonly iVaultKey?: string;
  /** The description of the EditTxn that caused the error, if applicable. */
  readonly description?: string;
}

/** @beta */
export namespace EditTxnError {
  /** the SZEWTwinError scope for `EditTxnError`s. */
  export const scope = "szewtwin-EditTxn";

  /** Keys that identify `EditTxnError`s */
  export type Key =
    /** an attempt to start an EditTxn when one is already active */
    "already-active" |
    /** an attempt to modify an iVault through the implicit transaction when explicit transactions are enforced */
    "implicit-txn-write-disallowed" |
    /** an attempt to start an EditTxn when unsaved changes are already present */
    "unsaved-changes" |
    /** an attempt to perform an operation that requires an active EditTxn when none is active */
    "not-active" |
    /** an attempt to use an EditTxn with the wrong iVault */
    "wrong-ivault";

  /** Instantiate and throw an EditTxnError */
  export function throwError(key: Key, message: string, iVaultKey?: string, description?: string): never {
    SZEWTwinError.throwError<EditTxnError>({ szewTwinErrorId: { scope, key }, message, iVaultKey, description });
  }

  /** Determine whether an error object is an EditTxnError */
  export function isError(error: unknown, key?: Key): error is EditTxnError {
    return SZEWTwinError.isError<EditTxnError>(error, scope, key);
  }
}

/** Errors originating from the server-based implementation of the [LockControl]($backend) interface.
 * @beta
 */
export namespace ServerBasedLocksError {
  /** the SZEWTwinError scope for `ServerBasedLocksError`s. */
  export const scope = "szewtwin-ServerBasedLocks";

  /** Keys that identify `ServerBasedLocksError`s */
  export type Key =
    /** The briefcase contains unsaved changes */
    "has-unsaved-changes" |
    /** A SQLite error occurred while reading or writing the "locks" database */
    "lock-database-problem" |
    /** The specified Txn ID is not known to the TxnManager */
    "txn-id-not-found" |
    /** Attempted to abandon locks for a Txn that has not yet been reversed */
    "txn-not-reversed";

  /** Instantiate and throw a ServerBasedLocksError */
  export function throwError(key: Key, message: string): never {
    SZEWTwinError.throwError<SZEWTwinError>({ szewTwinErrorId: { scope, key }, message });
  }
  /** Determine whether an error object is a ServerBasedLocksError */
  export function isError(error: unknown, key?: Key): error is SZEWTwinError {
    return SZEWTwinError.isError<SZEWTwinError>(error, scope, key);
  }
}
