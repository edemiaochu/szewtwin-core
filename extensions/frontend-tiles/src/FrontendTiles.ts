/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { AccessToken } from "@szewtwin/core-szewec";
import { IVaultApp, IVaultConnection, SpatialTileTreeReferences, SpatialViewState } from "@szewtwin/core-frontend";
import { createBatchedSpatialTileTreeReferences } from "./BatchedSpatialTileTreeRefs.js";
import { queryGraphicRepresentations, QueryGraphicRepresentationsArgs } from "./GraphicsProvider/GraphicRepresentationProvider.js";
import { obtainIVaultTilesetUrl, ObtainIVaultTilesetUrlArgs } from "./GraphicsProvider/GraphicsProvider.js";

/** A function that can provide the base URL where a tileset representing all of the spatial models in a given iVault are stored.
 * The tileset is expected to reside at "baseUrl/tileset.json" and to have been produced by the [mesh export service](https://developer.szewec.com/apis/mesh-export/).
 * If no such tileset exists for the given iVault, return `undefined`.
 * @see [[FrontendTilesOptions.computeSpatialTilesetBaseUrl]].
 * @beta
 */
export type ComputeSpatialTilesetBaseUrl = (iVault: IVaultConnection) => Promise<URL | undefined>;

/** Represents the result of a [mesh export](https://developer.szewec.com/apis/mesh-export/operations/get-export/#export).
 * @see [[queryCompletedMeshExports]].
 * @beta
 */
export interface MeshExport {
  id: string;
  displayName: string;
  status: string;
  request: {
    iVaultId: string;
    changesetId: string;
    exportType: string;
    geometryOptions: any;
    viewDefinitionFilter: any;
  };

  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  _links: {
    mesh: {
      href: string;
    };
  };
}

/** Exposed strictly for tests.
 * @internal
 */
export interface MeshExports {
  exports: MeshExport[];

  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  _links: {
    next?: {
      href: string;
    };
  };
}

/** Arguments supplied to [[queryMeshExports]].
 * @beta
 */
export interface QueryMeshExportsArgs {
  /** The token used to access the mesh export service. */
  accessToken: AccessToken;
  /** The szewTwinId associated with the Mesh Export */
  szewTwinId: string;
  /** The Id of the iVault for which to query exports. */
  iVaultId: string;
  /** If defined, constrains the query to exports produced from the specified changeset. */
  changesetId?: string;
  /** Chiefly used in testing environments. */
  urlPrefix?: string;
  /** If true, exports whose status is not "Complete" (indicating the export successfully finished) will be included in the results. */
  includeIncomplete?: boolean;
  /** If true, enables a CDN (content delivery network) to access tiles faster. */
  enableCDN?: boolean;
  /** Number of exports to query */
  numExports?: number;
}

/** Query the [mesh export service](https://developer.szewec.com/apis/mesh-export/operations/get-exports/) for exports of type "IVAULT" matching
 * the specified criteria.
 * The exports are sorted from most-recently- to least-recently-produced.
 * @beta
 */
export async function* queryMeshExports(args: QueryMeshExportsArgs): AsyncIterableIterator<MeshExport> {
  const graphicsArgs: QueryGraphicRepresentationsArgs = {
    accessToken: args.accessToken,
    sessionId: IVaultApp.sessionId,
    dataSource: {
      szewTwinId: args.szewTwinId,
      id: args.iVaultId,
      changeId: args.changesetId,
      type: "IVAULT",
    },
    format: "IVAULT",
    urlPrefix: args.urlPrefix,
    includeIncomplete: args.includeIncomplete,
    enableCDN: args.enableCDN,
    numExports: args.numExports,
  };

  for await (const data of queryGraphicRepresentations(graphicsArgs)) {
    const meshExport = {
      id: data.representationId,
      displayName: data.displayName,
      status: data.status,
      request: {
        iVaultId: data.dataSource.id,
        changesetId: data.dataSource.changeId ?? "",
        exportType: data.dataSource.type,
        geometryOptions: {},
        viewDefinitionFilter: {},
      },

      /* eslint-disable-next-line @typescript-eslint/naming-convention */
      _links: {
        mesh: {
          href: data.url ?? "",
        },
      },
    };

    yield meshExport;
  }
}

/** Arguments supplied  to [[obtainMeshExportTilesetUrl]].
 * @beta
 */
