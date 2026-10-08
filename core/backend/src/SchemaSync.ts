/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module SQLiteDb
 */

import { CloudSqlite } from "./CloudSqlite";
import { VersionedSqliteDb } from "./SQLiteDb";
import { BriefcaseDb, IVaultDb } from "./IVaultDb";
import { DbResult, OpenMode } from "@szewtwin/core-szewec";
import { IVaultError, LocalFileName } from "@szewtwin/core-common";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { IVaultNative } from "./internal/NativePlatform";
import { _implicitTxn, _nativeDb } from "./internal/Symbols";

/** @internal */
export namespace SchemaSync {
  const lockParams: CloudSqlite.ObtainLockParams = { retryDelayMs: 1000, nRetries: 30 };

  /** A CloudSqlite database for synchronizing schema changes across briefcases.  */
  export class SchemaSyncDb extends VersionedSqliteDb {
    public override readonly myVersion = "4.0.0";
    protected override createDDL() { }
  }

  const syncProperty = { namespace: "szewtwinjs", name: "SchemaSync" };
  const defaultDbName = "SchemaSyncDb";
  const testSyncCachePropKey = "test.schema_sync.cache_name";
  // for tests only
  export const setTestCache = (iVault: IVaultDb, cacheName?: string) => {
    if (cacheName)
      iVault[_nativeDb].saveLocalValue(testSyncCachePropKey, cacheName);
    else
      iVault[_nativeDb].deleteLocalValue(testSyncCachePropKey);
  };

  const getCloudAccess = async (arg: IVaultDb | { readonly fileName: LocalFileName }) => {
    let nativeDb: IVaultJsNative.BldDb | undefined;
    const argIsIVaultDb = arg instanceof IVaultDb;
    if (argIsIVaultDb) {
      nativeDb = arg[_nativeDb];
    } else {
      nativeDb = new IVaultNative.platform.BldDb();
      nativeDb.openIVault(arg.fileName, OpenMode.Readonly);
    }

    const propsString = nativeDb.queryFileProperty(syncProperty, true) as string | undefined;
    if (!propsString)
      throw new Error("iVault does not have a SchemaSyncDb");
    try {
      const props = JSON.parse(propsString) as CloudSqlite.ContainerProps;
      const accessToken = await CloudSqlite.requestToken(props);
      const access = new CloudAccess({ ...props, accessToken });
      Object.assign(access.lockParams, lockParams);
      const testSyncCache = nativeDb.queryLocalValue(testSyncCachePropKey);
      if (testSyncCache)
        access.setCache(CloudSqlite.CloudCaches.getCache({ cacheName: testSyncCache }));
      return access;
    } finally {
      if (!argIsIVaultDb) {
        nativeDb.closeFile();
      }
    }
  };

  export const withLockedAccess = async (iVault: IVaultDb | { readonly fileName: LocalFileName }, args: { operationName: string, openMode?: OpenMode, user?: string }, operation: (access: CloudAccess) => Promise<void>): Promise<void> => {
    const access = await getCloudAccess(iVault);
    try {
      await access.withLockedDb(args, async () => operation(access));
    } finally {
      access.close();
    }
  };

  export const withReadonlyAccess = async (iVault: IVaultDb | { readonly fileName: LocalFileName }, operation: (access: CloudAccess) => Promise<void>): Promise<void> => {
    const access = await getCloudAccess(iVault);
    access.synchronizeWithCloud();
    access.openForRead();
    try {
      await operation(access);
    } finally {
      access.close();
    }
  };

  export const isEnabled = (iVault: IVaultDb) => {
    return iVault[_nativeDb].schemaSyncEnabled();
  };

  /** Synchronize local briefcase schemas with cloud container */
  export const pull = async (iVault: IVaultDb) => {
    if (iVault[_nativeDb].schemaSyncEnabled() && !iVault.isReadonly) {
      await SchemaSync.withReadonlyAccess(iVault, async (syncAccess) => {
        const schemaSyncDbUri = syncAccess.getUri();
        iVault.clearCaches();
        iVault[_nativeDb].schemaSyncPull(schemaSyncDbUri);
        iVault[_implicitTxn].saveChanges("schema synchronized with cloud container");
      });
    }
  };

  export const initializeForIVault = async (arg: { iVault: IVaultDb, containerProps: CloudSqlite.ContainerProps, overrideContainer?: boolean }) => {
    const props = { baseUri: arg.containerProps.baseUri, containerId: arg.containerProps.containerId, storageType: arg.containerProps.storageType }; // sanitize to only known properties
    const iVault = arg.iVault;
    const briefcase = iVault instanceof BriefcaseDb ? iVault : undefined;
    await iVault.acquireSchemaLock();
    if (briefcase) {
      if (briefcase.txns.hasLocalChanges) {
        throw new IVaultError(DbResult.BE_SQLITE_ERROR, "Enabling SchemaSync for iVault failed. There are unsaved or un-pushed local changes.");
      }
      await briefcase.pullChanges();
    }
    try {
      iVault[_implicitTxn].saveFileProperty(syncProperty, JSON.stringify(props));
      await withLockedAccess(arg.iVault, { operationName: "initialize schemaSync", openMode: OpenMode.Readonly }, async (syncAccess) => {
        iVault[_nativeDb].schemaSyncInit(syncAccess.getUri(), props.containerId, arg.overrideContainer ?? false);
        iVault[_implicitTxn].saveChanges(`Enable SchemaSync  (container id: ${props.containerId})`);
      });
    } catch (err) {
      throw err;
    } finally {
      iVault[_implicitTxn].abandonChanges();
    }

    if (briefcase) {
      if (arg.overrideContainer)
        await briefcase.pushChanges({ description: `Overriding SchemaSync for iVault with container-id: ${props.containerId}` });
      else
        await briefcase.pushChanges({ description: `Enable SchemaSync for iVault with container-id: ${props.containerId}` });
    }
  };

  /** Provides access to a cloud-based `SchemaSyncDb` to hold DMSchemas.  */
  export class CloudAccess extends CloudSqlite.DbAccess<SchemaSyncDb> {
    public constructor(props: CloudSqlite.ContainerAccessProps) {
      super({ dbType: SchemaSyncDb, props, dbName: defaultDbName });
    }

    public getUri() {
      return `${this.getCloudDb()[_nativeDb].getFilePath()}?vfs=${this.container.cache?.name}&writable=${this.container.isWriteable ? 1 : 0}`;
    }
    /**
   * Initialize a cloud container for use as a SchemaSync. The container must first be created via its storage supplier api (e.g. Azure, or AWS).
   * A valid sasToken that grants write access must be supplied. This function creates and uploads an empty ChannelDb into the container.
   * @note this deletes any existing content in the container.
   */
    public static async initializeDb(props: CloudSqlite.ContainerProps) {
      return super._initializeDb({ props, dbType: SchemaSyncDb, dbName: defaultDbName });
    }
  }
}

