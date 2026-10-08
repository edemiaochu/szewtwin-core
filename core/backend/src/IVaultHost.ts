/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IVaultHost
 */

// To avoid circular load errors, the "Element" classes must be loaded before IVaultHost.
import "./IVaultDb"; // DO NOT REMOVE OR MOVE THIS LINE!

import { IVaultNative, loadNativePlatform } from "./internal/NativePlatform";
import * as os from "node:os";
import { NativeLibrary } from "@szewec/ivaultjs-native";
import { AccessToken, assert, BeEvent, SzewecStatus, DbResult, Guid, GuidString, IVaultStatus, Logger, Mutable, ProcessDetector } from "@szewtwin/core-szewec";
import { AuthorizationClient, IVaultError, SZEWTwinSettingsError, LocalDirName, SessionProps } from "@szewtwin/core-common";
import { AzureServerStorage, AzureServerStorageConfig, BlobServiceClientWrapper } from "@szewtwin/object-storage-azure";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import type { ServerStorage } from "@szewtwin/object-storage-core";
import { BackendHubAccess, CreateNewIVaultProps } from "./BackendHubAccess";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BisCoreSchema } from "./BisCoreSchema";
import { BriefcaseManager } from "./BriefcaseManager";
import { CloudSqlite } from "./CloudSqlite";
import { FunctionalSchema } from "./domains/FunctionalSchema";
import { GenericSchema } from "./domains/GenericSchema";
import { EditTxn } from "./EditTxn";
import { GeoCoordConfig } from "./GeoCoordConfig";
import { IVaultJsFs } from "./IVaultJsFs";
import { DevToolsRpcImpl } from "./rpc-impl/DevToolsRpcImpl";
import { IVaultReadRpcImpl } from "./rpc-impl/IVaultReadRpcImpl";
import { IVaultTileRpcImpl } from "./rpc-impl/IVaultTileRpcImpl";
import { SnapshotIVaultRpcImpl } from "./rpc-impl/SnapshotIVaultRpcImpl";
import { initializeRpcBackend } from "./RpcBackend";
import { TileStorage } from "./TileStorage";
import { type Setting, SettingsContainer, SettingsDictionary, SettingsPriority } from "./workspace/Settings";
import { settingsWorkspaceDbName } from "./workspace/SettingsDb";
import { SettingsContainers, SettingsEditor } from "./workspace/SettingsEditor";
import { SettingsSchemas } from "./workspace/SettingsSchemas";
import { Workspace, WorkspaceDbLoadError, WorkspaceDbSettingsProps, WorkspaceOpts } from "./workspace/Workspace";
import { join, normalize as normalizeDir } from "path";
import { constructWorkspace, OwnedWorkspace, throwWorkspaceDbLoadErrors } from "./internal/workspace/WorkspaceImpl";
import { SettingsImpl } from "./internal/workspace/SettingsImpl";
import { constructSettingsSchemas } from "./internal/workspace/SettingsSchemasImpl";
import { _getHubAccess, _hubAccess, _setHubAccess } from "./internal/Symbols";

const loggerCategory = BackendLoggerCategory.IVaultHost;

// cspell:ignore nodereport fatalerror apicall alicloud rpcs

/** @internal */
export interface CrashReportingConfigNameValuePair {
  name: string;
  value: string;
}

/** Configuration of the crash-reporting system.
 * @internal
 */
export interface CrashReportingConfig {
  /** The directory to which *.dmp and/or iVaultJsNativeCrash*.properties.txt files are written. This directory will be created if it does not already exist. */
  crashDir: string;
  /** max # .dmp files that may exist in crashDir. The default is 50. */
  maxDumpsInDir?: number;
  /** Enable crash-dumps? If so, .dmp and .properties.txt files will be generated and written to crashDir in the event of an unhandled native-code exception. If not, only .properties.txt files will be written. The default is false. */
  enableCrashDumps?: boolean;
  /** If enableCrashDumps is true, do you want a full-memory dump? Defaults to false. */
  wantFullMemoryDumps?: boolean;
  /** Enable Node.js crash reporting? If so, report files will be generated in the event of an unhandled exception or fatal error and written to crashDir. The default is false. */
  enableNodeReport?: boolean;
  /** Additional name, value pairs to write to iVaultJsNativeCrash*.properties.txt file in the event of a crash. */
  params?: CrashReportingConfigNameValuePair[];
  /** Run this .js file to process .dmp and Node.js crash reporting .json files in the event of a crash.
   * This script will be executed with a single command-line parameter: the name of the dump or Node.js report file.
   * In the case of a dump file, there will be a second file with the same basename and the extension ".properties.txt".
   * Since it runs in a separate process, this script will have no access to the Javascript
   * context of the exiting backend. No default.
   */
  dumpProcessorScriptFileName?: string;
  /** Upload crash dump and node-reports to Szewec's crash-reporting service? Defaults to false */
  uploadToSzewec?: boolean;
}

