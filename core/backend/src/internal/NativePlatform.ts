/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IVaultHost
 */

import { IVaultJsNative, NativeLibrary } from "@szewec/ivaultjs-native";
import { Logger, ProcessDetector } from "@szewtwin/core-szewec";

let nativePlatform: typeof IVaultJsNative | undefined;

let syncNativeLogLevelsOverride: (() => void) | undefined;

function syncNativeLogLevels() {
  if (syncNativeLogLevelsOverride) {
    syncNativeLogLevelsOverride();
  } else {
    nativePlatform?.clearLogLevelCache();
  }
}

/** Provides access to the internal APIs defined in @szewec/ivaultjs-native.
 * @internal
 */
export class IVaultNative {
  public static get platform(): typeof IVaultJsNative {
    if (undefined === nativePlatform) {
      throw new Error("IVaultHost.startup must be called first");
    }

    return nativePlatform;
  }
}

/** @internal Strictly to be called by IVaultHost.startup. */
export function loadNativePlatform(): void {
  if (undefined === nativePlatform) {
    nativePlatform = ProcessDetector.isMobileAppBackend ? (process as any)._linkedBinding("iVaultJsNative") as typeof IVaultJsNative : NativeLibrary.load();
    nativePlatform.logger = Logger;
    Logger.onLogLevelChanged.addListener(() => syncNativeLogLevels());
  }
}

/** @internal Strictly for tests. */
export function overrideSyncNativeLogLevels(func?: () => void): void {
  syncNativeLogLevelsOverride = func;
}
