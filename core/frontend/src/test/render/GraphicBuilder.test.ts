/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Cone, Point3d, PolyfaceBuilder, Range3d, Sphere, StrokeOptions, Transform,
} from "@szewtwin/core-geometry";
import { ColorByName, ColorDef, ColorDefProps, ColorIndex, EmptyLocalization, FeatureIndex, FillFlags, QParams3d, QPoint3dList, RenderMode } from "@szewtwin/core-common";
import { GraphicBuilder, ViewportGraphicBuilderOptions } from "../../render/GraphicBuilder";
import { IVaultApp, IVaultAppOptions } from "../../IVaultApp";
import { IVaultConnection } from "../../IVaultConnection";
import { createBlankConnection } from "../createBlankConnection";
import { RenderSystem } from "../../render/RenderSystem";
import { ScreenViewport } from "../../Viewport";
import { MeshParams } from "../../common/internal/render/MeshParams";
import { SurfaceType } from "../../common/internal/render/SurfaceParams";
import { MeshRenderGeometry } from "../../internal/render/webgl/Mesh";
import { openBlankViewport } from "../openBlankViewport";
import { GraphicType } from "../../common/render/GraphicType";
import { MeshArgs } from "../../render/MeshArgs";

describe("GraphicBuilder", () => {
  let ivault: IVaultConnection;
  let viewport: ScreenViewport;

  beforeAll(async () => {
    const opts: IVaultAppOptions = {
      // One test wants to confirm number of segment and silhouette edges produced - disable indexed edges.
      tileAdmin: { enableIndexedEdges: false },
      localization: new EmptyLocalization(),
    };
    await IVaultApp.startup(opts);
    ivault = createBlankConnection();
  });

  beforeEach(() => {
    viewport = openBlankViewport();
  });

  afterEach(() => viewport[Symbol.dispose]());

  afterAll(async () => {
    await ivault.close();
    await IVaultApp.shutdown();
  });

  type BuilderOpts = Omit<ViewportGraphicBuilderOptions, "viewport" | "type">;

  function makeBuilder(type: GraphicType, options: BuilderOpts): GraphicBuilder {
    return IVaultApp.renderSystem.createGraphic({ type, viewport, ...options });
  }

  const graphicTypes = [GraphicType.ViewBackground, GraphicType.Scene, GraphicType.WorldDecoration, GraphicType.WorldOverlay, GraphicType.ViewOverlay];

  describe("generates normals", () => {
    function expectNormals(type: GraphicType, options: BuilderOpts, expected: boolean): void {
      const builder = makeBuilder(type, options);
      expect(builder.wantNormals).toEqual(expected);
    }

    it("for scene graphics only by default", () => {
      for (const type of graphicTypes)
        expectNormals(type, {}, type === GraphicType.Scene);
    });

    it("always if generating edges", () => {
      expect(viewport.viewFlags.edgesRequired()).toBe(true);
      for (const type of graphicTypes) {
        expectNormals(type, { generateEdges: true }, true);
        expectNormals(type, { generateEdges: false }, type === GraphicType.Scene);
        expectNormals(type, { generateEdges: true, wantNormals: false }, false);
      }
    });

    it("always if explicitly requested", () => {
      for (const type of graphicTypes)
        expectNormals(type, { wantNormals: true }, true);
    });

    it("never if explicitly specified", () => {
      for (const type of graphicTypes)
        expectNormals(type, { wantNormals: false }, false);
    });
  });

  describe("generates edges", () => {
    function expectEdges(type: GraphicType, options: BuilderOpts, expected: boolean): void {
      const builder = makeBuilder(type, options);
      expect(builder.wantEdges).toEqual(expected);
    }

    it("by default only for scene graphics, if view flags require them", () => {
      expect(viewport.viewFlags.edgesRequired()).toBe(true);
      for (const type of graphicTypes)
        expectEdges(type, {}, type === GraphicType.Scene);
    });

    it("never, if view flags do not require them", () => {
      const vf = viewport.viewFlags.copy({ renderMode: RenderMode.SmoothShade, visibleEdges: false });
      viewport.viewFlags = vf;
      expect(viewport.viewFlags.edgesRequired()).toBe(false);

      for (const type of graphicTypes)
        expectEdges(type, {}, false);
    });

    it("always if explicitly requested", () => {
      for (const type of graphicTypes)
        expectEdges(type, { generateEdges: true }, true);
    });

    it("never if explicitly specified", () => {
      for (const type of graphicTypes)
        expectEdges(type, { generateEdges: false }, false);
    });
  });

  describe("createTriMesh", () => {
    it("should create a simple mesh graphic", () => {
      const points = [new Point3d(0, 0, 0), new Point3d(10, 0, 0), new Point3d(0, 10, 0)];
      const qpoints = new QPoint3dList(QParams3d.fromRange(Range3d.createArray(points)));
      for (const point of points)
        qpoints.add(point);

      const colors = new ColorIndex();
      colors.initUniform(ColorByName.tan);

      const args: MeshArgs = {
        points: qpoints,
        vertIndices: [0, 1, 2],
        colors,
        fillFlags: FillFlags.None,
        features: new FeatureIndex(),
      };

      const graphic = IVaultApp.renderSystem.createTriMesh(args);
      expect(graphic).toBeDefined();
    });
  });

  describe("createMesh", () => {
    let renderSystemCreateMesh: typeof RenderSystem.prototype.createMeshGeometry;
    let createMeshInvoked = false;

    afterEach(() => {
      if (renderSystemCreateMesh)
        IVaultApp.renderSystem.createMeshGeometry = renderSystemCreateMesh;
    });

    function overrideCreateMesh(verifyParams?: (params: MeshParams) => void, verifyGraphic?: (graphic: MeshRenderGeometry) => void): void {
      if (!renderSystemCreateMesh)
        renderSystemCreateMesh = IVaultApp.renderSystem.createMeshGeometry; // eslint-disable-line @typescript-eslint/unbound-method

      createMeshInvoked = false;

      IVaultApp.renderSystem.createMeshGeometry = (params: MeshParams, viOrigin?: Point3d) => {
        createMeshInvoked = true;
        if (verifyParams)
          verifyParams(params);

        const graphic = renderSystemCreateMesh.apply(IVaultApp.renderSystem, [params, viOrigin]) as MeshRenderGeometry;
        expect(graphic).toBeInstanceOf(MeshRenderGeometry);
        if (verifyGraphic)
          verifyGraphic(graphic);

        return graphic;
      };
    }

    function injectNormalsCheck(expectNormals: boolean): void {
      const verifyParams = (params: MeshParams) => {
        expect(params.vertices.numRgbaPerVertex).toEqual(5);
      };
      const verifyGraphic = (graphic: MeshRenderGeometry) => {
        expect(graphic.data.type).toEqual(expectNormals ? SurfaceType.Lit : SurfaceType.Unlit);
      };

      overrideCreateMesh(verifyParams, verifyGraphic);
    }

    function createTriangle(): Point3d[] {
      return [new Point3d(0, 0, 0), new Point3d(100, 0, 0), new Point3d(0, 100, 0)];
    }

    it("should preserve polyface normals", () => {
      const test = (wantNormals: boolean, requestNormals: boolean) => {
        // If normals are present and wanted, use them.
        // If present and unwanted, ignore them.
        // If wanted but not present, generate them.
        injectNormalsCheck(requestNormals);
        expect(createMeshInvoked).toBe(false);

        const options = StrokeOptions.createForFacets();
        options.needNormals = wantNormals;
        const pfBuilder = PolyfaceBuilder.create(options);
        pfBuilder.addTriangleFacet(createTriangle());

        const gfBuilder = IVaultApp.renderSystem.createGraphic({ placement: Transform.createIdentity(), type: GraphicType.WorldDecoration, viewport, wantNormals: requestNormals });
        gfBuilder.addPolyface(pfBuilder.claimPolyface(), false);
        const gf = gfBuilder.finish();
        gf[Symbol.dispose]();
        expect(createMeshInvoked).toBe(true);
      };

      test(false, false);
      test(true, true);
      test(false, true);
      test(true, false);
    });

    it("should generate normals for shapes if requested", () => {
      const test = (wantNormals: boolean) => {
        injectNormalsCheck(wantNormals);
        expect(createMeshInvoked).toBe(false);

        const builder = IVaultApp.renderSystem.createGraphic({ placement: Transform.createIdentity(), type: GraphicType.WorldDecoration, viewport, wantNormals });
        builder.addShape(createTriangle());
        const gf = builder.finish();
        gf[Symbol.dispose]();
        expect(createMeshInvoked).toBe(true);
      };

      test(false);
      test(true);
    });

    it("should produce edges", () => {
      function expectEdges(expected: "silhouette" | "segment" | "both" | "none", addToGraphic: (builder: GraphicBuilder) => void, generateEdges?: boolean): void {
        let expectSilhouettes = false;
        let expectSegments = false;
        switch (expected) {
          case "both":
            expectSilhouettes = expectSegments = true;
            break;
          case "silhouette":
            expectSilhouettes = true;
            break;
          case "segment":
            expectSegments = true;
            break;
        }

        const verifyParams = (params: MeshParams) => {
          expect(undefined === params.edges).toEqual("none" === expected);
          expect(params.edges?.polylineGroups).toBeUndefined();
          if (params.edges) {
            expect(undefined !== params.edges.segments).toEqual(expectSegments);
            expect(undefined !== params.edges.silhouettes).toEqual(expectSilhouettes);
          }
        };

        expect(viewport.viewFlags.edgesRequired()).toBe(true);

        overrideCreateMesh(verifyParams);
        expect(createMeshInvoked).toBe(false);

        const builder = IVaultApp.renderSystem.createGraphic({ placement: Transform.createIdentity(), type: GraphicType.Scene, viewport, generateEdges });
        expect(builder.wantEdges).toEqual(generateEdges ?? true);
        addToGraphic(builder);

        const gf = builder.finish();
        gf[Symbol.dispose]();
        expect(createMeshInvoked).toBe(true);
      }

      expectEdges("silhouette", (builder) => {
        builder.addSolidPrimitive(Sphere.createCenterRadius(new Point3d(0, 0, 0), 1));
      });

      expectEdges("segment", (builder) => {
        builder.addShape([new Point3d(0, 0, 0), new Point3d(0, 1, 0), new Point3d(0, 1, 1), new Point3d(0, 0, 0)]);
      });

      expectEdges("both", (builder) => {
        const cone = Cone.createAxisPoints(new Point3d(0, 0, 0), new Point3d(0, 0, 1), 0.5, 0.25, true)!;
        expect(cone).toBeDefined();
        builder.addSolidPrimitive(cone);
      });

      expectEdges("none", (builder) => {
        builder.addSolidPrimitive(Sphere.createCenterRadius(new Point3d(0, 0, 0), 1));
      }, false);
    });
  });

  describe("colors", () => {
    type PrimitiveType = "Mesh" | "PointString" | "Polyline";
    type PrimitiveColor = [ PrimitiveType, ColorDefProps ];
    const primitiveColors: PrimitiveColor[] = [];

    let createMeshGeometry: typeof RenderSystem.prototype.createMeshGeometry;
    let createPolylineGeometry: typeof RenderSystem.prototype.createPolylineGeometry;
    let createPointStringGeometry: typeof RenderSystem.prototype.createPointStringGeometry;

    beforeEach(() => {
      createMeshGeometry = IVaultApp.renderSystem.createMeshGeometry; // eslint-disable-line @typescript-eslint/unbound-method
      IVaultApp.renderSystem.createMeshGeometry = (params, viOrigin) => {
        expect(params.vertices.uniformColor).not.to.be.undefined;
        primitiveColors.push(["Mesh", params.vertices.uniformColor!.toJSON()]);
        return createMeshGeometry.apply(IVaultApp.renderSystem, [params, viOrigin]);
      };

      createPolylineGeometry = IVaultApp.renderSystem.createPolylineGeometry; // eslint-disable-line @typescript-eslint/unbound-method
      IVaultApp.renderSystem.createPolylineGeometry = (params, viOrigin) => {
        expect(params.vertices.uniformColor).not.to.be.undefined;
        primitiveColors.push(["Polyline", params.vertices.uniformColor!.toJSON()]);
        return createPolylineGeometry.apply(IVaultApp.renderSystem, [params, viOrigin]);
      };

      createPointStringGeometry = IVaultApp.renderSystem.createPointStringGeometry; // eslint-disable-line @typescript-eslint/unbound-method
      IVaultApp.renderSystem.createPointStringGeometry = (params, viOrigin) => {
        expect(params.vertices.uniformColor).not.to.be.undefined;
        primitiveColors.push(["PointString", params.vertices.uniformColor!.toJSON()]);
        return createPointStringGeometry.apply(IVaultApp.renderSystem, [params, viOrigin]);
      };
    });
    
    afterEach(() => {
      primitiveColors.length = 0;
      IVaultApp.renderSystem.createMeshGeometry = createMeshGeometry;
      IVaultApp.renderSystem.createPolylineGeometry = createPolylineGeometry;
      IVaultApp.renderSystem.createPointStringGeometry = createPointStringGeometry;
    });
    
    const lineColor = ColorDef.red;
    const fillColor = ColorDef.blue;
    const points = [new Point3d(0, 0, 0), new Point3d(1, 0, 0), new Point3d(0, 1, 0), new Point3d(0, 0, 0)];

    function expectColors(expected: PrimitiveColor[]): void {
      expect(primitiveColors).to.deep.equal(expected);
    }

    function expectColor(expected: PrimitiveColor): void {
      expectColors([expected]);
    }

    it("uses line color for lines", () => {
      const builder = IVaultApp.renderSystem.createGraphic({ type: GraphicType.Scene, viewport });
      builder.setSymbology(lineColor, fillColor, 1);
      builder.addLineString(points);
      builder.finish();
      expectColor(["Polyline", lineColor.toJSON()]);
    });

    it("uses line color for points", () => {
      const builder = IVaultApp.renderSystem.createGraphic({ type: GraphicType.Scene, viewport });
      builder.setSymbology(lineColor, fillColor, 1);
      builder.addPointString(points);
      builder.finish();
      expectColor(["PointString", lineColor.toJSON()]);
    });
    
    it("produces edge table for planar region if line color and fill color are the same", () => {
      const builder = IVaultApp.renderSystem.createGraphic({ type: GraphicType.Scene, viewport });
      builder.setSymbology(fillColor, fillColor, 1);
      builder.addShape(points);
      builder.finish();
      expectColors([["Mesh", fillColor.toJSON()]]);
    });

    it("produces polyline edges for planar region if line color differs from fill color", () => {
      const builder = IVaultApp.renderSystem.createGraphic({ type: GraphicType.Scene, viewport });
      builder.setSymbology(lineColor, fillColor, 1);
      builder.addShape(points);
      builder.finish();
      expectColors([["Mesh", fillColor.toJSON()], ["Polyline", lineColor.toJSON()]]);
    });

    it("produces edge table using fill color regardless of line color if geometry is not a planar region", () => {
      const builder = IVaultApp.renderSystem.createGraphic({ type: GraphicType.Scene, viewport });
      builder.setSymbology(lineColor, fillColor, 1);
      const sphere = Sphere.createCenterRadius(points[0], 1);
      builder.addSolidPrimitive(sphere);
      builder.finish();
      expectColors([["Mesh", fillColor.toJSON()]]);
    });
  });
});