/** @beta */
export interface AzureBlobStorageCredentials {
  account: string;
  accessKey: string;
  baseUrl?: string;
}

/** Controls how iVault writes through the implicit transaction are enforced.
 *
 * Allowed values:
 * - "allow": preserve pre-version 5.8.0 behavior for backwards compatibility.
 * - "log": allow the operation but log each implicit write as an error case.
 * - "throw": reject writes through the implicit transaction and require explicit EditTxns.
 * @beta
 */
export type ImplicitWriteEnforcement = "allow" | "log" | "throw";

/**
 * Options for [[IVaultHost.startup]]
 * @public
 */
export interface IVaultHostOptions {
  /**
   * The name of the *Profile* subdirectory of [[cacheDir]] for this process. If not present, "default" is used.
   * @see [[IVaultHost.profileName]]
   * @beta
   */
  profileName?: string;

  /**
   * Root of the directory holding all the files that szewTwin.js caches
   * - If not specified at startup a platform specific default is used -
   *   - Windows: $(HOMEDIR)/AppData/Local/iVaultJs/
   *   - Mac/iOS: $(HOMEDIR)/Library/Caches/iVaultJs/
   *   - Linux:   $(HOMEDIR)/.cache/iVaultJs/
   *   where $(HOMEDIR) is documented [here](https://nodejs.org/api/os.html#os_os_homedir)
   * - if specified, ensure it is set to a folder with read/write access.
   * @see [[IVaultHost.cacheDir]] for the value it's set to after startup
   */
  cacheDir?: LocalDirName;

  /** The directory where application assets are found. */
  appAssetsDir?: LocalDirName;

  /**
   * Options for creating the [[IVaultHost.appWorkspace]]
   * @beta
   */
  workspace?: WorkspaceOpts;

  /**
   * The kind of iVault hub server to use.
   */
  hubAccess?: BackendHubAccess;

  /** The Azure blob storage credentials to use for the tile cache service. If omitted and no external service implementation is provided, a local cache will be used.
   * @beta
   */
  tileCacheAzureCredentials?: AzureBlobStorageCredentials;

  /**
   * @beta
   * @note A reference implementation is set for AzureServerStorage from @szewtwin/object-storage-azure if [[tileCacheAzureCredentials]] property is set. To supply a different implementation for any service provider (such as AWS),
   *       set this property with a custom ServerStorage.
   */
  tileCacheStorage?: ServerStorage;

  /** The maximum size in bytes to which a local sqlite database used for caching tiles can grow before it is purged of least-recently-used tiles.
   * The local cache is used only if an external cache has not been configured via [[tileCacheStorage]], and [[tileCacheAzureCredentials]].
   * Defaults to 1 GB. Must be an unsigned integer. A value of zero disables the local cache entirely.
   * @beta
   */
  maxTileCacheDbSize?: number;

  /** Whether to restrict tile cache URLs by client IP address (if available).
   * @beta
   */
  restrictTileUrlsByClientIp?: boolean;

  /** Whether to enable OpenTelemetry tracing.
   * Defaults to `false`.
   */
  enableOpenTelemetry?: boolean;

  /** Whether to compress cached tiles.
   * Defaults to `true`.
   */
  compressCachedTiles?: boolean;

  /** The time, in milliseconds, for which [IVaultTileRpcInterface.requestTileTreeProps]($common) should wait before returning a "pending" status.
   * @internal
   */
  tileTreeRequestTimeout?: number;

  /** The time, in milliseconds, for which [IVaultTileRpcInterface.requestTileContent]($common) should wait before returning a "pending" status.
   * @internal
   */
  tileContentRequestTimeout?: number;

  /** The backend will log when a tile took longer to load than this threshold in seconds.
   * @internal
   */
  logTileLoadTimeThreshold?: number;

  /** The backend will log when a tile is loaded with a size in bytes above this threshold.
   * @internal
   */
  logTileSizeThreshold?: number;

  /** Crash-reporting configuration
   * @internal
   */
  crashReportingConfig?: CrashReportingConfig;

  /** The AuthorizationClient used to obtain [AccessToken]($szewec)s. */
  authorizationClient?: AuthorizationClient;

  /**
   * Automatically enable shared channel when opening iVaults for read/write (see [Working With Channels]($docs/learning/backend/Channel.md)).
   * If not present, defaults to `true` for backwards compatibility. This means that the shared channel may be edited by default. Generally
   * that is undesirable because it allows applications to "accidentally" modify data it shouldn't be allowed to modify. Unfortunately the
   * previous versions of szewTwin.js allowed it so this is necessary so they won't break.
   * Will be changed to default to `false` in 5.0.
   */
  allowSharedChannel?: boolean;

