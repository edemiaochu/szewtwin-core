/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  ImageryMapLayerTreeReference,
  MapLayerFormat,
  MapLayerFormatRegistry,
  MapLayerImageryProvider,
} from "../../../tile/internal";
import { ImageMapLayerProps, ImageMapLayerSettings } from "@szewtwin/core-common";
import { IVaultConnection } from "../../../IVaultConnection";

class TestMapLayerFormat extends MapLayerFormat {
  public static override formatId = "TestMapLayerFormat";

  public static override createImageryProvider(settings: TestMapLayerSettings): MapLayerImageryProvider | undefined {
    return new TestMapLayerImageryProvider(settings, false);
  }

  public static override createMapLayerTree(layerSettings: TestMapLayerSettings, layerIndex: number, iVault: IVaultConnection) {
    return new ImageryMapLayerTreeReference({ layerSettings, layerIndex, iVault });
  }
}

class TestMapLayerImageryProvider extends MapLayerImageryProvider {
  public async constructUrl(row: number, column: number, zoomLevel: number) {
    return `test.com/tile/${zoomLevel}/${row}/${column}`;
  }
}

class TestMapLayerSettings extends ImageMapLayerSettings { }

const testMapLayer = {
  name: "TestName",
  visible: true,
  title: "TestTitle",
  formatId: TestMapLayerFormat.formatId,
};

describe("MapLayerFormat", () => {
  let ivault: IVaultConnection;

  it("should create proper provider", async () => {
    const input = JSON.parse(JSON.stringify(testMapLayer)) as ImageMapLayerProps;
    const settings = TestMapLayerSettings.fromJSON(input);
    const provider = TestMapLayerFormat.createImageryProvider(settings);

    expect(provider).toBeDefined();
    expect(provider instanceof TestMapLayerImageryProvider);

    const url = await provider?.constructUrl(1, 2, 3);
    expect(url).toEqual("test.com/tile/3/1/2");
  });

  it("should be registered correctly", () => {
    const registry = new MapLayerFormatRegistry({});
    registry.register(TestMapLayerFormat);
    const isRegistered = registry.isRegistered("TestMapLayerFormat");
    expect(isRegistered).toBe(true);
  });

  it("should create proper map layer tree", () => {
    const input = JSON.parse(JSON.stringify(testMapLayer)) as ImageMapLayerProps;
    const settings = TestMapLayerSettings.fromJSON(input);
    const mapLayerTree = TestMapLayerFormat.createMapLayerTree(settings, 0, ivault);
    expect(mapLayerTree).toBeDefined();
  });
});