export type ObtainMeshExportTilesetUrlArgs = ObtainIVaultTilesetUrlArgs;

/** Obtains a URL pointing to a tileset appropriate for visualizing a specific iVault.
 * [[queryCompletedMeshExports]] is used to obtain a list of available exports. By default, the list is sorted from most to least recently-exported.
 * The first export matching the iVault's changeset is selected; or, if no such export exists, the first export in the list is selected.
 * @returns A URL from which the tileset can be loaded, or `undefined` if no appropriate URL could be obtained.
 * @beta
 */
export async function obtainMeshExportTilesetUrl(args: ObtainMeshExportTilesetUrlArgs): Promise<URL | undefined> {
  return obtainIVaultTilesetUrl(args);
}
/** Options supplied to [[initializeFrontendTiles]].
 * @beta
 */
export interface FrontendTilesOptions {
  /** Provide the base URL for the pre-published tileset for a given iVault.
   * If omitted, [[obtainMeshExportTilesetUrl]] will be invoked with default arguments, using the access token provided by [[IVaultApp]].
   */
  computeSpatialTilesetBaseUrl?: ComputeSpatialTilesetBaseUrl;
  /** The maximum number of levels in the tile tree to skip loading if they do not provide the desired level of detail for the current view.
   * Default: 4.
   * Reducing this value will load more intermediate tiles, which causes more gradual refinement: low-resolution tiles will display quickly, followed more gradually by
   * successively higher-resolution ones.
   * Increasing the value jumps more directly to tiles of the exact level of detail desired, which may load more, smaller tiles up-front, leaving some areas of the view
   * vacant for longer; and when zooming out some newly-exposed areas of the view may remain vacant for longer because no lower-resolution tiles are initially available to
   * fill them. However, tiles close to the viewer (and therefore likely of most interest to them) will refine to an appropriate level of detail more quickly.
   */
  maxLevelsToSkip?: number;
  /** Specifies whether to permit the user to enable visible edges or wireframe mode for batched tiles.
   * The currently-deployed mesh export service does not produce edges, so this currently defaults to `false` to avoid user confusion.
   * Set it to `true` if you are loading tiles created with a version of the exporter that does produce edges.
   * ###TODO delete this option once we deploy an edge-producing version of the exporter to production.
   * @internal
   */
  enableEdges?: boolean;
  /** Specifies whether to enable a CDN (content delivery network) to access tiles faster.
   * This option is only used if computeSpatialTilesetBaseUrl is not defined.
   * @beta
   */
  enableCDN?: boolean;
  /** Specifies whether to enable an IndexedDB database for use as a local cache.
  * Requested tiles will then first be search for in the database, and if not found, fetched as normal.
  * @internal
  */
  useIndexedDBCache?: boolean;

  /** If true, an empty tile tree will be used as fallback if the tileset is not found or invalid.
   * If false or not defined, the default tiles will be used as a fallback.
   * @internal
   */
  nopFallback?: boolean;
}

/** Global configuration initialized by [[initializeFrontendTiles]].
 * @internal
 */
export const frontendTilesOptions = {
  maxLevelsToSkip: 4,
  enableEdges: false,
  useIndexedDBCache: false,
};

/** Initialize the frontend-tiles package to obtain tiles for spatial views.
 * @beta
 */
export function initializeFrontendTiles(options: FrontendTilesOptions): void {
  if (undefined !== options.maxLevelsToSkip && options.maxLevelsToSkip >= 0)
    frontendTilesOptions.maxLevelsToSkip = options.maxLevelsToSkip;

  if (options.enableEdges)
    frontendTilesOptions.enableEdges = true;

  if (options.useIndexedDBCache)
    frontendTilesOptions.useIndexedDBCache = true;

  const computeUrl = options.computeSpatialTilesetBaseUrl ?? (
    async (iVault: IVaultConnection) => obtainMeshExportTilesetUrl({
      szewTwinId: iVault.szewTwinId,
      iVaultId: iVault.iVaultId,
      changesetId: iVault.changeset.id,
      accessToken: await IVaultApp.getAccessToken(),
      enableCDN: options.enableCDN,
    })
  );

  SpatialTileTreeReferences.create = (view: SpatialViewState) => createBatchedSpatialTileTreeReferences(view, computeUrl, options.nopFallback ?? false);
}
