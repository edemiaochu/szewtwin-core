/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { GuidString } from "@szewtwin/core-szewec";

/** Properties that identify a session.
 * @public
 * @extensions
 */
export interface SessionProps {
  /** Used for logging and usage tracking to identify the application  */
  readonly applicationId: string;

  /** Used for logging and usage tracking to identify the application version  */
  readonly applicationVersion: string;

  /** Used for logging to identify a session  */
  readonly sessionId: GuidString;
}

