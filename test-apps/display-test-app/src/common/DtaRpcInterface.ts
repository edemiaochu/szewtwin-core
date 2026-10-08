/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IVaultRpcProps, PlacementProps, RpcInterface, RpcManager, TextAnnotationProps } from "@szewtwin/core-common";
import * as http from "http";
import * as https from "https";
import { DtaConfiguration } from "./DtaConfiguration";
import { Id64String } from "@szewtwin/core-szewec";
import { FormatSet } from "@szewtwin/dmschema-metadata";

/** Display Test App RPC interface. */
export class DtaRpcInterface extends RpcInterface {
  /** The immutable name of the interface. */
  public static readonly interfaceName = "SVTRpcInterface";

  /** The version of the interface. */
  public static interfaceVersion = "1.0.0";

  /** The types that can be marshaled by the interface. */
  public static types = () => [];

  /** The backend server, when running on a browser */
  public static backendServer: http.Server | https.Server | undefined;

  public static getClient(): DtaRpcInterface { return RpcManager.getClientForInterface(DtaRpcInterface); }
  public async readExternalSavedViews(_filename: string): Promise<string> { return this.forward(arguments); }
  public async writeExternalSavedViews(_filename: string, _namedViews: string): Promise<void> { return this.forward(arguments); }
  public async readExternalCameraPaths(_filename: string): Promise<string> { return this.forward(arguments); }
  public async writeExternalCameraPaths(_filename: string, _cameraPaths: string): Promise<void> { return this.forward(arguments); }
  public async readExternalFile(_filename: string): Promise<string> { return this.forward(arguments); }
  public async writeExternalFile(_filename: string, _content: string): Promise<void> { return this.forward(arguments); }
  public async terminate(): Promise<void> { return this.forward(arguments); }
  public async getEnvConfig(): Promise<DtaConfiguration> { return this.forward(arguments); }
  public async getAccessToken(): Promise<string> { return this.forward(arguments); }
  public async generateTextAnnotationGeometry(_iVaultToken: IVaultRpcProps, _annotationProps: TextAnnotationProps, _defaultTextStyleId: Id64String, _categoryId: Id64String, _modelId: Id64String, _placementProps: PlacementProps, _wantDebugGeometry?: boolean, _renderPriority?: { annotation?: number, annotationLabels?: number }): Promise<Uint8Array | undefined> { return this.forward(arguments); }
  public async getFormatSetFromFile(_filename: string): Promise<FormatSet> { return this.forward(arguments); }
}
