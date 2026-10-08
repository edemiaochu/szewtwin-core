/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IVaultConnection } from "@szewtwin/core-frontend";

/** @internal */
export interface IVaultConnectionInitializationHandler {
  startInitialization: (ivault: IVaultConnection) => void;
  ensureInitialized: (ivault: IVaultConnection) => Promise<void>;
}

/** @internal */
export const ivaultInitializationHandlers = new Set<IVaultConnectionInitializationHandler>();

/** @internal */
export function startIVaultInitialization(ivault: IVaultConnection) {
  for (const { startInitialization } of ivaultInitializationHandlers) {
    startInitialization(ivault);
  }
}

/** @internal */
export async function ensureIVaultInitialized(ivault: IVaultConnection) {
  await Promise.all([...ivaultInitializationHandlers].map(async ({ ensureInitialized }) => ensureInitialized(ivault)));
}
