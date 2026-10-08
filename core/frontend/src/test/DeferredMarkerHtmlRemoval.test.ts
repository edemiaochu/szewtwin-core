/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScreenViewport } from "../Viewport";
import { Decorator } from "../ViewManager";
import { DecorateContext } from "../ViewContext";
import { IVaultApp } from "../IVaultApp";
import { openBlankViewport } from "./openBlankViewport";
import { Marker } from "../Marker";
import { EmptyLocalization } from "@szewtwin/core-common";

describe("ScreenViewport", () => {
  beforeEach(async () => {
    await IVaultApp.startup({ localization: new EmptyLocalization() });
  });
  afterEach(async () => {
    if (IVaultApp.initialized)
      await IVaultApp.shutdown();
  });

  function makeMarker(vp: ScreenViewport) {
    const marker = new Marker(vp.viewToWorld({ x: 0, y: 0, z: 0 }), {
      x: 10,
      y: 10,
    });
    marker.htmlElement = document.createElement("div");
    return marker;
  }

  class AddMarkersAlwaysDecorator implements Decorator {
    public markers: Marker[];
    public constructor(vp: ScreenViewport) {
      this.markers = new Array(3).fill(undefined).map(() => makeMarker(vp));
    }
    public decorate(ctx: DecorateContext) {
      this.markers.forEach((m) => {
        m.addDecoration(ctx);
      });
    }
  }

  class AddMarkersOnceDecorator implements Decorator {
    public markers: Marker[];
    private _didOnce = false;
    public constructor(vp: ScreenViewport) {
      this.markers = new Array(3).fill(undefined).map(() => makeMarker(vp));
    }
    public decorate(ctx: DecorateContext) {
      if (!this._didOnce) {
        this.markers.forEach((m) => {
          m.addDecoration(ctx);
        });
        this._didOnce = true;
      }
    }
  }

  it("should not delete markers that are readded by registered decorators", () => {
    const vp = openBlankViewport();
    const decorator = new AddMarkersAlwaysDecorator(vp);
    IVaultApp.viewManager.addDecorator(decorator);
    IVaultApp.viewManager.addViewport(vp);
    vp.setAllValid();
    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      expect(vp.decorationDiv.contains(marker.htmlElement!)).toBe(true);
    }

    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      expect(vp.decorationDiv.contains(marker.htmlElement!)).toBe(true);
    }

    IVaultApp.viewManager.dropDecorator(decorator);
  });

  it("should delete markers that aren't readded by registered decorators", () => {
    const vp = openBlankViewport();
    const decorator = new AddMarkersOnceDecorator(vp);
    IVaultApp.viewManager.addDecorator(decorator);
    IVaultApp.viewManager.addViewport(vp);
    vp.setAllValid();
    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      expect(vp.decorationDiv.contains(marker.htmlElement!)).toBe(true);
    }

    vp.invalidateDecorations();

    vp.renderFrame();
    for (const marker of decorator.markers) {
      expect(vp.decorationDiv.contains(marker.htmlElement!)).toBe(false);
    }

    IVaultApp.viewManager.dropDecorator(decorator);
  });
});
