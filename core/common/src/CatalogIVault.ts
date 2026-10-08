/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NativeApp
 */

import { Id64String, SZEWTwinError } from "@szewtwin/core-szewec";
import { LocalFileName } from "./ChangesetProps";
import { IVaultConnectionProps, SnapshotOpenOptions } from "./IVault";

/**
 * Errors produced by the [[CatalogIVault]] API.
 * @beta
 */
export namespace CatalogError {
  export const scope = "szewtwin-Catalog";

  export type Key =
    "invalid-seed-catalog" |
    "manifest-missing";

  /** Determine whether an error object is a CatalogError */
  export function isError(error: unknown, key?: Key): error is SZEWTwinError {
    return SZEWTwinError.isError<SZEWTwinError>(error, scope, key);
  }

  /** Instantiate and throw a CatalogError */
  export function throwError<T extends SZEWTwinError>(key: Key, e: Omit<T, "name" | "szewTwinErrorId">): never {
    SZEWTwinError.throwError<SZEWTwinError>({ ...e, szewTwinErrorId: { scope, key } });
  }
}

/** A "catalog iVault" is an [[IVault]] containing elements (e.g., component definitions) that are intended to be copied into another iVault by applications.
 * They can be stored in [BlobContainer]($backend)s managed by a "reference data service" that uses [semantic versioning](https://semver.org/), much like [WorkspaceDb]($backend)s.
 * @see [CatalogDb]($backend) to interact with catalog iVaults on the backend
 * @see [CatalogConnection]($frontend) to interact with catalog iVaults on the frontend.
 * @beta
 */
export namespace CatalogIVault {

  /** Metadata describing a catalog iVault.
   * @note Only the [[catalogName]] field is required, and users may add additional fields for their own purposes.
   * @note The manifest is stored inside of the CatalogIVault, so it is versioned along with the rest of the catalog's contents.
   * @beta
   */
  export interface Manifest {
    /** The szewTwinId for the Catalog */
    readonly szewTwinId?: Id64String;

    /**
     * The name of the Catalog to be shown in user interfaces. Organizations should attempt to make this name informative enough
     * so that uses may refer to it in conversations. It should also be unique enough that there's no confusion when it appears in
     * lists of catalogs.
     * @note it is possible and valid to change the catalogName between versions of a CatalogIVault (e.g. incorporating a date).
     */
    readonly catalogName: string;
    /** A description of the contents of this catalog to help users understand its purpose and appropriate usage. */
    readonly description?: string;
    /** The name of the person to contact with questions about this catalog */
    readonly contactName?: string;
    /** The name of the person who last modified this catalog. */
    lastEditedBy?: string;
  }

  /** Arguments for creating a new [BlobContainer]($backend) that holds (versions of) a CatalogIVault. */
  export interface CreateNewContainerArgs {
    /** supplies the szewTwinId for the new container */
    readonly szewTwinId: Id64String;
    /** metadata stored with the new container */
    readonly metadata: {
      /** a "name" for the Catalog container. Should be long enough to be unique, but this is not enforced. */
      label: string;
      /** Optional human-readable explanation of the information held in the container. This will be displayed in the administrator RBAC panel, and on usage reports. */
      description?: string;
      /** optional properties for the container */
      json?: { [key: string]: any };
    }

    /** The manifest to be stored in the catalog */
    readonly manifest: Manifest;
    /** The name for the CatalogIVault database within the container. May not contain a version. Default is "catalog-db" */
    readonly dbName?: string,
    /** version for the catalog created [[localCatalogFile]]. Defaults to "0.0.0" */
    readonly version?: string;
    /** A filename on the local computer of the "seed" CatalogIVault to be uploaded into the new container */
    readonly localCatalogFile: LocalFileName;
  }

  /** Properties of a newly created container created from [[CatalogIVault.CreateNewContainerArgs]]. Most importantly, this holds the ContainerId of the new container. */
  export interface NewContainerProps {
    /** The ContainerId of the new container (usually a [Guid]($szewec)). Applications should store this value to access the container via the CatalogIVault apis. */
    readonly containerId: string;
    /** the uri of the BlobContainer service where the new container resides. */
    readonly baseUri: string;
    /** name of the blob storage provider. */
    readonly provider: "azure" | "google";
  }

  /** Properties to identify a specific CatalogIVault within a container. */
  export interface NameAndVersion {
    /** The name of the catalog database. Defaults to "catalog-db" for CatalogIVaults stored in cloud containers. */
    readonly dbName?: string;
    /** The range of acceptable versions of the database of the specified [[dbName]].
     * If not present, defaults to the newest available version.
     */
    readonly version?: VersionRange;
  }

  /** Arguments to open an existing version of a CatalogIVault. */
  export interface OpenArgs extends NameAndVersion, SnapshotOpenOptions {
    /** The ContainerId of the cloud container. If not present, dbName is the name of a file on the local computer. */
    containerId?: string;
    /** If true, attempt to synchronize the container with any changes in the cloud. Since this automatically happens the first time a
     * container is accessed within a session, this is usually not necessary except for tests.
     */
    syncWithCloud?: boolean;
    /** Start a prefetch operation on the CatalogIVault as it is opened. */
    prefetch?: boolean;
  }

  /** Arguments to create a new version of a CatalogIVault from (a copy of) an existing version in a cloud container. */
  export interface CreateNewVersionArgs {
    /** The id of cloud container. */
    readonly containerId: string;
    /** the source version of the CatalogIVault, from which the new version will copied. */
    readonly fromDb: NameAndVersion;
    /** The type of version increment to apply to the source version. */
    readonly versionType: "major" | "minor" | "patch" | "premajor" | "preminor" | "prepatch" | "prerelease";
    /** For prerelease versions, a string that becomes part of the version name. */
    readonly identifier?: string;
  }

  /** A [semver string](https://github.com/npm/node-semver?tab=readme-ov-file#ranges) describing a range of acceptable [[CatalogIVault]]s,
   * e.g., ">=1.2.7 <1.3.0".
   */
  export type VersionRange = string;

  /** The name of the ipc channel for [[IpcMethods]]
   * @internal
   */
  export type IpcChannel = "catalogIVault/ipc";

  /** @internal */
  export interface IpcMethods {
    /** create a new container from the BlobContainerService for holding a CatalogIVault. Also uploads the seed file */
    createNewContainer(args: CreateNewContainerArgs): Promise<NewContainerProps>;
    /** Acquire the write lock for a CatalogIVault container. */
    acquireWriteLock(args: { containerId: string, username: string }): Promise<void>;
    /** Release the write lock for a CatalogIVault container. */
    releaseWriteLock(args: { containerId: string, abandon?: true }): Promise<void>;
    /** create a new version of a CatalogIVault from an existing version. */
    createNewVersion(args: CreateNewVersionArgs): Promise<{ oldDb: NameAndVersion, newDb: NameAndVersion }>;
    /** Attempt to open a CatalogIVault readonly*/
    openReadonly(args: OpenArgs): Promise<IVaultConnectionProps>;
    /** Attempt to open a CatalogIVault for editing */
    openEditable(args: OpenArgs): Promise<IVaultConnectionProps>;
    /** Get the manifest and version number for an open CatalogConnection. */
    getInfo(key: string): Promise<{ manifest?: CatalogIVault.Manifest, version: string }>;
    /** Update the manifest stored in an open EditableCatalog */
    updateCatalogManifest(key: string, manifest: CatalogIVault.Manifest): Promise<void>;
  }
}
