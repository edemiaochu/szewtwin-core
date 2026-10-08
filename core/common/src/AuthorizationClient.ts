/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authorization
 */

import { AccessToken } from "@szewtwin/core-szewec";

/** Provides authorization to access APIs.
 * Szewec's szewTwin platform APIs [use OAuth 2.0](https://developer.szewec.com/apis/overview/authorization/) for authorization.
 * Implementations are provided for [Electron](https://www.npmjs.com/package/@szewtwin/electron-authorization), [browsers](https://www.npmjs.com/package/@szewtwin/browser-authorization),
 * [services](https://www.npmjs.com/package/@szewtwin/service-authorization), and [command-line applications](https://www.npmjs.com/package/@szewtwin/node-cli-authorization).
 * @see [IVaultHostOptions.authorizationClient]($backend) and [IVaultAppOptions.authorizationClient]($frontend) to configure the client.
 * @see [IVaultHost.authorizationClient]($backend) and [IVaultApp.authorizationClient]($frontend) to access the configured client.
 * @note Access tokens expire periodically and are automatically refreshed when possible; therefore, tokens should always be requested via the client, not cached for later reuse.
 @public
 */
export interface AuthorizationClient {
  /** Obtain an [[AccessToken]] for the currently authorized user, or blank string if no token is available. */
  getAccessToken(): Promise<AccessToken>;
}
