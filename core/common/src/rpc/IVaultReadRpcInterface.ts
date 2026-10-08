/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import { CompressedId64Set, GuidString, Id64String, IVaultStatus } from "@szewtwin/core-szewec";
import { Range3dProps } from "@szewtwin/core-geometry";
import { CodeProps } from "../Code";
import { DbBlobRequest, DbBlobResponse, DbQueryRequest, DbQueryResponse } from "../ConcurrentQuery";
import { ElementMeshRequestProps } from "../ElementMesh";
import { ElementLoadOptions, ElementProps } from "../ElementProps";
import { EntityQueryParams } from "../EntityProps";
import { FontMapProps } from "../Fonts";
import {
  GeoCoordinatesRequestProps, GeoCoordinatesResponseProps, IVaultCoordinatesRequestProps, IVaultCoordinatesResponseProps,
} from "../GeoCoordinateServices";
import { GeometryContainmentRequestProps, GeometryContainmentResponseProps } from "../GeometryContainment";
import { GeometrySummaryRequestProps } from "../GeometrySummary";
import { IVaultConnectionProps, IVaultRpcOpenProps, IVaultRpcProps } from "../IVault";
import {
  MassPropertiesPerCandidateRequestProps, MassPropertiesPerCandidateResponseProps, MassPropertiesRequestProps, MassPropertiesResponseProps,
} from "../MassProperties";
import { ModelProps } from "../ModelProps";
import { RpcInterface } from "../RpcInterface";
import { RpcManager } from "../RpcManager";
import { SnapRequestProps, SnapResponseProps } from "../internal/Snapping";
import { TextureData, TextureLoadProps } from "../TextureProps";
import {
  CustomViewState3dCreatorOptions, CustomViewState3dProps, HydrateViewStateRequestProps, HydrateViewStateResponseProps, SubCategoryResultRow,
  ViewStateLoadProps, ViewStateProps,
} from "../ViewProps";
import { RpcResponseCacheControl } from "./core/RpcConstants";
import { RpcNotFoundResponse } from "./core/RpcControl";
import { RpcOperation } from "./core/RpcOperation";
import { RpcRoutingToken } from "./core/RpcRoutingToken";

/** Response if the IVaultDb was not found at the backend
 * (if the service has moved)
 * @public
 */
export class IVaultNotFoundResponse extends RpcNotFoundResponse {
  public isIVaultNotFoundResponse: boolean = true;
  public override message = "iVault not found";
}

/** Describes the volume of geometry contained with a [GeometricModel]($backend) as returned by
 * [IVaultConnection.Models.queryExtents]($frontend) and [IVaultDb.Models.queryExtents]($backend).
 * @public
 */
export interface ModelExtentsProps {
  /** The Id of the model, or [Id64.invalid]($szewec) if the input model Id was not a well-formed [Id64String]($szewec). */
  id: Id64String;
  /** The volume of geometry contained within the model.
   * This range will be null (@see [Range3d.isNull]($geometry)) if [[status]] is not [IVaultStatus.Success]($szewec) or the model contains no geometry.
   */
  extents: Range3dProps;
  /** A status code indicating what if any error occurred obtaining the model's extents. For example:
   *  - [IVaultStatus.InvalidId]($szewec) if the input model Id was not a well-formed [Id64String]($szewec);
   *  - [IVaultStatus.NotFound]($szewec) if no model with the specified Id exists in the [[IVault]];
   *  - [IVaultStatus.WrongModel]($szewec) if the specified model is not a [GeometricModel]($backend); or
   *  - [IVaultStatus.Success]($szewec) if the extents were successfully obtained.
   *
   * If `status` is anything other than [IVaultStatus.Success]($szewec), [[extents]] will be a null range.
   */
  status: IVaultStatus;
}

/** The RPC interface for reading from an iVault.
 * All operations only require read-only access.
 * This interface is not normally used directly. See IVaultConnection for higher-level and more convenient API for accessing iVaults from a frontend.
 * @internal
 */
export abstract class IVaultReadRpcInterface extends RpcInterface {
  /** Returns the IVaultReadRpcInterface instance for the frontend. */
  public static getClient(): IVaultReadRpcInterface { return RpcManager.getClientForInterface(IVaultReadRpcInterface); }

  /** Returns the IVaultReadRpcInterface instance for a custom RPC routing configuration. */
  public static getClientForRouting(token: RpcRoutingToken): IVaultReadRpcInterface { return RpcManager.getClientForInterface(IVaultReadRpcInterface, token); }

  /** The immutable name of the interface. */
  public static readonly interfaceName = "IVaultReadRpcInterface";

  /** The semantic version of the interface. */
  public static interfaceVersion = "3.8.0";

