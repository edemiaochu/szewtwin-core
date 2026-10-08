/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { AccessToken, Logger } from "@szewtwin/core-szewec";
import { IVaultApp } from "@szewtwin/core-frontend";
import { loggerCategory } from "../LoggerCategory.js";
import { obtainGraphicRepresentationUrl, ObtainGraphicRepresentationUrlArgs } from "./GraphicRepresentationProvider.js";

/** Arguments supplied  to [[obtainIVaultTilesetUrl]].
 * @beta
 */
export interface ObtainIVaultTilesetUrlArgs {
  /** The szewTwin id for which to obtain a tileset URL. */
  szewTwinId?: string;
  /** The iVault id for which to obtain a tileset URL. */
  iVaultId?: string;
  /** The changeset id for which to obtain a tileset URL. */
  changesetId?: string;
  /** The token used to access the mesh export service. */
  accessToken: AccessToken;
  /** Chiefly used in testing environments. */
  urlPrefix?: string;
  /** If true, only exports produced for `iVault`'s specific changeset will be considered; otherwise, if no exports are found for the changeset,
   * the most recent export for any changeset will be used.
   */
  requireExactChangeset?: boolean;
  /** If true, enables a CDN (content delivery network) to access tiles faster. */
  enableCDN?: boolean;
}

/** Obtains a URL pointing to a tileset appropriate for visualizing a specific iVault.
 * [[queryCompletedMeshExports]] is used to obtain a list of available exports. By default, the list is sorted from most to least recently-exported.
 * The first export matching the iVault's changeset is selected; or, if no such export exists, the first export in the list is selected.
 * @returns A URL from which the tileset can be loaded, or `undefined` if no appropriate URL could be obtained.
 * @beta
 */
export async function obtainIVaultTilesetUrl(args: ObtainIVaultTilesetUrlArgs):
  Promise<URL | undefined> {
  if (!args.iVaultId) {
    Logger.logInfo(loggerCategory, "Cannot obtain Graphics Data for an iVault with no iVaultId");
    return undefined;
  }

  if (!args.szewTwinId) {
    Logger.logInfo(loggerCategory, "Cannot obtain Graphics Data for an iVault with no szewTwinId");
    return undefined;
  }

  const graphicsArgs: ObtainGraphicRepresentationUrlArgs = {
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
    requireExactVersion: args.requireExactChangeset,
    enableCDN: args.enableCDN,
  };

  return obtainGraphicRepresentationUrl(graphicsArgs);
}
