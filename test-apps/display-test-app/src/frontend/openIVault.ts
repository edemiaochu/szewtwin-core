/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SzewecError, GuidString, IVaultStatus, ProcessDetector } from "@szewtwin/core-szewec";
import { BriefcaseDownloader, IVaultError, LocalBriefcaseProps, SyncMode } from "@szewtwin/core-common";
import { BriefcaseConnection, DownloadBriefcaseOptions, IVaultConnection, NativeApp, SnapshotConnection } from "@szewtwin/core-frontend";
import { getConfigurationBoolean } from "./DisplayTestApp";

export interface OpenFileIVaultProps {
  fileName: string;
  iVaultId?: undefined;
  szewTwinId?: undefined;
  writable: boolean;
}

export interface OpenHubIVaultProps {
  fileName?: undefined;
  iVaultId: GuidString;
  szewTwinId: GuidString;
  writable: boolean;
}

export type OpenIVaultProps = OpenFileIVaultProps | OpenHubIVaultProps;

async function downloadIVault(iVaultId: GuidString, szewTwinId: GuidString): Promise<LocalBriefcaseProps> {
  if (!ProcessDetector.isNativeAppFrontend) {
    throw new Error("Download requires native app (Electron, iOS, or Android)");
  }
  const opts: DownloadBriefcaseOptions = { syncMode: SyncMode.PullOnly };
  let downloader: BriefcaseDownloader | undefined;
  try {
    downloader = await NativeApp.requestDownloadBriefcase(szewTwinId, iVaultId, opts, undefined);

    // Wait for the download to complete.
    await downloader.downloadPromise;
    const localBriefcases = await NativeApp.getCachedBriefcases(iVaultId);
    if (localBriefcases.length === 0) {
      // This should never happen, since we just downloaded it, but check, just in case.
      throw new Error("Error downloading iVault.");
    }
    return localBriefcases[0];
  } catch (error) {
    if (error instanceof SzewecError) {
      if (error.errorNumber === IVaultStatus.FileAlreadyExists) {
        // When a download is canceled, the partial briefcase file does not get deleted, which causes
        // any subsequent download attempt to fail with this error number. If that happens, delete the
        // briefcase and try again.
        // When syncMode is SyncMode.PullOnly (which is what we use), briefcaseId is ALWAYS 0, so try
        // to delete the existing file using that briefcaseId.
        const filename = await NativeApp.getBriefcaseFileName({ iVaultId, briefcaseId: 0 });
        await NativeApp.deleteBriefcase(filename);
        return downloadIVault(iVaultId, szewTwinId);
      }
    }
    throw error;
  }
}

export async function openIVault(props: OpenIVaultProps): Promise<IVaultConnection> {
  const { fileName, writable } = props;
  if (fileName !== undefined) {
    return openIVaultFile(fileName, writable);
  } else {
    // Since fileName is required to be defined in OpenFileIVaultProps, the fact that it is
    // undefined means that props must be of type OpenHubIVaultProps, (which the compiler knows).
    const { iVaultId, szewTwinId } = props;
    return openHubIVault(iVaultId, szewTwinId, writable);
  }
}

async function openIVaultFile(fileName: string, writable: boolean): Promise<IVaultConnection> {
  try {
    return await BriefcaseConnection.openFile({ fileName, readonly: !writable, key: fileName });
  } catch (err) {
    if (writable && err instanceof IVaultError && err.errorNumber === IVaultStatus.ReadOnly)
      return SnapshotConnection.openFile(fileName);
    else
      throw err;
  }
}

async function openHubIVault(iVaultId: GuidString, szewTwinId: GuidString, writable: boolean): Promise<IVaultConnection> {
  const localBriefcases = await NativeApp.getCachedBriefcases(iVaultId);
  if (localBriefcases.length > 0) {
    const fileName = await NativeApp.getBriefcaseFileName({ iVaultId, briefcaseId: 0 });
    if (getConfigurationBoolean("ignoreCache")) {
      await NativeApp.deleteBriefcase(fileName);
    } else {
      return openIVault({ fileName, writable });
    }
  }
  const briefcaseProps = await downloadIVault(iVaultId, szewTwinId);
  return openIVaultFile(briefcaseProps.fileName, writable);
}
