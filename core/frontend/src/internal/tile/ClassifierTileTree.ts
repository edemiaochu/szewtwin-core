/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */
import { compareNumbers, comparePossiblyUndefined, compareStrings, compareStringsOrUndefined, Id64, Id64String } from "@szewtwin/core-szewec";
import {
  BatchType, ClassifierTileTreeId, iVaultTileTreeIdToString, RenderMode, RenderSchedule, SpatialClassifier, ViewFlagsProperties,
} from "@szewtwin/core-common";
import { DisplayStyleState } from "../../DisplayStyleState";
import { IVaultApp } from "../../IVaultApp";
import { IVaultConnection } from "../../IVaultConnection";
import { GeometricModelState } from "../../ModelState";
import { SceneContext } from "../../ViewContext";
import { ViewState } from "../../ViewState";
import { ActiveSpatialClassifier, SpatialClassifiersState } from "../../SpatialClassifiersState";
import {
  DisclosedTileTreeSet, IVaultTileTree, iVaultTileTreeParamsFromJSON, TileTree, TileTreeLoadStatus, TileTreeOwner, TileTreeReference, TileTreeSupplier,
} from "../../tile/internal";
import { _scheduleScriptReference } from "../../common/internal/Symbols";

interface ClassifierTreeId extends ClassifierTileTreeId {
  modelId: Id64String;
  timeline?: RenderSchedule.ModelTimeline;
}

function compareIds(lhs: ClassifierTreeId, rhs: ClassifierTreeId): number {
  return compareNumbers(lhs.type, rhs.type) || compareNumbers(lhs.expansion, rhs.expansion)
    || compareStrings(lhs.modelId, rhs.modelId) || compareStringsOrUndefined(lhs.animationId, rhs.animationId)
    || comparePossiblyUndefined((x, y) => x.compareTo(y), lhs.timeline, rhs.timeline);
}

class ClassifierTreeSupplier implements TileTreeSupplier {
  private readonly _nonexistentTreeOwner = {
    tileTree: undefined,
    loadStatus: TileTreeLoadStatus.NotFound,
    load: () => undefined,
    [Symbol.dispose]: () => undefined,
    loadTree: async () => undefined,
    iVault: undefined as unknown as IVaultConnection,
  };

  public compareTileTreeIds(lhs: ClassifierTreeId, rhs: ClassifierTreeId): number {
    return compareIds(lhs, rhs);
  }

  public async createTileTree(id: ClassifierTreeId, iVault: IVaultConnection): Promise<TileTree | undefined> {
    await iVault.models.load(id.modelId);
    const model = iVault.models.getLoaded(id.modelId);
    if (undefined === model || !(model instanceof GeometricModelState))
      return undefined;

    const idStr = iVaultTileTreeIdToString(id.modelId, id, IVaultApp.tileAdmin);
    const props = await IVaultApp.tileAdmin.requestTileTreeProps(iVault, idStr);

    const params = iVaultTileTreeParamsFromJSON(props, iVault, id.modelId, {
      edges: false,
      allowInstancing: false,
      is3d: true,
      batchType: id.type,
      timeline: id.timeline,
    });

    return new IVaultTileTree(params, id);
  }

  public getOwner(id: ClassifierTreeId, iVault: IVaultConnection): TileTreeOwner {
    return Id64.isValid(id.modelId) ? iVault.tiles.getTileTreeOwner(id, this) : this._nonexistentTreeOwner;
  }

  public addModelsAnimatedByScript(modelIds: Set<Id64String>, scriptSourceId: Id64String, trees: Iterable<{ id: ClassifierTreeId, owner: TileTreeOwner }>): void {
    // Note: This is invoked when an element hosting a schedule script is updated - it doesn't care about frontend schedule scripts.
    for (const tree of trees)
      if (scriptSourceId === tree.id.animationId)
        modelIds.add(tree.id.modelId);
  }

  public addSpatialModels(modelIds: Set<Id64String>, trees: Iterable<{ id: ClassifierTreeId, owner: TileTreeOwner }>): void {
    for (const tree of trees)
      modelIds.add(tree.id.modelId);
  }
}

const classifierTreeSupplier = new ClassifierTreeSupplier();

export abstract class SpatialClassifierTileTreeReference extends TileTreeReference {
  public abstract get isPlanar(): boolean;
  public abstract get activeClassifier(): ActiveSpatialClassifier | undefined;
  public abstract get viewFlags(): Partial<ViewFlagsProperties>;
  public get transparency(): number | undefined { return undefined; }
}

