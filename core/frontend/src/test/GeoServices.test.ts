/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { BeDuration, BeEvent } from "@szewtwin/core-szewec";
import { GeographicCRSProps, PointWithStatus } from "@szewtwin/core-common";
import { GeoServices, GeoServicesOptions } from "../GeoServices";

describe("GeoServices", () => {
  function makeGeoServices(opts: Partial<GeoServicesOptions> = { }): GeoServices {
    return new GeoServices({
      isIVaultClosed: opts.isIVaultClosed ?? (() => false),
      toIVaultCoords: opts.toIVaultCoords ?? (async () => Promise.resolve([])),
      fromIVaultCoords: opts.fromIVaultCoords ?? (async () => Promise.resolve([])),
    });
  }

  it("caches GeoConverters by datum name", () => {
    const gs = makeGeoServices();
    const a = gs.getConverter("a");
    expect(gs.getConverter("a")).toEqual(a);

    const b = gs.getConverter("b");
    expect(b).not.toEqual(a);
    expect(gs.getConverter("b")).toEqual(b);

    expect(gs.getConverter()).toEqual(gs.getConverter());
  });

  it("caches GeoConverters by coordinate system JSON", () => {
    const gs = makeGeoServices();
    const a = gs.getConverter({});
    expect(gs.getConverter({})).toEqual(a);

    const gcrs: GeographicCRSProps = {
      additionalTransform: {
        helmert2DWithZOffset: {
          translationX: 0,
          translationY: 1,
          translationZ: 2,
          rotDeg: 3,
          scale: 4,
        },
      },
    };

    const b = gs.getConverter(gcrs);
    expect(gs.getConverter(gcrs)).toEqual(b);
    expect(b).not.toEqual(a);

    gcrs.additionalTransform!.helmert2DWithZOffset!.scale = 5;
    const c = gs.getConverter(gcrs);
    expect(c).not.toEqual(b);
    expect(gs.getConverter(gcrs)).toEqual(c);
  });

  it("removes converter from cache once all requests complete", async () => {
    const gs = makeGeoServices();
    const cv = gs.getConverter()!;
    expect(gs.getConverter()).toEqual(cv);

    await cv.convertToIVaultCoords([[0, 1, 2]]);
    const cv2 = gs.getConverter()!;
    expect(cv2).not.toEqual(cv);
    expect(gs.getConverter()).toEqual(cv2);

    await cv2.convertFromIVaultCoords([[2, 1, 0]]);
    expect(gs.getConverter()).not.toEqual(cv2);
  });

  async function waitOneFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }

  it("retains converter in cache until all requests complete", async () => {
    async function resolveAfter2Frames(): Promise<PointWithStatus[]> {
      await waitOneFrame();
      return new Promise<PointWithStatus[]>((resolve) => {
        requestAnimationFrame(() => {
          resolve([]);
        });
      });
    }

    const gs = makeGeoServices({
      toIVaultCoords: async () => resolveAfter2Frames(),
      fromIVaultCoords: async () => resolveAfter2Frames(),
    });

    const cv = gs.getConverter()!;
    const promises: Array<Promise<PointWithStatus[]>> = [];
    promises.push(cv.convertToIVaultCoords([[0, 0, 0]]));
    await waitOneFrame();
    expect(gs.getConverter()).toEqual(cv);
    promises.push(cv.convertToIVaultCoords([[1, 1, 1]]));
    await waitOneFrame();
    expect(gs.getConverter()).toEqual(cv);
    promises.push(cv.convertFromIVaultCoords([[2, 2, 2]]));
    await waitOneFrame();
    expect(gs.getConverter()).toEqual(cv);
    promises.push(cv.convertFromIVaultCoords([[3, 3, 3]]));
    expect(gs.getConverter()).toEqual(cv);

    await Promise.all(promises);
    expect(gs.getConverter()).not.toEqual(cv);
  });

  it("resolves all requests to the same result if a request arrives while another request for same point is in flight", async () => {
    const resolveEvent = new BeEvent<() => void>();
    async function resolveOnEvent(numPoints: number): Promise<PointWithStatus[]> {
      return new Promise((resolve) => {
        const result: PointWithStatus[] = [];
        for (let i = 0; i < numPoints; i++)
          result.push({ p: [0, 0, 0], s: 0 });

        resolveEvent.addOnce(() => resolve(result));
      });
    }

    let curNumPoints = 1;
    const gs = makeGeoServices({
      toIVaultCoords: async () => resolveOnEvent(curNumPoints++),
      fromIVaultCoords: async () => resolveOnEvent(curNumPoints++),
    });

    const cv = gs.getConverter()!;
    const p1 = cv.convertToIVaultCoords([[0, 0, 0]]);
    await waitOneFrame();
    resolveEvent.raiseEvent();

    const p2 = cv.convertToIVaultCoords([[0, 0, 0]]);
    const r1 = await p1;
    expect(r1.length).toEqual(1);
    resolveEvent.raiseEvent();
    const r2 = await p2;
    expect(r2.length).toEqual(1);
  });

  it("removes converter from cache even if requests produce an exception", async () => {
    const gs = makeGeoServices({
      toIVaultCoords: async () => { throw new Error("oh no!"); },
    });
    const cv = gs.getConverter()!;
    expect(gs.getConverter()).toEqual(cv);

    await cv.convertToIVaultCoords([[0, 1, 2]]);
    const cv2 = gs.getConverter();
    expect(cv2).toBeDefined();
    expect(cv2).not.toEqual(cv);
  });

  it("retains converter in cache if no requests are received", async () => {
    const gs = makeGeoServices();
    const cv = gs.getConverter()!;
    await BeDuration.wait(1);
    expect(gs.getConverter()).toEqual(cv);

    await cv.convertToIVaultCoords([[0, 1, 2]]);
    expect(gs.getConverter()).not.toEqual(cv);
  });
});
