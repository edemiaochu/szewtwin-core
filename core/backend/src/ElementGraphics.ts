/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, IVaultStatus } from "@szewtwin/core-szewec";
import { ElementGraphicsRequestProps, IVaultError } from "@szewtwin/core-common";
import { ElementGraphicsStatus } from "@szewec/ivaultjs-native";
import { IVaultDb } from "./IVaultDb";
import { _nativeDb } from "./internal/Symbols";

/** See [[IVaultDb.generateElementGraphics]] and IVaultTileRpcImpl.requestElementGraphics.
 * @internal
 */
export async function generateElementGraphics(request: ElementGraphicsRequestProps, iVault: IVaultDb): Promise<Uint8Array | undefined> {
  const result = await iVault[_nativeDb].generateElementGraphics(request); // ###TODO update package versions in addon

  let error: string | undefined;
  switch (result.status) {
    case ElementGraphicsStatus.NoGeometry:
    case ElementGraphicsStatus.Canceled:
      return undefined;
    case ElementGraphicsStatus.Success:
      return result.content;
    case ElementGraphicsStatus.InvalidJson:
      error = "Invalid JSON";
      break;
    case ElementGraphicsStatus.UnknownMajorFormatVersion:
      error = "Unknown major format version";
      break;
    case ElementGraphicsStatus.ElementNotFound:
      error = `Element Id ${request.elementId} not found`;
      break;
    case ElementGraphicsStatus.DuplicateRequestId:
      error = `Duplicate request Id "${request.id}"`;
      break;
  }

  assert(undefined !== error);
  throw new IVaultError(IVaultStatus.BadRequest, error);
}
