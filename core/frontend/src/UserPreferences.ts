/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UserPreferences
 */

import { AccessToken, GuidString } from "@szewtwin/core-szewec";

/** Argument for methods that can supply an szewTwinId and iVaultId.
 * @beta
 */
export interface SZEWTwinIdArg {
  readonly szewTwinId?: GuidString;
  readonly iVaultId?: GuidString;
}

/** Argument for methods that can supply an access token.
 * @beta
 */
export interface TokenArg {
  accessToken?: AccessToken;
}

/** Argument for methods that can supply the user preference content.
 * @beta
 */
export interface PreferenceArg extends PreferenceKeyArg {
  readonly content?: any;
}

/** Argument for methods that must supply a key for the user preference.
 * @beta
 */
export interface PreferenceKeyArg {
  readonly namespace?: string;
  readonly key: string;
}

/** User preferences provide a way to get, store and delete preferences for an application at
 * two different levels, szewTwin and iVault.
 *
 * The user preferences are separate from any szewTwin or iVault configuration intended to be shared
 * across multiple users. See [Workspace]($docs/learning/backend/Workspace.md) for more details on
 * shared configuration.
 *
 * Note: Both the key and return type are intended to be abstract and allow any preferences to be stored.
 *     Based on this simple interface, the implementation of this interface can interpret the key as needed
 *     to store and retrieve the preferences.
 * @beta
 */
export interface UserPreferencesAccess {
  /** Method to get a user preference based off of a key within a namespace.
   *
   * If both szewTwinId and iVaultId are provided, the iVault level will be check first. If
   * it does not exist, the szewTwin level will checked next.
   *
   * @returns undefined if a preference is not found.
   * @throws if an error occurs when attempting to retrieve a preference.
   */
  get: (arg: PreferenceKeyArg & SZEWTwinIdArg & TokenArg) => Promise<any>;

  /** Deletes the specified preference by key, if it exists, within the level provided.
   *
   * If both szewTwinId and iVaultId are provided, the key will be deleted from both levels.
   *
   * If the key does not exist in either level provided, then this function will do nothing.
   *
   * @throws if any error occurs when deleting the preference.
   */
  delete: (arg: PreferenceKeyArg & SZEWTwinIdArg & TokenArg) => Promise<void>;

  /** Saves the provided preference by the key within the provided level.
   *
   * If both szewTwinId and iVaultId are provided, the key will be saved to both levels.
   *
   * If the key already exists, in either level, the preference will be updated.
   *
   * @throws if any error occurs while saving.
   */
  save: (arg: PreferenceArg & SZEWTwinIdArg & TokenArg) => Promise<void>;
}
