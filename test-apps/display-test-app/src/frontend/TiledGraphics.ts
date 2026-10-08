/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  BriefcaseConnection,
  FeatureSymbology, HitDetail, IVaultApp, IVaultConnection, TiledGraphicsProvider, TileTree, TileTreeReference, Tool, ViewCreator3d, Viewport, ViewState,
} from "@szewtwin/core-frontend";
import { DisplayTestApp } from "./App";
import { Transform } from "@szewtwin/core-geometry";

class Reference extends TileTreeReference {
  private readonly _ref: TileTreeReference;
  private readonly _provider: Provider;
  private _transform?: Transform;

  public constructor(ref: TileTreeReference, provider: Provider) {
    super();
    this._ref = ref;
    this._provider = provider;
  }

  public override get castsShadows() { return this._ref.castsShadows; }
  public override get treeOwner() { return this._ref.treeOwner; }
  public override async getToolTip(hit: HitDetail) { return this._ref.getToolTip(hit); }
  public override canSupplyToolTip(hit: HitDetail) { return this._ref.canSupplyToolTip(hit); }
  public override async getToolTipPromise(hit: HitDetail) { return this._ref.getToolTipPromise(hit); }

  protected override getSymbologyOverrides() { return this._provider.ovrs; }

  protected override computeTransform(tree: TileTree): Transform {
    return this._transform ?? (this._transform = this._provider.computeTransform(tree));
  }

  public override getTransformFromIVault() {
    return this._provider.toViewport;
  }
}

class Provider implements TiledGraphicsProvider {
  public readonly view: ViewState;
  public readonly ovrs: FeatureSymbology.Overrides;
  public readonly viewport: Viewport;
  public readonly toViewport: Transform;
  private readonly _refs: Reference[];

  public get iVault() { return this.view.iVault; }

  private constructor(view: ViewState, vp: Viewport, transform: Transform) {
    this.view = view;
    this.viewport = vp;
    this.toViewport = transform;

    // These overrides ensure that all of the categories and subcategories in the secondary iVault are displayed.
    // Any symbology overrides applied to the viewport are ignored.
    this.ovrs = new FeatureSymbology.Overrides(view);

    this._refs = Array.from(view.getModelTreeRefs()).map((ref) => new Reference(ref, this));
  }

  public forEachTileTreeRef(_vp: Viewport, func: (ref: TileTreeReference) => void): void {
    for (const ref of this._refs) {
      func(ref);
    }
  }

  public static async create(attachedIVault: IVaultConnection, vp: Viewport): Promise<Provider> {
    const creator = new ViewCreator3d(attachedIVault);
    const view = await creator.createDefaultView();

    const transform = computeTransformFromSecondaryIVault({ primary: vp.iVault, secondary: attachedIVault });
    return new Provider(view, vp, transform);
  }

  public computeTransform(tree: TileTree): Transform {
    return computeTransformFromSecondaryIVault({ primary: this.viewport.iVault, secondary: tree.iVault, tileTreeToWorld: tree.iVaultTransform });
  }
}

function computeTransformFromSecondaryIVault(args: { primary: IVaultConnection, secondary: IVaultConnection, tileTreeToWorld?: Transform }): Transform {
  const { primary, secondary } = args;
  const tileTreeToWorld = args.tileTreeToWorld ?? Transform.createIdentity();

  if (!secondary.ecefLocation?.isValid || !primary.ecefLocation?.isValid) {
    return tileTreeToWorld;
  }

  const dbToEcef = secondary.ecefLocation.getTransform();
  const ecefTransform = dbToEcef.multiplyTransformTransform(tileTreeToWorld);
  const worldTf = primary.getEcefTransform().inverse();
  return worldTf ? worldTf.multiplyTransformTransform(ecefTransform, ecefTransform) : tileTreeToWorld;
}

const providersByViewport = new Map<Viewport, Provider>();

/** A simple proof-of-concept for drawing tiles from a different IVaultConnection into a Viewport. */
export async function toggleExternalTiledGraphicsProvider(vp: Viewport): Promise<void> {
  const existing = providersByViewport.get(vp);
  if (undefined !== existing) {
    vp.dropTiledGraphicsProvider(existing);
    providersByViewport.delete(vp);
    await existing.iVault.close();
    return;
  }

  const fileName = await DisplayTestApp.surface.selectFileName();
  if (undefined === fileName)
    return;

  let iVault;
  try {
    iVault = await BriefcaseConnection.openFile( { fileName, key: fileName });
    const provider = await Provider.create(iVault, vp);
    providersByViewport.set(vp, provider);
    vp.addTiledGraphicsProvider(provider);
  } catch (err: any) {
    alert(err.toString());
    return;
  }
}

export class ToggleSecondaryIVaultTool extends Tool {
  public static override toolId = "ToggleSecondaryIVault";

  public override async run(): Promise<boolean> {
    const vp = IVaultApp.viewManager.selectedView;
    if (!vp) {
      return false;
    }

    await toggleExternalTiledGraphicsProvider(vp);
    return true;
  }
}
