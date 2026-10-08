/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IVaultApp } from "../../IVaultApp";
import { IVaultConnection } from "../../IVaultConnection";
import { createBlankConnection } from "../createBlankConnection";
import { ScreenViewport } from "../../Viewport";
import { FrameStats } from "../../render/FrameStats";
import { openBlankViewport } from "../openBlankViewport";
import { EmptyLocalization } from "@szewtwin/core-common";

describe("FrameStats", () => {
  let ivault: IVaultConnection;

  beforeAll(async () => {
    await IVaultApp.startup({ localization: new EmptyLocalization() });
    ivault = createBlankConnection("frame-stats");
  });

  afterAll(async () => {
    await ivault.close();
    await IVaultApp.shutdown();
  });

  function testViewport(width: number, height: number, callback: (vp: ScreenViewport) => void): void {
    using vp = openBlankViewport({ width, height });
    vp.viewFlags = vp.viewFlags.copy({ acsTriad: false, grid: false });

    IVaultApp.viewManager.addViewport(vp);

    callback(vp);
  }

  it("should receive frame statistics from render loop when enabled", async () => {
    testViewport(20, 20, (vp) => {
      const numFramesToDraw = 9;
      let numFrameStats = 0;

      vp.onFrameStats.addListener((_frameStats: Readonly<FrameStats>) => {
        numFrameStats++;
      });

      // make sure we receive frame stats for each rendered frame when enabled
      for (let i = 0; i < numFramesToDraw; i++) {
        vp.invalidateScene();
        vp.renderFrame();
      }
      expect(numFrameStats).toEqual(numFramesToDraw);

      // make sure we do not receive frame stats for any rendered frames when disabled
      vp.onFrameStats.clear();
      numFrameStats = 0;
      for (let i = 0; i < numFramesToDraw; i++) {
        vp.invalidateScene();
        vp.renderFrame();
      }
      expect(numFrameStats).toEqual(0);
    });
  });
});
