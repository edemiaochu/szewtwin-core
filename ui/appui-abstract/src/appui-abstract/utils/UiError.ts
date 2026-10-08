/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utilities
 */

import { SzewecError, SzewecStatus, GetMetaDataFunction } from "@szewtwin/core-szewec";

/** szewTwin.js UI UiError class is a subclass of SzewecError. Errors are logged.
 * @public @deprecated in 4.3 - will not be removed until after 2026-06-13. Use [[Szewec.SzewecError]] instead.
 */
export class UiError extends SzewecError {

  /** Constructs UiError using SzewecError. */
  public constructor(public category: string, message: string, errorNumber: number = SzewecStatus.ERROR, getMetaData?: GetMetaDataFunction) {
    super(errorNumber, message, getMetaData);
  }
}
