/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { assert, Id64String } from "@szewtwin/core-szewec";
import { ContextRealityModel, ContextRealityModelProps, FeatureAppearance, RealityDataFormat, RealityDataSourceKey } from "@szewtwin/core-common";
import { DisplayStyleState } from "./DisplayStyleState";
import { IVaultConnection } from "./IVaultConnection";
import { PlanarClipMaskState } from "./PlanarClipMaskState";
import { RealityDataSource } from "./RealityDataSource";
import { SpatialClassifiersState } from "./SpatialClassifiersState";
import { createOrbitGtTileTreeReference, createRealityTileTreeReference, RealityModelTileTree, TileTreeReference } from "./tile/internal";

/** A [ContextRealityModel]($common) attached to a [[DisplayStyleState]] supplying a [[TileTreeReference]] used to draw the
 * reality model in a [[Viewport]].
 * @see [DisplayStyleSettings.contextRealityModels]($common).
 * @see [[DisplayStyleState.contextRealityModelStates]].
 * @see [[DisplayStyleState.attachRealityModel]].
 * @public
 * @extensions
 */
export class ContextRealityModelState extends ContextRealityModel {
  private readonly _treeRef: RealityModelTileTree.Reference;
  /** The iVault with which the reality model is associated. */
  public readonly iVault: IVaultConnection;
  /** The reality data source key with which the reality model is associated. */
  public override readonly rdSourceKey: RealityDataSourceKey;

  /** @internal */
  public constructor(props: ContextRealityModelProps, iVault: IVaultConnection, displayStyle: DisplayStyleState) {
    super(props, { createClassifiers: (container) => SpatialClassifiersState.create(container) });
    this.iVault = iVault;
    this._appearanceOverrides = props.appearanceOverrides ? FeatureAppearance.fromJSON(props.appearanceOverrides) : undefined;
    if (undefined === props.orbitGtBlob) {
      this.rdSourceKey = props.rdSourceKey ? props.rdSourceKey : RealityDataSource.createKeyFromUrl(props.tilesetUrl);
    } else {
      this.rdSourceKey = props.rdSourceKey ? props.rdSourceKey : RealityDataSource.createKeyFromOrbitGtBlobProps(props.orbitGtBlob);
    }
    const useOrbitGtTileTreeReference = this.rdSourceKey.format === RealityDataFormat.OPC;
    this._treeRef = (!useOrbitGtTileTreeReference) ?
      createRealityTileTreeReference({
        iVault,
        source: displayStyle,
        rdSourceKey: this.rdSourceKey,
        url: props.tilesetUrl,
        name: props.name,
        classifiers: this.classifiers,
        planarClipMask: this.planarClipMaskSettings,
        getDisplaySettings: () => this.displaySettings,
        getBackgroundBase: () => displayStyle.settings.mapImagery.backgroundBase,
        getBackgroundLayers: () => displayStyle.settings.mapImagery.backgroundLayers,
      }) :
      createOrbitGtTileTreeReference({
        iVault,
        orbitGtBlob: props.orbitGtBlob,
        rdSourceKey: this.rdSourceKey,
        name: props.name,
        classifiers: this.classifiers,
        source: displayStyle,
        getDisplaySettings: () => this.displaySettings,
      });

    this.onPlanarClipMaskChanged.addListener((newSettings) => {
      this._treeRef.planarClipMask = newSettings ? PlanarClipMaskState.create(newSettings) : undefined;
    });
  }

  /** The tile tree reference responsible for drawing the reality model into a [[Viewport]]. */
  public get treeRef(): TileTreeReference { return this._treeRef; }

  /** @internal */
  public detachLayerListeners(): void {
    this._treeRef.detachLayerListeners();
  }

  /** The set of available [[ActiveSpatialClassifier]]s that can be used to classify the reality model. */
  public override get classifiers(): SpatialClassifiersState {
    assert(super.classifiers instanceof SpatialClassifiersState);
    return super.classifiers;
  }

  /** The transient Id assigned to this reality model at run-time. */
  public get modelId(): Id64String | undefined {
    return (this._treeRef instanceof RealityModelTileTree.Reference) ? this._treeRef.modelId : undefined;
  }

  /** Whether the reality model spans the entire globe ellipsoid. */
  public get isGlobal(): boolean {
    return this.treeRef.isGlobal;
  }
}
