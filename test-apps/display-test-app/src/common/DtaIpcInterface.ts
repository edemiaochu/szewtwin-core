/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Id64String } from "@szewtwin/core-szewec";
import { DisplayStyle3dProps, Placement2dProps, SpatialViewDefinitionProps, TextAnnotationProps, TextStyleSettingsProps } from "@szewtwin/core-common";
import { TransformProps } from "@szewtwin/core-geometry";

export const dtaChannel = "display-test-app/dta";

/** Arguments for DtaIpcInterface.createSectionDrawing. */
export interface CreateSectionDrawingViewArgs {
  /** Identifies the writable briefcase in which to create the section drawing. */
  iVaultKey: string;
  /** Name used to produce the names of the section drawing element, drawing model, spatial view, model+category selectors, and display style. */
  baseName: string;
  /** Describes the spatial view to be referenced by the drawing. */
  spatialView: SpatialViewDefinitionProps;
  /** The set of models enabled in the spatial view's model selector. */
  models: Id64String[];
  /** The set of categories enabled in the spatial view's category selector. */
  categories: Id64String[];
  /** The display style applied to the spatial view. */
  displayStyle: DisplayStyle3dProps;
  /** A transform from drawing model coordinates to spatial coordinates. */
  drawingToSpatialTransform: TransformProps;
}

export interface CreateSectionDrawingViewResult {
  sectionDrawingId: Id64String;
  spatialViewId: Id64String;
}

/** Arguments for DtaIpcInterface.createNewIVault. */
export interface CreateNewIVaultArgs {
  /** The absolute path of the new .dtw file. A ".dtw" extension is appended if the path has no ".dtw" extension. */
  filePath: string;
  /** Name for the root Subject of the new iVault. Defaults to the file name (without extension). */
  name?: string;
}

/** Result of DtaIpcInterface.createNewIVault. */
export interface CreateNewIVaultResult {
  /** The absolute path of the created file. */
  filePath: string;
  /** The Id of the default PhysicalModel initialized in the new iVault. */
  defaultModelId: Id64String;
  /** The Id of the default SpatialCategory initialized in the new iVault. */
  defaultCategoryId: Id64String;
}

export interface DtaIpcInterface {
  sayHello: () => Promise<string>;

  /** Creates a new empty standalone iVault (.dtw) file on disk, then closes it so the frontend can open it.
   * Returns the created file path along with the Ids of the default model and category initialized in the new file.
   */
  createNewIVault(args: CreateNewIVaultArgs): Promise<CreateNewIVaultResult>;

  /** Creates and inserts a copy of the specified spatial view, along with model+category selectors; and a section drawing model and view thereof.
   * Returns the Id of the section drawing view.
   */
  createSectionDrawing(args: CreateSectionDrawingViewArgs): Promise<CreateSectionDrawingViewResult>;

  /**
   * Inserts an annotation text style into the specified iVault.
   * Returns the ID of the inserted text style element.
   */
  insertTextStyle(iVaultKey: string, name: string, settingProps: TextStyleSettingsProps): Promise<Id64String>;

  /**
   * Looks up the specified text style by name in the specified iVault and updates its settings.
   */
  updateTextStyle(iVaultKey: string, name: string, newSettingProps: TextStyleSettingsProps): Promise<void>;

  /**
   * Looks up the specified text style by name in the specified iVault and deletes it.
   */
  deleteTextStyle(iVaultKey: string, name: string): Promise<void>;

  /**
   * Inserts a text annotation into the specified iVault.
   */
  insertText(iVaultKey: string, categoryId: Id64String, modelId: Id64String, placement: Placement2dProps, defaultTextStyleId: Id64String, textAnnotationProps?: TextAnnotationProps): Promise<Id64String>;

  /**
   * Updates an existing text annotation in the specified iVault.
   */
  updateText(iVaultKey: string, elementId: Id64String, categoryId?: Id64String, placement?: Placement2dProps, defaultTextStyleId?: Id64String, textAnnotationProps?: TextAnnotationProps): Promise<void>;

  /**
   * Deletes an existing text annotation in the specified iVault.
   */
  deleteText(iVaultKey: string, elementId: Id64String): Promise<void>;

  /**
   * If the model is a DrawingModel, sets the scale factor on the Drawing element.
   */
  setScaleFactor(iVaultKey: string, modelId: Id64String, scaleFactor: number): Promise<void>;
}
