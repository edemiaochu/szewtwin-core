/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RpcInterface
 */

import {
  AccessToken, assert, BeDuration, SzewecStatus, CompressedId64Set, GuidString, Id64, Id64String, IVaultStatus, Logger,
} from "@szewtwin/core-szewec";
import {
  Code, CodeProps, CustomViewState3dCreatorOptions, CustomViewState3dProps, DbBlobRequest, DbBlobResponse, DbQueryRequest, DbQueryResponse,
  ElementLoadOptions, ElementLoadProps, ElementMeshRequestProps, ElementProps, EntityMetaData, EntityQueryParams, FontMapProps,
  GeoCoordinatesRequestProps, GeoCoordinatesResponseProps, GeometryContainmentRequestProps, GeometryContainmentResponseProps,
  GeometrySummaryRequestProps, HydrateViewStateRequestProps, HydrateViewStateResponseProps, ImageSourceFormat, IVault, IVaultConnectionProps,
  IVaultCoordinatesRequestProps, IVaultCoordinatesResponseProps, IVaultError, IVaultReadRpcInterface, IVaultRpcOpenProps, IVaultRpcProps,
  MassPropertiesPerCandidateRequestProps, MassPropertiesPerCandidateResponseProps, MassPropertiesRequestProps, MassPropertiesResponseProps,
  ModelExtentsProps, ModelProps, NoContentError, RpcInterface, RpcManager, RpcPendingResponse, SnapRequestProps, SnapResponseProps,
  SubCategoryResultRow, SyncMode, TextureData, TextureLoadProps, ViewStateLoadProps, ViewStateProps,
  ViewStoreRpc,
} from "@szewtwin/core-common";
import { Range3dProps } from "@szewtwin/core-geometry";
import { BackendLoggerCategory } from "../BackendLoggerCategory";
import { SpatialCategory } from "../Category";
import { ConcurrentQuery } from "../ConcurrentQuery";
import { CustomViewState3dCreator } from "../CustomViewState3dCreator";
import { generateGeometrySummaries } from "../GeometrySummary";
import { IVaultDb } from "../IVaultDb";
import { DictionaryModel } from "../Model";
import { PromiseMemoizer } from "../PromiseMemoizer";
import { RpcTrace } from "../rpc/tracing";
import { ViewStateHydrator } from "../ViewStateHydrator";
import { RpcBriefcaseUtility } from "./RpcBriefcaseUtility";
import { _nativeDb } from "../internal/Symbols";

interface ViewStateRequestProps {
  accessToken: AccessToken;
  tokenProps: IVaultRpcProps;
  options: CustomViewState3dCreatorOptions;
}

class ViewStateRequestMemoizer extends PromiseMemoizer<CustomViewState3dProps> {
  private readonly _timeoutMs: number;
  private static _instance?: ViewStateRequestMemoizer;

  public static async perform(props: ViewStateRequestProps): Promise<CustomViewState3dProps> {
    if (!this._instance)
      this._instance = new ViewStateRequestMemoizer();

    return this._instance.perform(props);
  }

  private constructor() {
    const memoize = async (props: ViewStateRequestProps) => {
      const db = await RpcBriefcaseUtility.findOpenIVault(props.accessToken, props.tokenProps);
      const viewCreator = new CustomViewState3dCreator(db);
      return viewCreator.getCustomViewState3dData(props.options);
    };

    const stringify = (props: ViewStateRequestProps) => {
      const token = props.tokenProps;
      const modelIds = props.options.modelIds;
      return `${token.key}-${token.szewTwinId}-${token.iVaultId}-${token.changeset?.id}:${modelIds}`;
    };

    super(memoize, stringify);
    this._timeoutMs = 20 * 1000;
  }

  private async perform(props: ViewStateRequestProps): Promise<CustomViewState3dProps> {
    const memo = this.memoize(props);

    // Rejections must be caught so that the memoization entry is deleted.
    await BeDuration.race(this._timeoutMs, memo.promise).catch(() => undefined);

    if (memo.isPending)
      throw new RpcPendingResponse(); // eslint-disable-line @typescript-eslint/only-throw-error

    this.deleteMemoized(props);

    if (memo.isFulfilled) {
      assert(undefined !== memo.result);
      return memo.result;
    }

    assert(memo.isRejected);
    throw memo.error;
  }
}

function currentActivity() {
  return RpcTrace.expectCurrentActivity;
}

async function getIVaultForRpc(tokenProps: IVaultRpcProps): Promise<IVaultDb> {
  return RpcBriefcaseUtility.findOpenIVault(RpcTrace.expectCurrentActivity.accessToken, tokenProps);
}

