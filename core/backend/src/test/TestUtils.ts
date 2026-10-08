/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { IVaultJsNative, NativeLoggerCategory } from "@szewec/ivaultjs-native";
import { SzewecLoggerCategory, Logger, LogLevel, ProcessDetector } from "@szewtwin/core-szewec";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { IVaultHost, IVaultHostOptions } from "../IVaultHost";
import { IVaultNative } from "../internal/NativePlatform";

/** Class for simple test timing */
export class Timer {
  private _label: string;
  private _start: Date;
  constructor(label: string) {
    this._label = `\t${label}`;
    this._start = new Date();
  }

  public end() {
    const stop = new Date();
    const elapsed = stop.getTime() - this._start.getTime();
    // eslint-disable-next-line no-console
    console.log(`${this._label}: ${elapsed}ms`);
  }
}

/**
 * Disables native code assertions from firing. This can be used by tests that intentionally
 * test failing operations. If those failing operations raise assertions in native code, the test
 * would fail unexpectedly in a debug build. In that case the native code assertions can be disabled with
 * this class.
 */
export class DisableNativeAssertions implements Disposable {
  private _native: IVaultJsNative.DisableNativeAssertions | undefined;

  constructor() {
    this._native = new IVaultNative.platform.DisableNativeAssertions();
  }

  public [Symbol.dispose](): void {
    if (!this._native)
      return;

    this._native.dispose();
    this._native = undefined;
  }

  /** @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [Symbol.dispose] instead. */
  public dispose(): void {
    this[Symbol.dispose]();
  }
}

export class TestUtils {
  private static shouldLogToConsole(): boolean {
    return process.env.SZEWTWINJS_CORE_BACKEND_TEST_LOG_TO_CONSOLE === "1";
  }

  public static getCacheDir(fallback: string | undefined = undefined) {
    if (ProcessDetector.isMobileAppBackend) {
      return undefined; // Let the native side handle the cache.
    }
    return fallback ?? path.join(__dirname, ".cache"); // Set the cache dir to be under the lib directory.
  }

  /** Handles the startup of IVaultHost.
   * The provided config is used and will override any of the default values used in this method.
   *
   * The default includes:
   * - cacheDir = path.join(__dirname, ".cache")
   * - allowSharedChannel = false;
   */
  public static async startBackend(config?: IVaultHostOptions): Promise<void> {
    const cfg = config ?? {};
    cfg.cacheDir = TestUtils.getCacheDir(cfg.cacheDir);
    cfg.allowSharedChannel ??= false; // Override default to test shared channel enforcement. Remove in version 5.0.
    cfg.implicitWriteEnforcement ??= "throw";
    await IVaultHost.startup(cfg);
  }

  public static async shutdownBackend(): Promise<void> {
    return IVaultHost.shutdown();
  }

  public static setupLogging() {
    if (TestUtils.shouldLogToConsole())
      Logger.initializeToConsole();
    else
      Logger.initialize();
    Logger.setLevelDefault(LogLevel.Error);
  }

  private static initDebugLogLevels(reset?: boolean) {
    Logger.setLevelDefault(reset ? LogLevel.Error : LogLevel.Warning);
    Logger.setLevel(SzewecLoggerCategory.Performance, reset ? LogLevel.Error : LogLevel.Info);
    Logger.setLevel(BackendLoggerCategory.IVaultDb, reset ? LogLevel.Error : LogLevel.Trace);
    Logger.setLevel(NativeLoggerCategory.BldCore, reset ? LogLevel.Error : LogLevel.Trace);
    Logger.setLevel(NativeLoggerCategory.BeSQLite, reset ? LogLevel.Error : LogLevel.Trace);
  }

  // Setup typical programmatic log level overrides here
  // Convenience method used to debug specific tests/fixtures
  public static setupDebugLogLevels() {
    TestUtils.initDebugLogLevels(false);
  }

  public static resetDebugLogLevels() {
    TestUtils.initDebugLogLevels(true);
  }
}

// The very first "before" run to initially setup the logging and initial backend.
before(async () => {
  TestUtils.setupLogging();
  await TestUtils.startBackend();
});

after(async () => {
  await TestUtils.shutdownBackend();
});

