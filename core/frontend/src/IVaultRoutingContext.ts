/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IVaultConnection
 */
import { SzewecStatus  } from "@szewtwin/core-szewec";
import { IVaultError, RpcRoutingToken } from "@szewtwin/core-common";

/**
 * Controls the RPC routing for an iVault connection.
 * @public
 */
export class IVaultRoutingContext {
  private static _current: IVaultRoutingContext | undefined;

  public static for(token: RpcRoutingToken) {
    return new IVaultRoutingContext(token);
  }

  public static readonly default = new IVaultRoutingContext(RpcRoutingToken.default);

  public static get current(): IVaultRoutingContext | undefined {
    return this._current;
  }

  public readonly token: RpcRoutingToken;

  public get active(): boolean { return IVaultRoutingContext.current === this; }

  private constructor(token: RpcRoutingToken) {
    this.token = token;
  }

  public route<T>(handler: () => T): T {
    if (IVaultRoutingContext.current) {
      throw new IVaultError(SzewecStatus.ERROR, "Concurrent use is not supported.");
    }

    IVaultRoutingContext._current = this;
    const value = handler();
    IVaultRoutingContext._current = undefined;
    return value;
  }
}
