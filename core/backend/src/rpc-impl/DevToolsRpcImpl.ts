/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */
import { LogLevel } from "@szewtwin/core-szewec";
import { DevToolsRpcInterface, DevToolsStatsOptions, IVaultRpcProps, RpcInterface, RpcManager } from "@szewtwin/core-common";
import { DevTools, DevToolsStatsFormatter } from "../DevTools";

/** The backend implementation of DevToolsRpcInterface.
 * @internal
 */
export class DevToolsRpcImpl extends RpcInterface implements DevToolsRpcInterface {
  public static register() { RpcManager.registerImpl(DevToolsRpcInterface, DevToolsRpcImpl); }

  // Returns true if the backend received the ping
  public async ping(_tokenProps: IVaultRpcProps): Promise<boolean> {
    return DevTools.ping();
  }

  // Returns JSON object with statistics
  public async stats(_tokenProps: IVaultRpcProps, options: DevToolsStatsOptions): Promise<any> {
    const stats = DevTools.stats();
    if (options === DevToolsStatsOptions.None)
      return stats;
    const formattedStats = DevToolsStatsFormatter.toFormattedJson(stats);
    return formattedStats;
  }

  // Returns JSON object with backend versions (application and iVaultJs)
  public async versions(_tokenProps: IVaultRpcProps): Promise<any> {
    return DevTools.versions();
  }

  // Sets up a log level at the backend
  public async setLogLevel(_tokenProps: IVaultRpcProps, loggerCategory: string, logLevel: LogLevel): Promise<LogLevel | undefined> {
    return DevTools.setLogLevel(loggerCategory, logLevel);
  }
}
