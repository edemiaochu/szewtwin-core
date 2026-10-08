/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HubAccess
 */

import { AccessToken, GuidString } from "@szewtwin/core-szewec";
import { ChangesetIndexAndId, IVaultVersion } from "@szewtwin/core-common";

/**
 * @public
 * @extensions
 */
export interface IVaultIdArg {
  iVaultId: GuidString;
  accessToken: AccessToken;
}

/** @public */
export interface FrontendHubAccess {
  getLatestChangeset(arg: IVaultIdArg): Promise<ChangesetIndexAndId>;
  getChangesetFromVersion(arg: IVaultIdArg & { version: IVaultVersion }): Promise<ChangesetIndexAndId>;
  /**
   * Fetches the changeset with the given named version.
   * @param versionName If omitted will default to the latest named version.
   */
  getChangesetFromNamedVersion(arg: IVaultIdArg & { versionName?: string }): Promise<ChangesetIndexAndId>;
}