  /**
   * Setting this to true will revert to the previous behavior of using the native side for all CRUD operations.
   * While set to false, the getElement(), getModel() and getAspect() functions will use a thinned down native workflow to read the entities from the database.
   * This workflow performs work previously done on the native side in the TS side, resulting in performance improvements, if errors are detected,
   * this option can be set to true to revert to old workflow.
   */
  disableThinnedNativeInstanceWorkflow?: boolean;

  /**
   * Configuration controlling whether to disable the creation of restore points during pull/merge operations.
   * @beta
   */
  disableRestorePointOnPullMerge?: true;
  /**
   * Configuration controlling whether incremental schema loading is enabled or disabled.
   * @beta
   */
  incrementalSchemaLoading?: "enabled" | "disabled";
  /**
   * Configuration controlling whether to use semantic rebase or not.
   * @beta
   */
  useSemanticRebase?: boolean;

  /**
    * Controls how writes through the implicit transaction are enforced.
    * See [[ImplicitWriteEnforcement]] for the allowed values.
    * Defaults to "allow" for backwards compatibility.
   * @beta
   */
  implicitWriteEnforcement?: ImplicitWriteEnforcement;
}

/** Configuration of core-backend.
 * @public
 */
export class IVaultHostConfiguration implements IVaultHostOptions {
  public static defaultTileRequestTimeout = 20 * 1000;
  public static defaultLogTileLoadTimeThreshold = 40;
  public static defaultLogTileSizeThreshold = 20 * 1000000;
  /** @internal */
  public static defaultMaxTileCacheDbSize = 1024 * 1024 * 1024;
  public appAssetsDir?: LocalDirName;
  public cacheDir?: LocalDirName;

  /** @beta */
  public workspace?: WorkspaceOpts;
  public hubAccess?: BackendHubAccess;
  /** The AuthorizationClient used to obtain [AccessToken]($szewec)s. */
  public authorizationClient?: AuthorizationClient;
  /** @beta */
  public restrictTileUrlsByClientIp?: boolean;
  public compressCachedTiles?: boolean;
  /** @beta */
  public tileCacheAzureCredentials?: AzureBlobStorageCredentials;
  /** @internal */
  public tileTreeRequestTimeout = IVaultHostConfiguration.defaultTileRequestTimeout;
  /** @internal */
  public tileContentRequestTimeout = IVaultHostConfiguration.defaultTileRequestTimeout;
  /** @internal */
  public logTileLoadTimeThreshold = IVaultHostConfiguration.defaultLogTileLoadTimeThreshold;
  /** @internal */
  public logTileSizeThreshold = IVaultHostConfiguration.defaultLogTileSizeThreshold;
  /** @internal */
  public crashReportingConfig?: CrashReportingConfig;
  /**
   * Configuration controlling whether to use the thinned down native instance functions for element, model, and aspect CRUD operations
   * or use the previous behavior of using the native side for all CRUD operations. Set to true to revert to the previous behavior.
   * @beta
  */
  public disableThinnedNativeInstanceWorkflow?: boolean;

  /**
   * Configuration controlling whether to disable the creation of restore points during pull/merge operations.
   * @beta
   */
  public disableRestorePointOnPullMerge?: true;
  /**
   * Configuration controlling whether incremental schema loading is disabled.
   * Default is "disabled" at the moment to preserve existing behavior.
   * @beta
   */
  public incrementalSchemaLoading: "enabled" | "disabled" = "disabled";
  /**
   * Configuration controlling whether to use semantic rebase or not. By default it is undefined meaning semantic rebase is not used.
   * @beta
   */
  public useSemanticRebase?: boolean;
  /**
    * Controls how writes through the implicit transaction are enforced.
    * See [[IVaultHostOptions.implicitWriteEnforcement]] for the meaning of each allowed value.
   * @beta
   */
  public implicitWriteEnforcement: ImplicitWriteEnforcement = "allow";
}

/**
 * Settings for `IVaultHost.appWorkspace`.
 * @note this includes the default dictionary from the SettingsSpecRegistry
 */
class ApplicationSettings extends SettingsImpl {
  private _remove?: VoidFunction;
  protected override verifyPriority(priority: SettingsPriority) {
    if (priority > SettingsPriority.application) // only application or lower may appear in ApplicationSettings
      throw new Error("Use IVaultSettings");
  }
  private updateDefaults() {
    const defaults: SettingsContainer = {};
    for (const [schemaName, val] of IVaultHost.settingsSchemas.settingDefs) {
      if (val.default)
        defaults[schemaName] = val.default;
    }
    this.addDictionary({ name: "_default_", priority: 0 }, defaults);
  }

  public constructor() {
    super();
    this._remove = IVaultHost.settingsSchemas.onSchemaChanged.addListener(() => this.updateDefaults());
    this.updateDefaults();
  }

  public override close() {
    if (this._remove) {
      this._remove();
      this._remove = undefined;
    }
  }
}

