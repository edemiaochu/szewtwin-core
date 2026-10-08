/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { Logger } from "@szewtwin/core-szewec";
import { CommonLoggerCategory, RpcInvocation, RpcProtocolEvent, WebAppRpcLogging } from "@szewtwin/core-common";
import * as os from "os";

/* eslint-disable @typescript-eslint/no-deprecated */

export class WebAppRpcLoggingBackend extends WebAppRpcLogging {
  protected override async logProtocolEvent(event: RpcProtocolEvent, object: RpcInvocation): Promise<void> {
    switch (event) {
      case RpcProtocolEvent.RequestReceived: return this.logRequest(CommonLoggerCategory.RpcInterfaceBackend, "RpcInterface.backend.request", object.request);
      case RpcProtocolEvent.BackendErrorOccurred: return this.logErrorBackend("RpcInterface.backend.error", object);
      case RpcProtocolEvent.BackendResponseCreated: return this.logResponse(CommonLoggerCategory.RpcInterfaceBackend, "RpcInterface.backend.response", object.request, object.status, object.elapsed);
    }
  }

  protected override getHostname(): string {
    return os.hostname();
  }

  private async logErrorBackend(message: string, invocation: RpcInvocation): Promise<void> {
    const operationDescriptor = this.buildOperationDescriptor(invocation.operation);
    const pathIds = this.findPathIds(invocation.request.path);
    const result = await invocation.result;
    const errorMessage = result.message ? result.message : result.objects; // Can be an error or an RpcSerializedValue

    const metadata = {
      method: invocation.request.method,
      path: invocation.request.path,
      status: invocation.status,
      errorMessage,
      // Alert! The following properties are required by Szewec DevOps standards. Do not change their names!
      ActivityId: invocation.request.id, // eslint-disable-line @typescript-eslint/naming-convention
      MachineName: this.getHostname(), // eslint-disable-line @typescript-eslint/naming-convention
      ...pathIds,
    };

    Logger.logError(CommonLoggerCategory.RpcInterfaceBackend, `${message}.${operationDescriptor}`, metadata);
  }
}
