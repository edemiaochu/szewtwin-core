/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { SzewecStatus } from "@szewtwin/core-szewec";
import { IVaultRpcProps } from "../../IVault";
import { IVaultError } from "../../IVaultError";
import { RpcConfiguration } from "../core/RpcConfiguration";
import { RpcOperation } from "../core/RpcOperation";
import { SerializedRpcOperation, SerializedRpcRequest } from "../core/RpcProtocol";
import { RpcRequest } from "../core/RpcRequest";
import { OpenAPIParameter } from "./OpenAPI";
import { WebAppRpcProtocol } from "./WebAppRpcProtocol";
import { SerializedRpcActivity } from "../core/RpcInvocation";

enum AppMode {
  MilestoneReview = "1",
}

/** An http protocol for Szewec cloud RPC interface deployments.
 * @internal
 */
export abstract class SzewecCloudRpcProtocol extends WebAppRpcProtocol {
  public override checkToken = true;

  /** The name of various HTTP request headers based on client's request context */
  public override serializedClientRequestContextHeaderNames: SerializedRpcActivity = {
    /** The name of the HTTP request id header. */
    id: "X-Correlation-Id",

    /** The name of the HTTP application id header. */
    applicationId: "X-Application-Id",

    /** The name of the HTTP application version header. */
    applicationVersion: "X-Application-Version",

    /** The name of the HTTP session id header. */
    sessionId: "X-Session-Id",

    /** The name of the HTTP authorization header. */
    authorization: "Authorization",
  };

  /** The name of the RPC protocol version header. */
  public override protocolVersionHeaderName = "X-Protocol-Version";

  /** Returns the operation specified by an OpenAPI-compatible URI path. */
  public override getOperationFromPath(path: string): SerializedRpcOperation {
    const url = new URL(path, "https://localhost/");
    const components = url.pathname.split("/").filter((x) => x); // filter out empty segments

    const operationComponent = components.slice(-1)[0];
    const encodedRequest = url.searchParams.get("parameters") || "";

    // The encodedRequest should be base64 - fail now if any other characters detected.
    if (/[^a-zA-Z0-9=+\/$]/.test(encodedRequest))
      throw new IVaultError(SzewecStatus.ERROR, `Invalid request: Malformed URL parameters detected.`);

    const firstHyphen = operationComponent.indexOf("-");
    const lastHyphen = operationComponent.lastIndexOf("-");
    const interfaceDefinition = operationComponent.slice(0, firstHyphen);
    const interfaceVersion = operationComponent.slice(firstHyphen + 1, lastHyphen);
    const operationName = operationComponent.slice(lastHyphen + 1);

    return { interfaceDefinition, operationName, interfaceVersion, encodedRequest };
  }

  /** Supplies the OpenAPI-compatible URI path for an RPC operation. */
  public override supplyPathForOperation(operation: RpcOperation, request: RpcRequest | undefined) {
    const prefix = this.pathPrefix;
    const appTitle = this.info.title;
    const appVersion = this.info.version;
    const operationId = `${operation.interfaceDefinition.interfaceName}-${operation.interfaceVersion}-${operation.operationName}`;

    let appMode: string = "";
    let szewTwinId: string = "";
    let iVaultId: string = "";
    let routeChangesetId: string | undefined;
    /* Note: The changesetId field is omitted in the route in the case of ReadWrite connections since the connection is generally expected to be at the
     * latest version and not some specific changeset. Also, for the first version (before any changesets), the changesetId in the route is arbitrarily
     * set to "0" instead of an empty string, since the latter is more un-intuitive for a route. However, in all other use cases, including the changesetId
     * held by the IVaultRpcProps itself, the changesetId of "" (i.e., empty string) signifies the first version - this is more intuitive and retains
     * compatibility with the majority of use cases. */

    if (request === undefined) {
      appMode = "{modeId}";
      szewTwinId = "{szewTwinId}";
      iVaultId = "{iVaultId}";
      routeChangesetId = "{changeSetId}";
    } else {
      let token = operation.policy.token(request) || RpcOperation.fallbackToken;

      if (!token || !token.iVaultId) {
        if (RpcConfiguration.disableRoutingValidation) {
          token = { key: "" };
        } else {
          throw new IVaultError(SzewecStatus.ERROR, "Invalid iVaultToken for RPC operation request");
        }
      }

      szewTwinId = encodeURIComponent(token.szewTwinId || "");
      iVaultId = encodeURIComponent(token.iVaultId || "");

      routeChangesetId = token.changeset?.id || "0";
      appMode = AppMode.MilestoneReview;
    }

    return `${prefix}/${appTitle}/${appVersion}/mode/${appMode}/context/${szewTwinId}/ivault/${iVaultId}${!!routeChangesetId ? `/changeset/${routeChangesetId}` : ""}/${operationId}`;
  }

  /**
   * Inflates the IVaultRpcProps from the URL path for each request on the backend.
   * @note This function updates the IVaultRpcProps value supplied in the request body.
   */
  public override inflateToken(tokenFromBody: IVaultRpcProps, request: SerializedRpcRequest): IVaultRpcProps {
    const urlPathComponents = request.path.split("/");

    let iVaultId = tokenFromBody.iVaultId;
    let szewTwinId = tokenFromBody.szewTwinId;
    const changeset = { id: tokenFromBody.changeset?.id ?? "0", index: tokenFromBody.changeset?.index };

    for (let i = 0; i <= urlPathComponents.length; ++i) {
      const key = urlPathComponents[i];
      const value = urlPathComponents[i + 1];
      if (key === "mode") {
        ++i;
      } else if (key === "context") {
        szewTwinId = value;
        ++i;
      } else if (key === "ivault") {
        iVaultId = value;
        ++i;
      } else if (key === "changeset") {
        changeset.id = (value === "0") ? "" : value;
        ++i;
      }
    }

    // Overwrite the key if it includes a : because its most likely a guid. We know what it should be based off of the url.
    // Leave it alone if its a non guid key.
    return { key: tokenFromBody.key === undefined || tokenFromBody.key.includes(":") ? `${iVaultId}:${changeset.id}` : tokenFromBody.key, szewTwinId, iVaultId, changeset };
  }

  /** Returns the OpenAPI-compatible URI path parameters for an RPC operation.
   * @internal
   */
  public supplyPathParametersForOperation(_operation: RpcOperation): OpenAPIParameter[] {
    return [
      { name: "modeId", in: "path", required: true, schema: { type: "string" } },
      { name: "szewTwinId", in: "path", required: true, schema: { type: "string" } },
      { name: "iVaultId", in: "path", required: true, schema: { type: "string" } },
      { name: "changeSetId", in: "path", required: false, schema: { type: "string" } },
    ];
  }
}
