/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "@szewtwin/core-szewec";
import { IVaultJson, Path } from "@szewtwin/core-geometry";
import { ColorDef, ViewDetails } from "@szewtwin/core-common";
import { DecorateContext, GraphicType, IVaultApp, IVaultConnection, Tool } from "@szewtwin/core-frontend";
import { parseArgs } from "@szewtwin/frontend-devtools";

class AspectRatioSkewDecorator {
  private static _instance?: AspectRatioSkewDecorator;
  private readonly _path: Path;
  private readonly _applyAspectRatioSkew: boolean;

  private constructor(iVault: IVaultConnection, applyAspectRatioSkew: boolean) {
    this._applyAspectRatioSkew = applyAspectRatioSkew;

    const l = iVault.projectExtents.low;
    const h = iVault.projectExtents.high;
    const c = iVault.projectExtents.center;
    const json = {
      path: [{
        bcurve: {
          closed: false,
          knots: [0, 0, 0, 1, 1, 1],
          order: 3,
          points: [
            [l.x, l.y, c.z],
            [c.x, h.y, c.z],
            [h.x, c.y, c.z],
          ],
        },
      }],
    };

    const path = IVaultJson.Reader.parse(json);
    assert(path instanceof Path);
    this._path = path;

    // Increase the max aspect ratio skew to fit our needs for profile display
    ViewDetails.maxSkew = 1000;
  }

  public decorate(context: DecorateContext): void {
    if (!context.viewport.view.isSpatialView())
      return;

    const builder = context.createGraphic({ type: GraphicType.WorldDecoration, applyAspectRatioSkew: this._applyAspectRatioSkew });
    builder.setSymbology(ColorDef.white, ColorDef.white, 3);
    builder.addPath(this._path);
    context.addDecorationFromBuilder(builder);
  }

  public static toggle(iVault: IVaultConnection, applyAspectRatioSkew: boolean): void {
    const dec = this._instance;
    if (dec) {
      IVaultApp.viewManager.dropDecorator(dec);
      this._instance = undefined;
    } else {
      this._instance = new AspectRatioSkewDecorator(iVault, applyAspectRatioSkew);
      IVaultApp.viewManager.addDecorator(this._instance);
    }
  }
}

/** Decorates all spatial views with a simple bspline curve based on the iVault's project extents, taking into account the view's aspect ratio skew when
 * producing the decoration graphics unless specified otherwise. Use `fdt aspect skew` to change the aspect ratio skew.
 * The level of detail of the graphics should be adjusted based on the skew; if the key-in argument specifies *not* to do so, expect lower-resolution
 * graphics when skew > 1.
 */
export class ToggleAspectRatioSkewDecoratorTool extends Tool {
  private _applyAspectRatioSkew = true;

  public static override toolId = "ToggleAspectRatioSkewDecorator";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override async run(): Promise<boolean> {
    const iVault = IVaultApp.viewManager.selectedView?.iVault;
    if (iVault)
      AspectRatioSkewDecorator.toggle(iVault, this._applyAspectRatioSkew);

    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    const parsedArgs = parseArgs(args);
    this._applyAspectRatioSkew = parsedArgs.getBoolean("a") ?? true;
    return this.run();
  }
}