class ClassifierTreeReference extends SpatialClassifierTileTreeReference {
  private _id: ClassifierTreeId;
  private readonly _classifiers: SpatialClassifiersState;
  private readonly _source: ViewState | DisplayStyleState;
  private readonly _iVault: IVaultConnection;
  private readonly _classifiedTree: TileTreeReference;
  private _owner: TileTreeOwner;

  public constructor(classifiers: SpatialClassifiersState, classifiedTree: TileTreeReference, iVault: IVaultConnection, source: ViewState | DisplayStyleState) {
    super();
    this._id = createClassifierId(classifiers.active, source);
    this._source = source;
    this._iVault = iVault;
    this._classifiers = classifiers;
    this._classifiedTree = classifiedTree;
    this._owner = classifierTreeSupplier.getOwner(this._id, iVault);
  }

  public get classifiers(): SpatialClassifiersState { return this._classifiers; }
  public get activeClassifier(): ActiveSpatialClassifier | undefined { return this.classifiers.activeClassifier; }

  public override get castsShadows() {
    return false;
  }

  public get treeOwner(): TileTreeOwner {
    const newId = createClassifierId(this._classifiers.active, this._source);
    if (0 !== compareIds(this._id, newId)) {
      this._id = newId;
      this._owner = classifierTreeSupplier.getOwner(this._id, this._iVault);
    }

    return this.activeClassifier?.tileTreeReference?.treeOwner ?? this._owner;
  }

  public override discloseTileTrees(trees: DisclosedTileTreeSet): void {
    // NB: We do NOT call super because we don't use our tree if no classifier is active.
    trees.disclose(this._classifiedTree);

    const classifier = this.activeClassifier;
    const classifierTree = undefined !== classifier ? this.treeOwner.tileTree : undefined;
    if (undefined !== classifierTree)
      trees.add(classifierTree);
  }

  public get isPlanar() {
    if (this.activeClassifier?.flags.isVolumeClassifier) {
      return false;
    }

    return true;
  }

  public get viewFlags(): Partial<ViewFlagsProperties> {
    return {
      renderMode: RenderMode.SmoothShade,
      transparency: true,      // Igored for point clouds as they don't support transparency.
      textures: false,
      lighting: false,
      shadows: false,
      monochrome: false,
      materials: false,
      ambientOcclusion: false,
      visibleEdges: false,
      hiddenEdges: false,
    };
  }

  // Add volume classifiers to scene (planar classifiers are added seperately.)
  public override addToScene(context: SceneContext): void {
    if (this.isPlanar)
      return;

    const classifiedTree = this._classifiedTree.treeOwner.load();
    if (undefined === classifiedTree)
      return;

    const classifier = this._classifiers.activeClassifier;
    if (undefined === classifier)
      return;

    const classifierTree = this.treeOwner.load();
    if (undefined === classifierTree)
      return;

    context.setVolumeClassifier(classifier, classifiedTree.modelId);
    super.addToScene(context);
  }

}

export function createClassifierTileTreeReference(classifiers: SpatialClassifiersState, classifiedTree: TileTreeReference, iVault: IVaultConnection, source: ViewState | DisplayStyleState): SpatialClassifierTileTreeReference {
  return new ClassifierTreeReference(classifiers, classifiedTree, iVault, source);
}

function createClassifierId(classifier: SpatialClassifier | undefined, source: ViewState | DisplayStyleState | undefined): ClassifierTreeId {
  const disablePolyfaceDecimation = IVaultApp.tileAdmin.disablePolyfaceDecimation;
  if (undefined === classifier)
    return { modelId: Id64.invalid, type: BatchType.PlanarClassifier, expansion: 0, animationId: undefined, disablePolyfaceDecimation };

  const type = classifier.flags.isVolumeClassifier ? BatchType.VolumeClassifier : BatchType.PlanarClassifier;
  const scriptInfo = IVaultApp.tileAdmin.getScriptInfoForTreeId(classifier.modelId, source ? source[_scheduleScriptReference] : undefined);
  return {
    modelId: classifier.modelId,
    type,
    expansion: classifier.expand,
    animationId: scriptInfo?.animationId,
    timeline: scriptInfo?.timeline,
    disablePolyfaceDecimation,
  };
}