/** The backend implementation of IVaultReadRpcInterface.
 * @internal
 */
export class IVaultReadRpcImpl extends RpcInterface implements IVaultReadRpcInterface {

  public static register() { RpcManager.registerImpl(IVaultReadRpcInterface, IVaultReadRpcImpl); }

  public async getConnectionProps(tokenProps: IVaultRpcOpenProps): Promise<IVaultConnectionProps> {
    return RpcBriefcaseUtility.openWithTimeout(currentActivity(), tokenProps, SyncMode.FixedVersion);
  }

  public async getCustomViewState3dData(tokenProps: IVaultRpcProps, options: CustomViewState3dCreatorOptions): Promise<CustomViewState3dProps> {
    const accessToken = currentActivity().accessToken;
    return ViewStateRequestMemoizer.perform({ accessToken, tokenProps, options });
  }

  public async hydrateViewState(tokenProps: IVaultRpcProps, options: HydrateViewStateRequestProps): Promise<HydrateViewStateResponseProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const viewHydrater = new ViewStateHydrator(iVaultDb);
    return viewHydrater.getHydrateResponseProps(options);
  }

  public async queryAllUsedSpatialSubCategories(tokenProps: IVaultRpcProps): Promise<SubCategoryResultRow[]> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.queryAllUsedSpatialSubCategories();
  }

  public async querySubCategories(tokenProps: IVaultRpcProps, compressedCategoryIds: CompressedId64Set): Promise<SubCategoryResultRow[]> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const decompressedIds = CompressedId64Set.decompressArray(compressedCategoryIds);
    return iVaultDb.querySubCategories(decompressedIds);
  }

  public async queryRows(tokenProps: IVaultRpcProps, request: DbQueryRequest): Promise<DbQueryResponse> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    if (iVaultDb.isReadonly && request.usePrimaryConn === true) {
      Logger.logWarning(BackendLoggerCategory.IVaultDb, "usePrimaryConn is only supported on ivault that is opened in read/write mode. The option will be ignored.", request);
      request.usePrimaryConn = false;
    }
    return ConcurrentQuery.executeQueryRequest(iVaultDb[_nativeDb], request);
  }

  public async queryBlob(tokenProps: IVaultRpcProps, request: DbBlobRequest): Promise<DbBlobResponse> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    if (iVaultDb.isReadonly && request.usePrimaryConn === true) {
      Logger.logWarning(BackendLoggerCategory.IVaultDb, "usePrimaryConn is only supported on ivault that is opened in read/write mode. The option will be ignored.", request);
      request.usePrimaryConn = false;
    }
    return ConcurrentQuery.executeBlobRequest(iVaultDb[_nativeDb], request);
  }

  public async queryModelRanges(tokenProps: IVaultRpcProps, modelIds: Id64String[]): Promise<Range3dProps[]> {
    const results = await this.queryModelExtents(tokenProps, modelIds);
    if (results.length === 1 && results[0].status !== IVaultStatus.Success)
      throw new IVaultError(results[0].status, "error querying model range");

    return results.filter((x) => x.status === IVaultStatus.Success).map((x) => x.extents);
  }

  public async queryModelExtents(tokenProps: IVaultRpcProps, modelIds: Id64String[]): Promise<ModelExtentsProps[]> {
    const iVault = await getIVaultForRpc(tokenProps);
    return iVault.models.queryExtents(modelIds);
  }

  public async getModelProps(tokenProps: IVaultRpcProps, modelIdsList: Id64String[]): Promise<ModelProps[]> {
    const modelIds = new Set(modelIdsList);
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const modelJsonArray: ModelProps[] = [];
    for (const id of modelIds) {
      try {
        const modelProps = iVaultDb.models.getModelProps(id);
        modelJsonArray.push(modelProps);
      } catch (error) {
        if (modelIds.size === 1)
          throw error; // if they're asking for more than one model, don't throw on error.
      }
    }
    return modelJsonArray;
  }

  public async queryModelProps(tokenProps: IVaultRpcProps, params: EntityQueryParams): Promise<ModelProps[]> {
    const ids = await this.queryEntityIds(tokenProps, params);
    return this.getModelProps(tokenProps, [...ids]);
  }

  public async getElementProps(tokenProps: IVaultRpcProps, elementIdsList: Id64String[]): Promise<ElementProps[]> {
    const elementIds = new Set(elementIdsList);
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const elementProps: ElementProps[] = [];
    for (const id of elementIds) {
      try {
        elementProps.push(iVaultDb.elements.getElementProps({ id }));
      } catch (error) {
        if (elementIds.size === 1)
          throw error; // if they're asking for more than one element, don't throw on error.
      }
    }
    return elementProps;
  }

  public async loadElementProps(tokenProps: IVaultRpcProps, identifier: Id64String | GuidString | CodeProps, options?: ElementLoadOptions): Promise<ElementProps | undefined> {
    const props: ElementLoadProps = options ? { ...options } : {};
    if (typeof identifier === "string") {
      if (Id64.isId64(identifier))
        props.id = identifier;
      else
        props.federationGuid = identifier;
    } else {
      props.code = Code.fromJSON(identifier);
    }

    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.elements.tryGetElementProps(props);
  }

  public async getGeometrySummary(tokenProps: IVaultRpcProps, request: GeometrySummaryRequestProps): Promise<string> {
    const iVault = await getIVaultForRpc(tokenProps);
    return generateGeometrySummaries(request, iVault);
  }

  public async queryElementProps(tokenProps: IVaultRpcProps, params: EntityQueryParams): Promise<ElementProps[]> {
    const ids = await this.queryEntityIds(tokenProps, params);
    const res = this.getElementProps(tokenProps, [...ids]);
    return res;
  }

  public async queryEntityIds(tokenProps: IVaultRpcProps, params: EntityQueryParams): Promise<Id64String[]> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const res = iVaultDb.queryEntityIds(params);
    return [...res];
  }

  public async getClassHierarchy(tokenProps: IVaultRpcProps, classFullName: string): Promise<string[]> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const classArray: string[] = [];
    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const classMetaData: EntityMetaData = iVaultDb.getMetaData(classFullName);
      classArray.push(classFullName);
      if (!classMetaData.baseClasses || classMetaData.baseClasses.length === 0)
        break;

      classFullName = classMetaData.baseClasses[0];
    }
    return classArray;
  }

  public async getAllCodeSpecs(tokenProps: IVaultRpcProps): Promise<any[]> {
    const codeSpecs: any[] = [];
    const iVaultDb = await getIVaultForRpc(tokenProps);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVaultDb.withPreparedStatement("SELECT DMInstanceId AS id, name, jsonProperties FROM BisCore.CodeSpec", (statement) => {
      for (const row of statement)
        codeSpecs.push({ id: row.id, name: row.name, jsonProperties: JSON.parse(row.jsonProperties) });
    });
    return codeSpecs;
  }

  public async getViewStateData(tokenProps: IVaultRpcProps, viewDefinitionId: string, options?: ViewStateLoadProps): Promise<ViewStateProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.views.getViewStateProps(viewDefinitionId, options);
  }

  public async readFontJson(tokenProps: IVaultRpcProps): Promise<FontMapProps> { // eslint-disable-line @typescript-eslint/no-deprecated
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb[_nativeDb].readFontMap();
  }

  public async requestSnap(tokenProps: IVaultRpcProps, sessionId: string, props: SnapRequestProps): Promise<SnapResponseProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.requestSnap(sessionId, props);
  }

  public async cancelSnap(tokenProps: IVaultRpcProps, sessionId: string): Promise<void> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.cancelSnap(sessionId);
  }

  public async getGeometryContainment(tokenProps: IVaultRpcProps, props: GeometryContainmentRequestProps): Promise<GeometryContainmentResponseProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.getGeometryContainment(props);
  }

  public async getMassProperties(tokenProps: IVaultRpcProps, props: MassPropertiesRequestProps): Promise<MassPropertiesResponseProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.getMassProperties(props);
  }

  public async getMassPropertiesPerCandidate(tokenProps: IVaultRpcProps, props: MassPropertiesPerCandidateRequestProps): Promise<MassPropertiesPerCandidateResponseProps[]> { // eslint-disable-line @typescript-eslint/no-deprecated
    const iVaultDb = await getIVaultForRpc(tokenProps);

    const getSingleCandidateMassProperties = async (candidate: string) => {
      try {
        const massPropResults: MassPropertiesResponseProps[] = [];

        for (const op of props.operations) {
          const massProperties = await iVaultDb.getMassProperties({ operation: op, candidates: [candidate] });
          massPropResults.push(massProperties);
        }

        let singleCandidateResult: MassPropertiesPerCandidateResponseProps = { status: SzewecStatus.ERROR, candidate }; // eslint-disable-line @typescript-eslint/no-deprecated

        if (massPropResults.some((r) => r.status !== SzewecStatus.ERROR)) {
          singleCandidateResult.status = SzewecStatus.SUCCESS;
          for (const r of massPropResults.filter((mpr) => mpr.status !== SzewecStatus.ERROR)) {
            singleCandidateResult = { ...singleCandidateResult, ...r };
          }
        }

        return singleCandidateResult;
      } catch {
        return { status: SzewecStatus.ERROR, candidate };
      }
    };

    const promises: Promise<MassPropertiesPerCandidateResponseProps>[] = []; // eslint-disable-line @typescript-eslint/no-deprecated

    for (const candidate of CompressedId64Set.iterable(props.candidates)) {
      promises.push(getSingleCandidateMassProperties(candidate));
    }

    return Promise.all(promises);
  }

  public async getToolTipMessage(tokenProps: IVaultRpcProps, id: string): Promise<string[]> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const el = iVaultDb.elements.getElement(id);
    return (el === undefined) ? [] : el.getToolTipMessage();
  }

  /** Send a view thumbnail to the frontend. This is a binary transfer with the metadata in a 16-byte prefix header.
   * @deprecated in 3.6.0 - might be removed in next major version. Use queryViewThumbnail instead
   */
  public async getViewThumbnail(tokenProps: IVaultRpcProps, viewId: string): Promise<Uint8Array> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const thumbnail = iVaultDb.views.getThumbnail(viewId);
    if (undefined === thumbnail || 0 === thumbnail.image.length)
      throw new NoContentError();

    const val = new Uint8Array(thumbnail.image.length + 16); // allocate a new buffer 16 bytes larger than the image size
    new Uint32Array(val.buffer, 0, 4).set([thumbnail.image.length, thumbnail.format === "jpeg" ? ImageSourceFormat.Jpeg : ImageSourceFormat.Png, thumbnail.width, thumbnail.height]);    // Put the metadata in the first 16 bytes.
    val.set(thumbnail.image, 16); // put the image data at offset 16 after metadata
    return val;
  }

  public async getDefaultViewId(tokenProps: IVaultRpcProps): Promise<Id64String> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const spec = { namespace: "bld_View", name: "DefaultView" };
    const blob = iVaultDb.queryFilePropertyBlob(spec);
    if (undefined === blob || 8 !== blob.length)
      return Id64.invalid;

    const view = new Uint32Array(blob.buffer);
    return Id64.fromUint32Pair(view[0], view[1]);
  }
  public async getSpatialCategoryId(tokenProps: IVaultRpcProps, categoryName: string): Promise<Id64String | undefined> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    const dictionary: DictionaryModel = iVaultDb.models.getModel<DictionaryModel>(IVault.dictionaryId);
    return SpatialCategory.queryCategoryIdByName(iVaultDb, dictionary.id, categoryName);
  }

  public async getIVaultCoordinatesFromGeoCoordinates(tokenProps: IVaultRpcProps, props: IVaultCoordinatesRequestProps): Promise<IVaultCoordinatesResponseProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.getIVaultCoordinatesFromGeoCoordinates(props);
  }

  public async getGeoCoordinatesFromIVaultCoordinates(tokenProps: IVaultRpcProps, props: GeoCoordinatesRequestProps): Promise<GeoCoordinatesResponseProps> {
    const iVaultDb = await getIVaultForRpc(tokenProps);
    return iVaultDb.getGeoCoordinatesFromIVaultCoordinates(props);
  }

  public async queryTextureData(tokenProps: IVaultRpcProps, textureLoadProps: TextureLoadProps): Promise<TextureData | undefined> {
    const db = await getIVaultForRpc(tokenProps);
    return db.queryTextureData(textureLoadProps);
  }

  public async generateElementMeshes(tokenProps: IVaultRpcProps, props: ElementMeshRequestProps): Promise<Uint8Array> {
    const db = await getIVaultForRpc(tokenProps);
    return db[_nativeDb].generateElementMeshes(props);
  }

  /** @internal */
  public async callViewStore(tokenProps: IVaultRpcProps, version: string, forWrite: boolean, methodName: string, ...args: any[]): Promise<any> {
    if (!RpcInterface.isVersionCompatible(ViewStoreRpc.version, version))
      throw new Error("ViewStoreRpc version mismatch");

    const db = await getIVaultForRpc(tokenProps);
    const viewStore = await db.views.accessViewStore({ accessLevel: forWrite ? "write" : "read" });
    const access = viewStore[forWrite ? "writeLocker" : "reader"] as any;

    const func = access[methodName];
    if (typeof func !== "function")
      throw new IVaultError(IVaultStatus.FunctionNotFound, `Illegal ViewStore RPC call "${methodName}"`);

    return func.call(access, ...args);
  }
}
