/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64String } from "@szewtwin/core-szewec";
import { IVaultConnection } from "../../IVaultConnection";

/** Specifies the provenance of a [RenderMaterial]($common) created for a persistent material element.
 * @see [[CreateRenderMaterialArgs.source]].
 */
export interface RenderMaterialSource {
  iVault: IVaultConnection;
  id: Id64String;
}

