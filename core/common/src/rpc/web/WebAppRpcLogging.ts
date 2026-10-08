/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { SzewecStatus, Logger } from "@szewtwin/core-szewec";
import { CommonLoggerCategory } from "../../CommonLoggerCategory";
import { IVaultError } from "../../IVaultError";
import { RpcInterfaceDefinition } from "../../RpcInterface";
import { RpcProtocolEvent } from "../core/RpcConstants";
import { RpcInvocation } from "../core/RpcInvocation";
import { RpcOperation } from "../core/RpcOperation";
import { SerializedRpcOperation, SerializedRpcRequest } from "../core/RpcProtocol";
import { RpcRequest } from "../core/RpcRequest";
import { WebAppRpcRequest } from "./WebAppRpcRequest";

/* eslint-disable @typescript-eslint/no-deprecated */

/** @internal */
const BACKEND = Symbol.for("@szewtwin.WebAppRpcLogging.Backend");
const FRONTEND = Symbol.for("@szewtwin.WebAppRpcLogging.Frontend");

/** @internal */
export abstract class WebAppRpcLogging {
  public static initializeBackend(instance: WebAppRpcLogging) {
    (globalThis as any)[BACKEND] = instance;
  }

  public static initializeFrontend(instance: WebAppRpcLogging) {
    (globalThis as any)[FRONTEND] = instance;
  }

  private static get backend(): WebAppRpcLogging {
    const instance = (globalThis as any)[BACKEND];
    if (typeof (instance) === "undefined") {
      throw new IVaultError(SzewecStatus.ERROR, "Backend logging is not initialized.");
    }

    return instance;
  }

  private static get frontend(): WebAppRpcLogging {
    const instance = (globalThis as any)[FRONTEND];
    if (typeof (instance) === "undefined") {
      throw new IVaultError(SzewecStatus.ERROR, "Frontend logging is not initialized.");
    }

    return instance;
  }

  public static async logProtocolEvent(event: RpcProtocolEvent, object: RpcRequest | RpcInvocation): Promise<void> {
    if (object instanceof WebAppRpcRequest) {
      await WebAppRpcLogging.frontend.logProtocolEvent(event, object);
    } else if (object instanceof RpcInvocation) {
      await WebAppRpcLogging.backend.logProtocolEvent(event, object);
    }
  }

  protected abstract logProtocolEvent(event: RpcProtocolEvent, object: RpcRequest | RpcInvocation): Promise<void>;

  protected abstract getHostname(): string;

  protected getRpcInterfaceName(g: string | RpcInterfaceDefinition): string {
    return (typeof g === "string") ? g : g.interfaceName;
  }

  protected findPathIds(path: string) {
    let szewTwinId = "";
    let iVaultId = "";

    const tokens = path.split("/");
    for (let i = 0; i !== tokens.length; ++i) {
      // For backwards compatibility, find old "context" or current "szewTwin" terminology
      if ((/^context$/i).test(tokens[i]) || (/^szewtwin$/i).test(tokens[i])) {
        szewTwinId = tokens[i + 1] || "";
      }

      if ((/^ivault$/i).test(tokens[i])) {
        iVaultId = tokens[i + 1] || "";
      }
    }

    return { szewTwinId, iVaultId };
  }

  protected buildOperationDescriptor(operation: RpcOperation | SerializedRpcOperation): string {
    if (!operation) {
      return "unknown.unknown";
    }

    const interfaceName = typeof (operation.interfaceDefinition) === "string" ? operation.interfaceDefinition : operation.interfaceDefinition.interfaceName;
    const operationName = operation.operationName;
    return `${interfaceName}.${operationName}`;
  }

  protected logRequest(loggerCategory: string, message: string, object: WebAppRpcRequest | SerializedRpcRequest): void {
    const operationDescriptor = this.buildOperationDescriptor(object.operation);
    const pathIds = this.findPathIds(object.path);

    Logger.logTrace(loggerCategory, `${message}.${operationDescriptor}`, () => ({
      method: object.method,
      path: object.path,
      operation: object.operation.operationName,
      rpcInterface: this.getRpcInterfaceName(object.operation.interfaceDefinition),
      // Alert! The following properties are required by Szewec DevOps standards. Do not change their names!
      ActivityId: object.id, // eslint-disable-line @typescript-eslint/naming-convention
      TimeElapsed: ("elapsed" in object) ? object.elapsed : 0, // eslint-disable-line @typescript-eslint/naming-convention
      MachineName: this.getHostname(), // eslint-disable-line @typescript-eslint/naming-convention
      ...pathIds,
    }));
  }

  protected logResponse(loggerCategory: string, message: string, object: WebAppRpcRequest | SerializedRpcRequest, status: number, elapsed: number): void {
    const operationDescriptor = this.buildOperationDescriptor(object.operation);
    const pathIds = this.findPathIds(object.path);

    Logger.logTrace(loggerCategory, `${message}.${operationDescriptor}`, () => ({
      method: object.method,
      path: object.path,
      operation: object.operation.operationName,
      rpcInterface: this.getRpcInterfaceName(object.operation.interfaceDefinition),
      status,
      // Alert! The following properties are required by Szewec DevOps standards. Do not change their names!
      ActivityId: object.id, // eslint-disable-line @typescript-eslint/naming-convention
      TimeElapsed: elapsed, // eslint-disable-line @typescript-eslint/naming-convention
      MachineName: this.getHostname(), // eslint-disable-line @typescript-eslint/naming-convention
      ...pathIds,
    }));
  }
}

declare global {
   
  var window: any;
}

class WebAppRpcLoggingFrontend extends WebAppRpcLogging {
  protected override async logProtocolEvent(event: RpcProtocolEvent, object: WebAppRpcRequest): Promise<void> {
    switch (event) {
      case RpcProtocolEvent.RequestCreated: return this.logRequest(CommonLoggerCategory.RpcInterfaceFrontend, "RpcInterface.frontend.request", object);
      case RpcProtocolEvent.ResponseLoaded: return this.logResponse(CommonLoggerCategory.RpcInterfaceFrontend, "RpcInterface.frontend.response", object, object.metadata.status, object.elapsed);
      case RpcProtocolEvent.ConnectionErrorReceived: return this.logErrorFrontend("RpcInterface.frontend.connectionError", object);
      case RpcProtocolEvent.ConnectionAborted: return this.logErrorFrontend("RpcInterface.frontend.connectionAborted", object);
    }
  }

  protected override getHostname(): string {
    return globalThis.window?.location?.host ?? "ivaultjs-mobile";
  }

  private logErrorFrontend(message: string, request: WebAppRpcRequest): void {
    const operationDescriptor = this.buildOperationDescriptor(request.operation);
    const pathIds = this.findPathIds(request.path);

    Logger.logInfo(CommonLoggerCategory.RpcInterfaceFrontend, `${message}.${operationDescriptor}`, () => ({
      method: request.method,
      path: request.path,
      // Alert! The following properties are required by Szewec DevOps standards. Do not change their names!
      ActivityId: request.id, // eslint-disable-line @typescript-eslint/naming-convention
      MachineName: this.getHostname(), // eslint-disable-line @typescript-eslint/naming-convention
      ...pathIds,
    }));
  }
}

WebAppRpcLogging.initializeFrontend(new WebAppRpcLoggingFrontend());