/**
 * Settings for an szewTwin. May only include settings priority for szewTwin and organization.
 */
class SZEWTwinWorkspaceSettings extends SettingsImpl {
  protected override verifyPriority(priority: SettingsPriority) {
    if (priority <= SettingsPriority.application)
      SZEWTwinSettingsError.throwError("invalid-priority", { message: `Settings with priority ${priority} cannot be added to an szewTwin workspace.` });
    if (priority > SettingsPriority.szewTwin)
      SZEWTwinSettingsError.throwError("invalid-priority", { message: `Settings with priority ${priority} cannot be added to an szewTwin workspace.` });
  }

  public override * getSettingEntries<T extends Setting>(name: string): Iterable<{ value: T, dictionary: SettingsDictionary }> {
    yield* super.getSettingEntries(name);
    yield* IVaultHost.appWorkspace.settings.getSettingEntries(name);
  }
}

const definedInStartup = <T>(obj: T | undefined): T => {
  if (obj === undefined)
    throw new Error("IVaultHost.startup must be called first");
  return obj;
};

/** IVaultHost initializes ($backend) and captures its configuration. A backend must call [[IVaultHost.startup]] before using any backend classes.
 * See [the learning article]($docs/learning/backend/IVaultHost.md)
 * @public
 */
export class IVaultHost {
  private constructor() { }

  /** The AuthorizationClient used to obtain [AccessToken]($szewec)s. */
  public static authorizationClient?: AuthorizationClient;

  public static backendVersion = "";
  private static _profileName: string;
  private static _cacheDir = "";
  private static _settingsSchemas?: SettingsSchemas;
  private static _appWorkspace?: OwnedWorkspace;

  // Omit the hubAccess field from configuration so it stays internal.
  public static configuration?: Omit<IVaultHostOptions, "hubAccess">;

  /**
   * The name of the *Profile* directory (a subdirectory of "[[cacheDir]]/profiles/") for this process.
   *
   * The *Profile* directory is used to cache data that is specific to a type-of-usage of the szewTwin.js library.
   * It is important that information in the profile cache be consistent but isolated across sessions (i.e.
   * data for a profile is maintained between runs, but each profile is completely independent and
   * unaffected by the presence or use of others.)
   * @note **Only one process at a time may be using a given profile**, and an exception will be thrown by [[startup]]
   * if a second process attempts to use the same profile.
   * @beta
   */
  public static get profileName(): string {
    return this._profileName;
  }

  /** The full path of the Profile directory.
   * @see [[profileName]]
   * @beta
   */
  public static get profileDir(): LocalDirName {
    return join(this._cacheDir, "profiles", this._profileName);
  }

  /** Event raised during startup to allow loading settings data */
  public static readonly onWorkspaceStartup = new BeEvent<() => void>();

  /** Event raised just after the backend IVaultHost was started */
  public static readonly onAfterStartup = new BeEvent<() => void>();

  /** Event raised just before the backend IVaultHost is to be shut down */
  public static readonly onBeforeShutdown = new BeEvent<() => void>();

  /** @internal */
  public static readonly session: Mutable<SessionProps> = { applicationId: "2686", applicationVersion: "1.0.0", sessionId: "" };

  /** A uniqueId for this session */
  public static get sessionId() { return this.session.sessionId; }
  public static set sessionId(id: GuidString) { this.session.sessionId = id; }

  /** The Id of this application - needs to be set only if it is an agent application. The applicationId will otherwise originate at the frontend. */
  public static get applicationId() { return this.session.applicationId; }
  public static set applicationId(id: string) { this.session.applicationId = id; }

  /** The version of this application - needs to be set if is an agent application. The applicationVersion will otherwise originate at the frontend. */
  public static get applicationVersion() { return this.session.applicationVersion; }
  public static set applicationVersion(version: string) { this.session.applicationVersion = version; }

  /** A string that can identify the current user to other users when collaborating. */
  public static userMoniker = "unknown";

  /** Root directory holding files that szewTwin.js caches */
  public static get cacheDir(): LocalDirName { return this._cacheDir; }

  /** The application [[Workspace]] for this `IVaultHost`
   * @note this `Workspace` only holds [[WorkspaceContainer]]s and [[Settings]] scoped to the currently loaded application(s).
   * All organization, szewTwin, and iVault based containers or settings must be accessed through [[IVaultDb.workspace]] and
   * attempting to add them to this Workspace will fail.
   * @beta
   */
  public static get appWorkspace(): Workspace { return definedInStartup(this._appWorkspace); }

