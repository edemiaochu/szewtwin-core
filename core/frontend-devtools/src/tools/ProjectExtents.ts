/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { AxisAlignedBox3d, ColorDef, LinePixels } from "@szewtwin/core-common";
import { DecorateContext, GraphicType, IVaultApp, IVaultConnection, Tool } from "@szewtwin/core-frontend";
import { parseToggle } from "./parseToggle";

/** @beta */
export class ProjectExtentsDecoration {
  private static _decorator?: ProjectExtentsDecoration;
  protected _removeDecorationListener?: () => void;
  protected _extents: AxisAlignedBox3d;

  public constructor(iVault: IVaultConnection) {
    this._extents = iVault.projectExtents;
    this.updateDecorationListener(true);
  }

  protected stop(): void { this.updateDecorationListener(false); }

  protected updateDecorationListener(add: boolean): void {
    if (this._removeDecorationListener) {
      if (!add) {
        this._removeDecorationListener();
        this._removeDecorationListener = undefined;
      }
    } else if (add) {
      if (!this._removeDecorationListener)
        this._removeDecorationListener = IVaultApp.viewManager.addDecorator(this);
    }
  }

  public static get isActive(): boolean {
    return undefined !== ProjectExtentsDecoration._decorator;
  }

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay);
    const colorAccVis = ColorDef.white.adjustedForContrast(context.viewport.view.backgroundColor);
    const colorAccHid = colorAccVis.withAlpha(100);

    builderAccVis.setSymbology(colorAccVis, ColorDef.black, 3);
    builderAccHid.setSymbology(colorAccHid, ColorDef.black, 1, LinePixels.Code2);

    builderAccVis.addRangeBox(this._extents);
    builderAccHid.addRangeBox(this._extents);

    context.addDecorationFromBuilder(builderAccVis);
    context.addDecorationFromBuilder(builderAccHid);
  }

  // Returns true if extents become enabled.
  public static toggle(ivault: IVaultConnection, enabled?: boolean): boolean {
    if (undefined !== enabled) {
      const alreadyEnabled = undefined !== ProjectExtentsDecoration._decorator;
      if (enabled === alreadyEnabled)
        return alreadyEnabled;
    }

    if (undefined === ProjectExtentsDecoration._decorator) {
      ProjectExtentsDecoration._decorator = new ProjectExtentsDecoration(ivault);
      return true;
    } else {
      ProjectExtentsDecoration._decorator.stop();
      ProjectExtentsDecoration._decorator = undefined;
      return false;
    }
  }
}

/** Enable or disable the project extents decoration. This decoration draws a box coinciding with the iVault's project extents.
 * @param ivault The iVault from which to obtain the extents.
 * @param enable If undefined, the current enabled state of the decoration will be inverted; otherwise it will be enabled if true, or disabled if false.
 * @returns true if the extents are now ON, false if they are now OFF.
 * @beta
 */
export function toggleProjectExtents(ivault: IVaultConnection, enabled?: boolean): boolean {
  return ProjectExtentsDecoration.toggle(ivault, enabled);
}

/** Enable or disable project extents decoration.
 * The key-in takes at most 1 argument (case-insensitive):
 *  - "ON" => enable project extents
 *  - "OFF" => disable project extents
 *  - "TOGGLE" or omitted => toggle project extents
 * @see [toggleProjectExtents]
 * @beta
 */
export class ToggleProjectExtentsTool extends Tool {
  public static override toolId = "ToggleProjectExtents";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override async run(enable?: boolean): Promise<boolean> {
    const vp = IVaultApp.viewManager.selectedView;
    if (undefined !== vp && vp.view.isSpatialView()) {
      const iVault = vp.iVault;
      if (toggleProjectExtents(iVault, enable))
        vp.onChangeView.addOnce(() => toggleProjectExtents(iVault, false));
    }

    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      await this.run(enable);

    return true;
  }
}