  /*===========================================================================================
    NOTE: Any add/remove/change to the methods below requires an update of the interface version.
    NOTE: Please consult the README in this folder for the semantic versioning rules.
  ===========================================================================================*/
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getConnectionProps(_iVaultToken: IVaultRpcOpenProps): Promise<IVaultConnectionProps> { return this.forward(arguments); }
  public async queryRows(_iVaultToken: IVaultRpcProps, _request: DbQueryRequest): Promise<DbQueryResponse> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async querySubCategories(_iVaultToken: IVaultRpcProps, _categoryIds: CompressedId64Set): Promise<SubCategoryResultRow[]> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async queryAllUsedSpatialSubCategories(_iVaultToken: IVaultRpcProps): Promise<SubCategoryResultRow[]> { return this.forward(arguments); }
  public async queryBlob(_iVaultToken: IVaultRpcProps, _request: DbBlobRequest): Promise<DbBlobResponse> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getModelProps(_iVaultToken: IVaultRpcProps, _modelIds: Id64String[]): Promise<ModelProps[]> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async queryModelRanges(_iVaultToken: IVaultRpcProps, _modelIds: Id64String[]): Promise<Range3dProps[]> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async queryModelExtents(_iVaultToken: IVaultRpcProps, _modelIds: Id64String[]): Promise<ModelExtentsProps[]> { return this.forward(arguments); }
  public async queryModelProps(_iVaultToken: IVaultRpcProps, _params: EntityQueryParams): Promise<ModelProps[]> { return this.forward(arguments); }
  public async getElementProps(_iVaultToken: IVaultRpcProps, _elementIds: Id64String[]): Promise<ElementProps[]> { return this.forward(arguments); }
  public async queryElementProps(_iVaultToken: IVaultRpcProps, _params: EntityQueryParams): Promise<ElementProps[]> { return this.forward(arguments); }
  public async queryEntityIds(_iVaultToken: IVaultRpcProps, _params: EntityQueryParams): Promise<Id64String[]> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getClassHierarchy(_iVaultToken: IVaultRpcProps, _startClassName: string): Promise<string[]> { return this.forward(arguments); }
  public async getAllCodeSpecs(_iVaultToken: IVaultRpcProps): Promise<any[]> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getViewStateData(_iVaultToken: IVaultRpcProps, _viewDefinitionId: string, _options?: ViewStateLoadProps): Promise<ViewStateProps> { return this.forward(arguments); }
  public async readFontJson(_iVaultToken: IVaultRpcProps): Promise<FontMapProps> { return this.forward(arguments); } // eslint-disable-line @typescript-eslint/no-deprecated
  public async getToolTipMessage(_iVaultToken: IVaultRpcProps, _elementId: string): Promise<string[]> { return this.forward(arguments); }
  /** @deprecated in 3.3.0 - might be removed in next major version. Use ViewStore apis. */
  public async getViewThumbnail(_iVaultToken: IVaultRpcProps, _viewId: string): Promise<Uint8Array> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getDefaultViewId(_iVaultToken: IVaultRpcProps): Promise<Id64String> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getCustomViewState3dData(_iVaultToken: IVaultRpcProps, _options: CustomViewState3dCreatorOptions): Promise<CustomViewState3dProps> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async hydrateViewState(_iVaultToken: IVaultRpcProps, _options: HydrateViewStateRequestProps): Promise<HydrateViewStateResponseProps> { return this.forward(arguments); }
  public async requestSnap(_iVaultToken: IVaultRpcProps, _sessionId: string, _props: SnapRequestProps): Promise<SnapResponseProps> { return this.forward(arguments); }
  public async cancelSnap(_iVaultToken: IVaultRpcProps, _sessionId: string): Promise<void> { return this.forward(arguments); }
  public async getGeometryContainment(_iVaultToken: IVaultRpcProps, _props: GeometryContainmentRequestProps): Promise<GeometryContainmentResponseProps> { return this.forward(arguments); }
  public async getMassProperties(_iVaultToken: IVaultRpcProps, _props: MassPropertiesRequestProps): Promise<MassPropertiesResponseProps> { return this.forward(arguments); }
  public async getMassPropertiesPerCandidate(_iVaultToken: IVaultRpcProps, _props: MassPropertiesPerCandidateRequestProps): Promise<MassPropertiesPerCandidateResponseProps[]> { return this.forward(arguments); }  // eslint-disable-line @typescript-eslint/no-deprecated
  public async getIVaultCoordinatesFromGeoCoordinates(_iVaultToken: IVaultRpcProps, _props: IVaultCoordinatesRequestProps): Promise<IVaultCoordinatesResponseProps> { return this.forward(arguments); }
  @RpcOperation.allowResponseCaching(RpcResponseCacheControl.Immutable)
  public async getGeoCoordinatesFromIVaultCoordinates(_iVaultToken: IVaultRpcProps, _props: GeoCoordinatesRequestProps): Promise<GeoCoordinatesResponseProps> { return this.forward(arguments); }
  public async getGeometrySummary(_iVaultToken: IVaultRpcProps, _props: GeometrySummaryRequestProps): Promise<string> { return this.forward(arguments); }
  public async queryTextureData(_iVaultToken: IVaultRpcProps, _textureLoadProps: TextureLoadProps): Promise<TextureData | undefined> { return this.forward(arguments); }
  public async loadElementProps(_iVaultToken: IVaultRpcProps, _elementIdentifier: Id64String | GuidString | CodeProps, _options?: ElementLoadOptions): Promise<ElementProps | undefined> {
    return this.forward(arguments);
  }
  public async generateElementMeshes(_iVaultToken: IVaultRpcProps, _props: ElementMeshRequestProps): Promise<Uint8Array> {
    return this.forward(arguments);
  }
  /** @internal */
  public async callViewStore(_iVaultToken: IVaultRpcProps, _version: string, _forWrite: boolean, _methodName: string, ..._args: any[]): Promise<any> { return this.forward(arguments); }
}