  /** Obtain the [[Workspace]] for an szewTwin by discovering its settings container.
   * All named dictionary resources in the container's [[WorkspaceDb]] are loaded into the workspace at [[SettingsPriority.szewTwin]].
   * @note This method requires an internet connection to discover the container.
   * To use an szewTwin workspace offline, use the overload that accepts [[WorkspaceDbSettingsProps]].
   * @note The returned workspace is caller-owned. Call `close` when finished.
   * @beta
   */
  public static async getSZEWTwinWorkspace(szewTwinId: GuidString): Promise<OwnedWorkspace>;
  /** Obtain the [[Workspace]] for an szewTwin.
   * The supplied [[WorkspaceDbSettingsProps]] are passed directly to [[Workspace.loadSettingsDictionary]].
    * @note You can derive these from the `settingsSources` property on a previously returned workspace.
    * @note The returned workspace is caller-owned. Call `close` when finished.
   * @beta
   */
  public static async getSZEWTwinWorkspace(props: WorkspaceDbSettingsProps | WorkspaceDbSettingsProps[]): Promise<OwnedWorkspace>;
  /** @internal */
  public static async getSZEWTwinWorkspace(args: GuidString | WorkspaceDbSettingsProps | WorkspaceDbSettingsProps[]): Promise<OwnedWorkspace> {
    const isSZEWTwinId = typeof args === "string";
    const workspace = constructWorkspace(new SZEWTwinWorkspaceSettings());

    try {
      const settingsSources = isSZEWTwinId ? await SettingsContainers.getSZEWTwinSettingsSources(args) : args;
      if (undefined === settingsSources)
        return workspace;

      workspace.settingsSources = settingsSources;

      const problems: WorkspaceDbLoadError[] = [];
      await workspace.loadSettingsDictionary(settingsSources, problems);

      if (problems.length > 0) {
        const label = isSZEWTwinId ? `szewTwin '${args}'` : "the supplied settings workspace db properties";
        throwWorkspaceDbLoadErrors(`attempting to load workspace settings for ${label}`, problems);
      }

      return workspace;
    } catch (error) {
      workspace.close();
      throw error;
    }
  }

  /** Save a named [[SettingsDictionary]] to the szewTwin's settings container.
   * If no szewTwin settings container exists for `szewTwinId`, one is created.
   * The dictionary is stored as a named resource in the container's default [[WorkspaceDb]], where `name` is used as the resource name.
   * @param szewTwinId The szewTwin whose settings container should be updated.
   * @param name The name of the dictionary, used as the resource name in the [[WorkspaceDb]].
   * @param settings The settings key-value pairs to store.
   * @note uses [[IVaultHost.userMoniker]] as the user name for acquiring the write lock on the settings container.
   * @beta
   */
  public static async saveSettingDictionary(szewTwinId: GuidString, name: string, settings: SettingsContainer): Promise<void> {
    const { editor, container } = await SettingsEditor.constructForSZEWTwin(szewTwinId);
    try {
      await container.withEditableDb(this.userMoniker, (db) => {
        db.updateSettingsResource(settings, name);
      }, { dbName: settingsWorkspaceDbName });
    } finally {
      editor.close();
    }
  }

  /** Delete a named [[SettingsDictionary]] from the szewTwin's settings container.
   * If no szewTwin settings container exists, this method does nothing.
   * @param szewTwinId The szewTwin whose settings container should be updated.
   * @param name The name of the dictionary (resource name) to delete.
   * @note uses [[IVaultHost.userMoniker]] as the user name for acquiring the write lock on the settings container.
   * @beta
   */
  public static async deleteSettingDictionary(szewTwinId: GuidString, name: string): Promise<void> {
    const settingsEditor = await SettingsEditor.getForSZEWTwin(szewTwinId);
    if (undefined === settingsEditor)
      return;

    const { editor, container } = settingsEditor;
    try {
      await container.withEditableDb(this.userMoniker, (db) => {
        db.removeString(name);
      }, { dbName: settingsWorkspaceDbName });
    } finally {
      editor.close();
    }
  }

  /** The registry of schemas describing the [[Setting]]s for the application session.
   * Applications should register their schemas via methods like [[SettingsSchemas.addGroup]].
   * @beta
   */
  public static get settingsSchemas(): SettingsSchemas { return definedInStartup(this._settingsSchemas); }

  /** The optional [[FileNameResolver]] that resolves keys and partial file names for snapshot iVaults.
   * @deprecated in 4.10 - will not be removed until after 2026-06-13. When opening a snapshot by file name, ensure to pass already resolved path. Using a key to open a snapshot is now deprecated.
   */
  public static snapshotFileNameResolver?: FileNameResolver; // eslint-disable-line @typescript-eslint/no-deprecated

  /** Get the current access token for this IVaultHost, or a blank string if none is available.
   * @note for web backends, this will *always* return a blank string because the backend itself has no token (but never needs one either.)
   * For all IpcHosts, where this backend is servicing a single frontend, this will be the user's token. For ElectronHost, the backend
   * obtains the token and forwards it to the frontend.
   * @note accessTokens expire periodically and are automatically refreshed, if possible. Therefore tokens should not be saved, and the value
   * returned by this method may change over time throughout the course of a session.
   */
  public static async getAccessToken(): Promise<AccessToken> {
    try {
      return (await IVaultHost.authorizationClient?.getAccessToken()) ?? "";
    } catch {
      return "";
    }
  }

