/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SzewecCloudRpcConfiguration, SzewecCloudRpcProtocol, OpenAPIInfo } from "@szewtwin/core-common";
import * as http from "http";
import * as sinon from "sinon";
import { IVaultJsExpressServer } from "../express-server";

export class FakeSzewecCloudRpcConfiguration extends SzewecCloudRpcConfiguration {

  private static info: OpenAPIInfo = { title: "randomTitle", version: "randomVersion" }; // eslint-disable-line @typescript-eslint/no-deprecated

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private protocolClass = class extends SzewecCloudRpcProtocol {
    public override pathPrefix = "randomPathPrefix";
    public info = FakeSzewecCloudRpcConfiguration.info;
  };

  /** @implements */
  public interfaces = () => [];

  /** @implements */
  public protocol: SzewecCloudRpcProtocol = new this.protocolClass(this);
}

const fakeHttpServer = {
  listen: async (_opts: any, cb: any) => {
    await new Promise((resolve) => setImmediate(resolve));
    cb();
  },
} as any;

export class TestIVaultJsExpressServer extends IVaultJsExpressServer {
  public get expressApp() { return this._app; }

  // Wrap base initialize so we configure express app, but don't actually listen on any ports
  public override async initialize(port: number) {
    const httpStub = sinon.stub(http, "createServer").returns(fakeHttpServer);
    const server = super.initialize(port);
    httpStub.restore();
    return server;
  }
}
