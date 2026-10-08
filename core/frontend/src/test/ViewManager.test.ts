/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OnScreenTarget } from "../internal/render/webgl/Target";
import { IVaultApp } from "../IVaultApp";
import { IVaultConnection } from "../IVaultConnection";
import { createBlankConnection } from "./createBlankConnection";
import { openBlankViewport } from "./openBlankViewport";
import { expectColors } from "./ExpectColors";
import { ColorDef, EmptyLocalization } from "@szewtwin/core-common";

describe("ViewManager", () => {
  let ivault: IVaultConnection;

  beforeEach(async () => {
    await IVaultApp.startup({ localization: new EmptyLocalization() });
    ivault = createBlankConnection("view-manager-test");
  });

  afterEach(async () => {
    await ivault.close();
    await IVaultApp.shutdown();
  });

  it("should resize fbo properly after dropping a recently-resized viewport", async () => {
    using vp = openBlankViewport({ width: 32, height: 32 });
    IVaultApp.viewManager.addViewport(vp);
    vp.renderFrame();
    vp.vpDiv.style.width = vp.vpDiv.style.height = "3px";
    IVaultApp.viewManager.dropViewport(vp, false);
    vp.renderFrame();
    expect((vp.target as OnScreenTarget).checkFboDimensions()).toBe(true);
  });

  /** Dropping and immediately re-adding an unresized viewport to the view manager would result in a black rendering
   * until the viewport was manually resized. This happened because when the viewport was removed it would have a 0,0
   * dimension, which was internally recorded (but not acted upon with regard to framebuffers). Once re-adding the viewport,
   * it would be flagged as having a size change because its dimensions were no longer 0 (they became the original
   * dimensions). Disposing and recreating the framebuffers with the same dimensions as the previous framebuffers caused the
   * black rendering in the particular case of re-adding the viewport.
   *
   * We resolved this problem by adding a check to not record a dimension change if the new dimensions are 0 -- we really
   * do not want to create framebuffers with those dimensions anyway, because that is invalid.
   *
   * This test verifies that this problem has been resolved.
   */
  it("should not render black when dropping and re-adding viewport with same dimensions", async () => {
    using vp = openBlankViewport({ width: 32, height: 32 });
    vp.displayStyle.backgroundColor = ColorDef.red;
    IVaultApp.viewManager.addViewport(vp);
    vp.renderFrame();
    expectColors(vp, [ColorDef.red]);
    IVaultApp.viewManager.dropViewport(vp, false);
    IVaultApp.viewManager.addViewport(vp);
    vp.renderFrame();
    expectColors(vp, [ColorDef.red]);
  });

  it("should dispose of viewport when onShutdown is called", async () => {
    const vp = openBlankViewport({ width: 30, height: 30 });
    IVaultApp.viewManager.addViewport(vp);
    await IVaultApp.shutdown();

    expect(vp.isDisposed).toBe(true);
  });
});
