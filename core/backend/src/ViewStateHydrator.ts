/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SzewecError, CompressedId64Set, Id64String, Logger } from "@szewtwin/core-szewec";
import { HydrateViewStateRequestProps, HydrateViewStateResponseProps, ModelProps, ViewAttachmentProps, ViewStateLoadProps } from "@szewtwin/core-common";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { IVaultDb } from "./IVaultDb";

/** @internal */
export class ViewStateHydrator {
  private _ivault: IVaultDb;
  public constructor(iVault: IVaultDb) {
    this._ivault = iVault;
  }

  public async getHydrateResponseProps(options: HydrateViewStateRequestProps): Promise<HydrateViewStateResponseProps> {
    const response: HydrateViewStateResponseProps = {};
    const promises = [];
    if (options.acsId)
      promises.push(this.handleAcsId(response, options.acsId));
    if (options.sheetViewAttachmentIds)
      promises.push(this.handleSheetViewAttachmentIds(response, options.sheetViewAttachmentIds, options.viewStateLoadProps));
    if (options.spatialViewId)
      promises.push(this.handleSpatialViewId(response, options.spatialViewId, options.viewStateLoadProps));
    if (options.notLoadedModelSelectorStateModels)
      promises.push(this.handleModelSelectorStateModels(response, options.notLoadedModelSelectorStateModels));
    if (options.baseModelId)
      promises.push(this.handleBaseModelId(response, options.baseModelId));
    await Promise.all(promises);
    return response;
  }

  private async handleBaseModelId(response: HydrateViewStateResponseProps, baseModelId: Id64String) {
    let modelProps;
    try {
      modelProps = this._ivault.models.getModelProps(baseModelId);
    } catch (err) {
      Logger.logError(BackendLoggerCategory.ViewStateHydrator, `Error getting modelProps for baseModelId: ${baseModelId}`, () => ({ error: SzewecError.getErrorProps(err) }));
    }
    response.baseModelProps = modelProps;
  }

  private async handleModelSelectorStateModels(response: HydrateViewStateResponseProps, models: CompressedId64Set) {
    const decompressedModelIds = CompressedId64Set.decompressSet(models);

    const modelJsonArray: ModelProps[] = [];
    for (const id of decompressedModelIds) {
      try {
        const modelProps = this._ivault.models.getModelProps(id);
        modelJsonArray.push(modelProps);
      } catch { }
    }

    response.modelSelectorStateModels = modelJsonArray;
  }

  private async handleSpatialViewId(response: HydrateViewStateResponseProps, spatialViewId: Id64String, viewStateLoadProps?: ViewStateLoadProps) {
    response.spatialViewProps = await this._ivault.views.getViewStateProps(spatialViewId, viewStateLoadProps);
  }

  private async handleAcsId(response: HydrateViewStateResponseProps, acsId: string) {
    try {
      const props = this._ivault.elements.getElementProps(acsId);
      response.acsElementProps = props;
    } catch { }
  }

  private async handleSheetViewAttachmentIds(response: HydrateViewStateResponseProps, sheetViewAttachmentIds: CompressedId64Set, viewStateLoadProps?: ViewStateLoadProps) {
    const decompressedIds = CompressedId64Set.decompressSet(sheetViewAttachmentIds);
    const attachmentProps: ViewAttachmentProps[] = [];
    for (const id of decompressedIds) {
      try {
        attachmentProps.push(this._ivault.elements.getElementProps({ id }));
      } catch { }
    }

    const promises = [];
    for (const attachment of attachmentProps) {
      const loadView = async () => {
        try {
          const view = await this._ivault.views.getViewStateProps(attachment.view.id, viewStateLoadProps);
          return view;
        } catch {
          return undefined;
        }
      };

      promises.push(loadView());
    }
    const views = await Promise.all(promises);
    response.sheetViewViews = views;
    response.sheetViewAttachmentProps = attachmentProps;

    return;
  }

}