  private static loadNative(options: IVaultHostOptions) {
    loadNativePlatform();

    if (options.crashReportingConfig && options.crashReportingConfig.crashDir && !ProcessDetector.isElectronAppBackend && !ProcessDetector.isMobileAppBackend) {
      IVaultNative.platform.setCrashReporting(options.crashReportingConfig);

      Logger.logTrace(loggerCategory, "Configured crash reporting", {
        enableCrashDumps: options.crashReportingConfig?.enableCrashDumps,
        wantFullMemoryDumps: options.crashReportingConfig?.wantFullMemoryDumps,
        enableNodeReport: options.crashReportingConfig?.enableNodeReport,
        uploadToSzewec: options.crashReportingConfig?.uploadToSzewec,
      });

      if (options.crashReportingConfig.enableNodeReport) {
        if (process.report !== undefined) {
          process.report.reportOnFatalError = true;
          process.report.reportOnUncaughtException = true;
          process.report.directory = options.crashReportingConfig.crashDir;
          Logger.logTrace(loggerCategory, "Configured Node.js crash reporting");
        } else {
          Logger.logWarning(loggerCategory, "Unable to configure Node.js crash reporting");
        }
      }
    }
  }

  /** @internal */
  public static tileStorage?: TileStorage;

  private static _hubAccess?: BackendHubAccess;
  /** @internal */
  public static [_setHubAccess](hubAccess: BackendHubAccess | undefined) { this._hubAccess = hubAccess; }

  /** get the current hubAccess, if present.
   * @internal
   */
  public static [_getHubAccess](): BackendHubAccess | undefined { return this._hubAccess; }

  /** Provides access to the IVaultHub for this IVaultHost
   * @internal
   * @note If [[IVaultHostOptions.hubAccess]] was undefined when initializing this class, accessing this property will throw an error.
   * To determine whether one is present, use [[_getHubAccess]].
   */
  public static get [_hubAccess](): BackendHubAccess {
    if (IVaultHost._hubAccess === undefined)
      throw new IVaultError(IVaultStatus.BadRequest, "No BackendHubAccess supplied in IVaultHostOptions");
    return IVaultHost._hubAccess;
  }

  private static initializeWorkspace(configuration: IVaultHostOptions) {
    const settingAssets = join(KnownLocations.packageAssetsDir, "Settings");
    this._settingsSchemas = constructSettingsSchemas();
    this._settingsSchemas.addDirectory(join(settingAssets, "Schemas"));
    this._appWorkspace = constructWorkspace(new ApplicationSettings(), configuration.workspace);

    // Create the CloudCache for Workspaces. This will fail if another process is already using the same profile.
    try {
      this.appWorkspace.getCloudCache();
    } catch (e: any) {
      throw (e.errorNumber === DbResult.BE_SQLITE_BUSY) ? new IVaultError(DbResult.BE_SQLITE_BUSY, `Profile [${this.profileDir}] is already in use by another process`) : e;
    }

    this.appWorkspace.settings.addDirectory(settingAssets, SettingsPriority.defaults);

    GeoCoordConfig.onStartup();
    // allow applications to load their default settings
    this.onWorkspaceStartup.raiseEvent();
  }

  private static _isValid = false;

  /** true between a successful call to [[startup]] and before [[shutdown]] */
  public static get isValid() {
    return IVaultHost._isValid;
  }

  /** This method must be called before any szewTwin.js services are used.
   * @param options Host configuration data.
   * Raises [[onAfterStartup]].
   * @see [[shutdown]].
   */
  public static async startup(options?: IVaultHostOptions): Promise<void> {
    if (this._isValid)
      return; // we're already initialized
    this._isValid = true;

    options = options ?? {};
    if (this.sessionId === "")
      this.sessionId = Guid.createValue();

    this.authorizationClient = options.authorizationClient;

    this.backendVersion = require("../../package.json").version; // eslint-disable-line @typescript-eslint/no-require-imports
    initializeRpcBackend(options.enableOpenTelemetry);

    this.loadNative(options);
    this.setupCacheDir(options);
    this.initializeWorkspace(options);
    EditTxn.implicitWriteEnforcement = options.implicitWriteEnforcement ?? "allow";
    BriefcaseManager.initialize(join(this._cacheDir, "ivaults"));

    [
      IVaultReadRpcImpl,
      IVaultTileRpcImpl,
      SnapshotIVaultRpcImpl, // eslint-disable-line @typescript-eslint/no-deprecated
      DevToolsRpcImpl,
    ].forEach((rpc) => rpc.register()); // register all of the RPC implementations

    [
      BisCoreSchema,
      GenericSchema,
      FunctionalSchema,
    ].forEach((schema) => schema.registerSchema()); // register all of the schemas

    const { hubAccess, ...otherOptions } = options;
    if (undefined !== hubAccess)
      this._hubAccess = hubAccess;

    this.configuration = otherOptions;
    this.setupTileCache();

    process.once("beforeExit", IVaultHost.shutdown);
    this.onAfterStartup.raiseEvent();
  }

