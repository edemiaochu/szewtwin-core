/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as express from "express";
import * as enableWs from "express-ws";
import { Server as HttpServer } from "http";
import { SzewecCloudRpcConfiguration, RpcConfiguration, WebAppRpcProtocol } from "@szewtwin/core-common";
import { LocalhostIpcHost } from "@szewtwin/core-backend";

/**
 * Options for configuring IVaultJsExpressServer.
 * @public
 */
export interface IVaultJsExpressServerConfig {
  uploadLimit: string;
}

/**
 * An express web server with some reasonable defaults for web applications built with @szewec/webpack-tools.
 * @note This server is not designed to be a hardened, secure endpoint on the public internet.
 *       It is intended to participate in a private HTTP exchange with a public-facing routing and provisioning infrastructure
 *       that should be supplied by the application's deployment environment.
 * @public
 */
export class IVaultJsExpressServer {
  /** The default configuration for servers. */
  public static readonly defaults: IVaultJsExpressServerConfig = {
    uploadLimit: "5mb",
  };

  private _protocol: WebAppRpcProtocol;
  private _config: IVaultJsExpressServerConfig;
  protected _app: import("express").Application = express();

  /** @alpha */
  public get rpcConfiguration(): RpcConfiguration { return this._protocol.configuration; }

  constructor(protocol: WebAppRpcProtocol, config = IVaultJsExpressServer.defaults) {
    this._protocol = protocol;
    this._config = config;
  }

  protected _configureMiddleware() {
    this._app.use(express.text({ limit: this._config.uploadLimit }));
    this._app.use(express.raw({ limit: this._config.uploadLimit }));
  }

  protected _configureHeaders() {
    // enable CORS for all apis
    this._app.all("/**", (_req, res, next) => {
      res.header("Access-Control-Allow-Origin", SzewecCloudRpcConfiguration.accessControl.allowOrigin);
      res.header("Access-Control-Allow-Methods", SzewecCloudRpcConfiguration.accessControl.allowMethods);
      res.header("Access-Control-Allow-Headers", SzewecCloudRpcConfiguration.accessControl.allowHeaders);
      next();
    });
  }

  protected _configureRoutes() {
    this._app.get("/v3/swagger.json", (req, res) => this._protocol.handleOpenApiDescriptionRequest(req, res));
    this._app.post("*", async (req, res) => this._protocol.handleOperationPostRequest(req, res));
    this._app.get(/\/ivault\//, async (req, res) => this._protocol.handleOperationGetRequest(req, res));
    this._app.get("/ping", async (_req, res) => res.status(200).send("Success"));
    // for all HTTP requests, identify the server.
    this._app.use("*", (_req, resp) => {
      resp.send("<h1>IVaultJs RPC Server</h1>");
    });
  }

  /**
   * Configure the express application with necessary headers, routes, and middleware, then starts listening on the given port.
   * @param port The port to listen on
   */
  public async initialize(port: number | string): Promise<HttpServer> {
    this._configureMiddleware();
    this._configureHeaders();
    this._configureRoutes();

    this._app.set("port", port);
    return new Promise<HttpServer>((resolve) => {
      const server: HttpServer = this._app.listen(this._app.get("port"), () => resolve(server));
    });
  }
}

/**
 * @alpha
 */
export class WebEditServer extends IVaultJsExpressServer {
  protected override _configureRoutes() {
    (this._app as any).ws("/ipc", (ws: any, _req: any) => LocalhostIpcHost.connect(ws));
    super._configureRoutes();
  }

  constructor(protocol: WebAppRpcProtocol, config = IVaultJsExpressServer.defaults) {
    super(protocol, config);
    enableWs(this._app);
  }
}
