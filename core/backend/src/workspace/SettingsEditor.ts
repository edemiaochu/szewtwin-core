/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Workspace
 */

import { SZEWTwinSettingsError } from "@szewtwin/core-common";
import { GuidString } from "@szewtwin/core-szewec";
import { WorkspaceContainerId, WorkspaceDbSettingsProps } from "./Workspace";
import { BlobContainer } from "../BlobContainerService";
import { IVaultHost } from "../IVaultHost";
import { constructSettingsEditorForSZEWTwin, getSettingsEditorForSZEWTwin } from "../internal/workspace/SettingsEditorImpl";
import { EditableWorkspaceContainer, WorkspaceEditor } from "./WorkspaceEditor";
import { SettingsPriority } from "./Settings";
import { settingsWorkspaceDbName } from "./SettingsDb";

/** The default resource name used to store settings in a [[WorkspaceDb]].
 * This is the key under which all settings are stored in the SQLite `strings` table.
 * When loading settings at runtime via [[Workspace.loadSettingsDictionary]], the `resourceName` defaults
 * to this value, ensuring the read and write paths always agree on which key to use.
 * @internal
 */
export const settingsResourceName = "settingsDictionary";

/** @internal */
export namespace SettingsEditor {
  /** The type of workspace container used to store settings. */
  export const containerType = "settings";

  /**
   * Create a new [[SettingsEditor]] for creating new versions of [[SettingsDb]]s.
   * @note The caller becomes the owner of the SettingsEditor and is responsible for calling [[SettingsEditor.close]] on it when finished.
   * @note It is illegal to have more than one SettingsEditor active in a single session.
   */
  export async function constructForSZEWTwin(szewTwinId: GuidString): Promise<{ editor: WorkspaceEditor; container: EditableWorkspaceContainer }> {
    return constructSettingsEditorForSZEWTwin(szewTwinId);
  }

  /**
   * Obtain a [[SettingsEditor]] for the existing settings container associated with an szewTwin.
   * @returns The editor and container, or `undefined` if no settings container exists for the szewTwin.
   * @note The caller becomes the owner of the SettingsEditor and is responsible for calling [[SettingsEditor.close]] on it when finished.
   * @note It is illegal to have more than one SettingsEditor active in a single session.
   */
  export async function getForSZEWTwin(szewTwinId: GuidString): Promise<{ editor: WorkspaceEditor; container: EditableWorkspaceContainer } | undefined> {
    return getSettingsEditorForSZEWTwin(szewTwinId);
  }
}

/**
 * Help locate and obtain access to known containers with type "settings".
 * @internal
 */
export namespace SettingsContainers {
  /** Arguments for [[SettingsContainers.queryContainers]]. */
  export interface QueryArgs {
    /** The szewTwinId whose settings containers should be queried. */
    szewTwinId: GuidString;
    /** Optional label filter. */
    label?: string;
  }

  /**
   * Query the [[BlobContainer]] service for all settings containers associated with a given szewTwin.
   * Automatically filters by `containerType: "settings"`.
   * @note Requires [[IVaultHost.authorizationClient]] to be configured.
   */
  async function queryContainers(args: QueryArgs): Promise<BlobContainer.MetadataResponse[]> {
    if (undefined === BlobContainer.service)
      SZEWTwinSettingsError.throwError("blob-service-unavailable", { message: "BlobContainer.service is not available." });

    const userToken = await IVaultHost.getAccessToken();
    return BlobContainer.service.queryContainersMetadata(userToken, { ...args, containerType: SettingsEditor.containerType });
  }

  /**
   * Query the [[BlobContainer]] service for the single settings container associated with a given szewTwin.
   * @returns The containerId, or `undefined` if no container exists.
   * @throws if more than one settings container is found.
   */
  export async function getSZEWTwinContainerId(szewTwinId: GuidString): Promise<WorkspaceContainerId | undefined> {
    const containers = await queryContainers({ szewTwinId });
    if (containers.length > 1) {
      SZEWTwinSettingsError.throwError("multiple-szewtwin-settings-containers", {
        message: `Multiple szewTwin settings containers were found for '${szewTwinId}', so a container cannot be automatically selected.`,
        szewTwinId,
      });
    }
    return containers[0]?.containerId;
  }

  /**
   * Look up the settings container for an szewTwin and obtain a read-only access token.
   * @returns container props needed by [[IVaultHost.getSZEWTwinWorkspace]].
   * @note Requires [[IVaultHost.authorizationClient]] to be configured.
   * @note Requires [[BlobContainer.service]] to be configured.
   */
  export async function getSZEWTwinSettingsSources(szewTwinId: GuidString): Promise<WorkspaceDbSettingsProps[] | undefined> {
    if (undefined === BlobContainer.service)
      SZEWTwinSettingsError.throwError("blob-service-unavailable", { message: "BlobContainer.service is not available." });

    const userToken = await IVaultHost.getAccessToken();
    const containers = await queryContainers({ szewTwinId });
    if (!containers || containers.length === 0) return undefined;
    if (containers.length > 1) {
      SZEWTwinSettingsError.throwError("multiple-szewtwin-settings-containers", {
        message: `Multiple szewTwin settings containers were found for '${szewTwinId}', so a container cannot be automatically selected.`,
        szewTwinId,
      });
    }

    const tokenProps = await BlobContainer.service.requestToken({ containerId: containers[0].containerId, accessLevel: "read", userToken });
    return [{
      baseUri: tokenProps.baseUri,
      containerId: containers[0].containerId,
      storageType: tokenProps.provider,
      accessToken: tokenProps.token,
      priority: SettingsPriority.szewTwin,
      dbName: settingsWorkspaceDbName,
      includePrerelease: true,
    }];
  }
}