  private static setupCacheDir(configuration: IVaultHostOptions) {
    this._cacheDir = normalizeDir(configuration.cacheDir ?? NativeLibrary.defaultCacheDir);
    IVaultJsFs.recursiveMkDirSync(this._cacheDir);

    this._profileName = configuration.profileName ?? "default";
    Logger.logInfo(loggerCategory, `cacheDir: [${this.cacheDir}], profileDir: [${this.profileDir}]`);
  }

  /** This method must be called when an szewTwin.js host is shut down. Raises [[onBeforeShutdown]] */
  public static async shutdown(this: void): Promise<void> {
    // Note: This method is set as a node listener where `this` is unbound. Call private method to
    // ensure `this` is correct. Don't combine these methods.
    return IVaultHost.doShutdown();
  }

  /**
   * Create a new iVault.
   * @returns the Guid of the newly created iVault.
   * @throws [IVaultError]($common) in case of errors.
   * @note If [[IVaultHostOptions.hubAccess]] was undefined in the call to [[startup]], this function will throw an error.
   */
  public static async createNewIVault(arg: CreateNewIVaultProps): Promise<GuidString> {
    return this[_hubAccess].createNewIVault(arg);
  }

  private static async doShutdown() {
    if (!this._isValid)
      return;

    this._isValid = false;
    this.onBeforeShutdown.raiseEvent();

    this.configuration = undefined;
    EditTxn.implicitWriteEnforcement = "allow";
    this.tileStorage = undefined;

    this._appWorkspace?.close();
    this._appWorkspace = undefined;
    this._settingsSchemas = undefined;

    CloudSqlite.CloudCaches.destroy();
    process.removeListener("beforeExit", IVaultHost.shutdown);
  }

  /**
   * Add or update a property that should be included in a crash report.
   * @internal
   */
  public static setCrashReportProperty(name: string, value: string): void {
    IVaultNative.platform.setCrashReportProperty(name, value);
  }

  /**
   * Remove a previously defined property so that will not be included in a crash report.
   * @internal
   */
  public static removeCrashReportProperty(name: string): void {
    IVaultNative.platform.setCrashReportProperty(name, undefined);
  }

  /**
   * Get all properties that will be included in a crash report.
   * @internal
   */
  public static getCrashReportProperties(): CrashReportingConfigNameValuePair[] {
    return IVaultNative.platform.getCrashReportProperties();
  }

  /** The directory where application assets may be found */
  public static get appAssetsDir(): string | undefined {
    return undefined !== IVaultHost.configuration ? IVaultHost.configuration.appAssetsDir : undefined;
  }

  /** The time, in milliseconds, for which IVaultTileRpcInterface.requestTileTreeProps should wait before returning a "pending" status.
   * @internal
   */
  public static get tileTreeRequestTimeout(): number {
    return IVaultHost.configuration?.tileTreeRequestTimeout ?? IVaultHostConfiguration.defaultTileRequestTimeout;
  }
  /** The time, in milliseconds, for which IVaultTileRpcInterface.requestTileContent should wait before returning a "pending" status.
   * @internal
   */
  public static get tileContentRequestTimeout(): number {
    return IVaultHost.configuration?.tileContentRequestTimeout ?? IVaultHostConfiguration.defaultTileRequestTimeout;
  }

  /** The backend will log when a tile took longer to load than this threshold in seconds. */
  public static get logTileLoadTimeThreshold(): number {
    return IVaultHost.configuration?.logTileLoadTimeThreshold ?? IVaultHostConfiguration.defaultLogTileLoadTimeThreshold;
  }
  /** The backend will log when a tile is loaded with a size in bytes above this threshold. */
  public static get logTileSizeThreshold(): number {
    return IVaultHost.configuration?.logTileSizeThreshold ?? IVaultHostConfiguration.defaultLogTileSizeThreshold;
  }

  /** Whether external tile caching is active.
   * @internal
   */
  public static get usingExternalTileCache(): boolean {
    return undefined !== IVaultHost.tileStorage;
  }

  /** Whether to restrict tile cache URLs by client IP address.
   * @internal
   */
  public static get restrictTileUrlsByClientIp(): boolean {
    return undefined !== IVaultHost.configuration && (IVaultHost.configuration.restrictTileUrlsByClientIp ? true : false);
  }

  /** Whether to compress cached tiles.
   * @internal
   */
  public static get compressCachedTiles(): boolean {
    return false !== IVaultHost.configuration?.compressCachedTiles;
  }

