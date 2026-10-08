/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { RpcInterfaceDefinition } from "../../RpcInterface";
import { RpcManager } from "../../RpcManager";
import { RpcConfiguration } from "../core/RpcConfiguration";
import { RpcRequestEvent } from "../core/RpcConstants";
import { RpcRequest, RpcRequestEventHandler } from "../core/RpcRequest";
import { SzewecCloudRpcProtocol } from "./SzewecCloudRpcProtocol";
import { OpenAPIInfo } from "./OpenAPI";
import { RpcRoutingToken } from "../core/RpcRoutingToken";

/* eslint-disable @typescript-eslint/no-deprecated */

/** Initialization parameters for SzewecCloudRpcConfiguration.
 * @beta
 */
export interface SzewecCloudRpcParams {
  /** Identifies the remote server that implements a set of RpcInterfaces. Note that the ID of the remote server is not a URI or hostname. It is a string that matches a key in the orchestrator's app registry. */
  info: OpenAPIInfo;
  /** @internal The protocol for Szewec cloud RPC interface deployments */
  protocol?: typeof SzewecCloudRpcProtocol;
  /** The URI of the orchestrator that will route requests to the remote RpcInterface server. If not supplied, this default to the origin of the Web page. This is required only when calling initializeClient and only if the server is not the origin of the Web page. */
  uriPrefix?: string;
  /** @internal Handler for RPC request events. */
  pendingRequestListener?: RpcRequestEventHandler;
  /** An optional prefix for RPC operation URI paths. */
  pathPrefix?: string;
}

/** Operating parameters for Szewec cloud RPC interface deployments.
 * @beta
 */
export abstract class SzewecCloudRpcConfiguration extends RpcConfiguration {
  /** Access-Control header values for backend servers that serve frontends using SzewecCloudRpcProtocol. */
  public static readonly accessControl = {
    allowOrigin: "*",
    allowMethods: "POST, GET, OPTIONS",
    allowHeaders: "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Correlation-Id, X-Session-Id, X-Application-Id, X-Application-Version, X-User-Id, X-Protocol-Version",
  };

  /** @internal The protocol of the configuration. */
  public abstract override readonly protocol: SzewecCloudRpcProtocol;
}

/** Coordinates usage of RPC interfaces for Szewec cloud deployments.
 * @beta
 */
export class SzewecCloudRpcManager extends RpcManager {
  /** @beta Initializes SzewecCloudRpcManager for the frontend of an application. */
  public static initializeClient(params: SzewecCloudRpcParams, interfaces: RpcInterfaceDefinition[], routing: RpcRoutingToken = RpcRoutingToken.default): SzewecCloudRpcConfiguration {
    return SzewecCloudRpcManager.performInitialization(params, interfaces, routing);
  }

  /** @beta Initializes SzewecCloudRpcManager for the backend of an application. */
  public static initializeImpl(params: SzewecCloudRpcParams, interfaces: RpcInterfaceDefinition[]): SzewecCloudRpcConfiguration {
    return SzewecCloudRpcManager.performInitialization(params, interfaces);
  }

  private static performInitialization(params: SzewecCloudRpcParams, interfaces: RpcInterfaceDefinition[], routing: RpcRoutingToken = RpcRoutingToken.default): SzewecCloudRpcConfiguration {
    const protocol = class extends (params.protocol || SzewecCloudRpcProtocol) {
      public override pathPrefix = params.uriPrefix || "";
      public info = params.info;
    };

    const config = class extends SzewecCloudRpcConfiguration {
      public interfaces = () => interfaces;
      public protocol: SzewecCloudRpcProtocol = new protocol(this);
      public override routing = routing;
    };

    for (const def of interfaces) {
      RpcConfiguration.assignWithRouting(def, routing, config);
    }

    const instance = RpcConfiguration.obtain(config);

    if (params.pathPrefix) {
      instance.protocol.pathPrefix = params.pathPrefix;
    }

    RpcConfiguration.initializeInterfaces(instance);

    if (params.pendingRequestListener) {
      const listener = params.pendingRequestListener;

      RpcRequest.events.addListener((type, request) => {
        if (type === RpcRequestEvent.PendingUpdateReceived && request.protocol === instance.protocol) {
          listener(type, request);
        }
      });
    }

    return instance;
  }
}
