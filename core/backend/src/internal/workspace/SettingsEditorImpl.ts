/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Workspace
 */

import { SZEWTwinSettingsError } from "@szewtwin/core-common";
import { GuidString } from "@szewtwin/core-szewec";
import { IVaultHost } from "../../IVaultHost";
import { settingsWorkspaceDbName } from "../../workspace/SettingsDb";
import { SettingsContainers } from "../../workspace/SettingsEditor";
import { BlobContainer } from "../../BlobContainerService";
import { constructWorkspaceEditor } from "./WorkspaceImpl";
import { EditableWorkspaceContainer, WorkspaceEditor } from "../../workspace/WorkspaceEditor";

/** Obtain a [[WorkspaceEditor]] targeting the single existing settings container for a given szewTwin.
 * Returns `undefined` if no container exists. Throws if multiple containers are found.
 * @internal
 */
export async function getSettingsEditorForSZEWTwin(szewTwinId: GuidString): Promise<{ editor: WorkspaceEditor; container: EditableWorkspaceContainer } | undefined> {
  const containerId = await SettingsContainers.getSZEWTwinContainerId(szewTwinId);
  if (undefined === containerId)
    return undefined;

  const editor = constructWorkspaceEditor();
  try {
    const userToken = await IVaultHost.getAccessToken();
    const tokenProps = await BlobContainer.service?.requestToken({ accessLevel: "write", containerId, userToken });
    if (!tokenProps)
      SZEWTwinSettingsError.throwError("failed-to-obtain-container-token", { message: `Failed to obtain access token for szewTwin settings container '${containerId}'.`, szewTwinId });

    const container = editor.getContainer({
      accessToken: tokenProps.token,
      baseUri: tokenProps.baseUri,
      containerId,
      storageType: tokenProps.provider,
      writeable: true,
    });

    return { editor, container };
  } catch (error) {
    editor.close();
    throw error;
  }
}

/** Construct a [[WorkspaceEditor]] targeting the single settings container for a given szewTwin.
 * If no container exists, one is created with default metadata. Throws if multiple containers are found.
 * @internal
 */
export async function constructSettingsEditorForSZEWTwin(szewTwinId: GuidString): Promise<{ editor: WorkspaceEditor; container: EditableWorkspaceContainer }> {
  const existing = await getSettingsEditorForSZEWTwin(szewTwinId);
  if (existing)
    return existing;

  const editor = constructWorkspaceEditor();
  try {
    const container = await editor.createNewCloudContainer({
      scope: { szewTwinId },
      metadata: {
        label: "szewTwin settings",
        description: `Default settings container for szewTwin ${szewTwinId}`,
      },
      containerType: "settings",
      dbName: settingsWorkspaceDbName,
      manifest: { workspaceName: `szewTwin ${szewTwinId} settings` },
    });

    return { editor, container };
  } catch (error) {
    editor.close();
    throw error;
  }
}