  /**
   * Whether to use semantic rebase or not.
   * @internal
   */
  public static get useSemanticRebase(): boolean {
    return undefined !== IVaultHost.configuration && (IVaultHost.configuration.useSemanticRebase ? true : false);
  }

  private static setupTileCache() {
    assert(undefined !== IVaultHost.configuration);
    const config = IVaultHost.configuration;
    const storage = config.tileCacheStorage;
    const credentials = config.tileCacheAzureCredentials;

    if (!storage && !credentials) {
      IVaultNative.platform.setMaxTileCacheSize(config.maxTileCacheDbSize ?? IVaultHostConfiguration.defaultMaxTileCacheDbSize);
      return;
    }

    IVaultNative.platform.setMaxTileCacheSize(0);
    if (credentials) {
      if (storage)
        throw new IVaultError(SzewecStatus.ERROR, "Cannot use both Azure and custom cloud storage providers for tile cache.");
      this.setupAzureTileCache(credentials);
    }
    if (storage)
      IVaultHost.tileStorage = new TileStorage(storage);
  }

  private static setupAzureTileCache(credentials: AzureBlobStorageCredentials) {
    const storageConfig: AzureServerStorageConfig = {
      accountName: credentials.account,
      accountKey: credentials.accessKey,
      baseUrl: credentials.baseUrl ?? `https://${credentials.account}.blob.core.windows.net`,
    }
    const blobServiceClient = new BlobServiceClient(
      storageConfig.baseUrl,
      new StorageSharedKeyCredential(storageConfig.accountName, storageConfig.accountKey),
    );
    const azureStorage: ServerStorage = new AzureServerStorage(storageConfig, new BlobServiceClientWrapper(blobServiceClient))
    IVaultHost.tileStorage = new TileStorage(azureStorage);
  }

  /** @internal */
  public static computeSchemaChecksum(arg: { schemaXmlPath: string, referencePaths: string[], exactMatch?: boolean }): string {
    return IVaultNative.platform.computeSchemaChecksum(arg);
  }
}

/** Information about the platform on which the app is running.
 * @public
 */
export class Platform {
  /** Get the name of the platform. */
  public static get platformName(): "win32" | "linux" | "darwin" | "ios" | "android" | "uwp" {
    return process.platform as any;
  }
}

/** Well known directories that may be used by the application.
 * @public
 */
export class KnownLocations {

  /** The directory where the ivaultjs-native assets are stored. */
  public static get nativeAssetsDir(): LocalDirName {
    return IVaultNative.platform.BldDb.getAssetsDir();
  }

  /** The directory where the core-backend assets are stored. */
  public static get packageAssetsDir(): LocalDirName {
    return join(__dirname, "assets");
  }

  /** The temporary directory. */
  public static get tmpdir(): LocalDirName {
    return os.tmpdir();
  }
}

/** Extend this class to provide custom file name resolution behavior.
 * @note Only `tryResolveKey` and/or `tryResolveFileName` need to be overridden as the implementations of `resolveKey` and `resolveFileName` work for most purposes.
 * @see [[IVaultHost.snapshotFileNameResolver]]
 * @public
 * @deprecated in 4.10 - will not be removed until after 2026-06-13. When opening a snapshot by file name, ensure to pass already resolved path. Using a key to open a snapshot is now deprecated.
 */
export abstract class FileNameResolver {
  /** Resolve a file name from the specified key.
   * @param _fileKey The key that identifies the file name in a `Map` or other similar data structure.
   * @returns The resolved file name or `undefined` if not found.
   */
  public tryResolveKey(_fileKey: string): string | undefined { return undefined; }
  /** Resolve a file name from the specified key.
   * @param fileKey The key that identifies the file name in a `Map` or other similar data structure.
   * @returns The resolved file name.
   * @throws [[IVaultError]] if not found.
   */
  public resolveKey(fileKey: string): string {
    const resolvedFileName: string | undefined = this.tryResolveKey(fileKey);
    if (undefined === resolvedFileName) {
      throw new IVaultError(IVaultStatus.NotFound, `${fileKey} not resolved`);
    }
    return resolvedFileName;
  }
  /** Resolve the input file name, which may be a partial name, into a full path file name.
   * @param inFileName The partial file name.
   * @returns The resolved full path file name or `undefined` if not found.
   */
  public tryResolveFileName(inFileName: string): string | undefined { return inFileName; }
  /** Resolve the input file name, which may be a partial name, into a full path file name.
   * @param inFileName The partial file name.
   * @returns The resolved full path file name.
   * @throws [[IVaultError]] if not found.
   */
  public resolveFileName(inFileName: string): string {
    const resolvedFileName: string | undefined = this.tryResolveFileName(inFileName);
    if (undefined === resolvedFileName) {
      throw new IVaultError(IVaultStatus.NotFound, `${inFileName} not resolved`);
    }
    return resolvedFileName;
  }
}
