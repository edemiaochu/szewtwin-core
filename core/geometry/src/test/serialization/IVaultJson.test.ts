/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import { BSplineCurve3dBase } from "../../bspline/BSplineCurve";
import { Arc3d } from "../../curve/Arc3d";
import { CoordinateXYZ } from "../../curve/CoordinateXYZ";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { Path } from "../../curve/Path";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { IndexedPolyface } from "../../polyface/Polyface";
import { DeepCompare } from "../../serialization/DeepCompare";
import { Sample } from "../GeometrySamples";
import { IVaultJson } from "../../serialization/IVaultJsonSchema";
import { Box } from "../../solid/Box";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";
import { testGeometryQueryRoundTrip } from "./FlatBuffer.test";

// cspell:word geomlibs
// cspell:word BSIJSON

// directory containing ivjs files produced by native geomlibs tests:
const iVaultJsonNativeSamplesDirectory = "./src/test/data/iVaultJsonSamples/fromNative/";
// directory containing ivjs files produced by prior executions of this test file:
const iVaultJsonSamplesDirectory = "./src/test/data/iVaultJsonSamples/fromGC/";
// Output folder typically not tracked by git... make directory if not there
const iVaultJsonOutputSubFolder = "iVaultJsonSamples";

function deepAlmostEqual(g0: any, g1: any): boolean {
  if (Array.isArray(g0) && Array.isArray(g1)) {
    if (g0.length !== g1.length)
      return false;
    for (let i = 0; i < g0.length; i++) {
      if (!deepAlmostEqual(g0[i], g1[i]))
        return false;
    }
    return true;
  } else if (g0 instanceof GeometryQuery && g1 instanceof GeometryQuery) {
    return g0.isAlmostEqual(g1);
  }
  return false;
}

/** For each property P of the json value:  save the value as a new member of the array counter.P
 */
function saveJson(jsv: object, counter: { [key: string]: any }) {
  if (typeof jsv === "object" && typeof jsv !== "function" && !Array.isArray(jsv)) {
    for (const property in jsv) {
      if (jsv.hasOwnProperty(property)) {
        // const key = "sampleData_" + property;
        const key = property;
        // Add property to counter if not already there
        if (!counter.hasOwnProperty(key))
          counter[key] = [];
        counter[key].push(jsv);
      }
    }
  }
}

const allIVaultJsonSamples: { [key: string]: any } = {};
// if geometry, apply dx,dy,dz.
// If array, apply dy and multiple of x shift to each member
function applyShifts(g: any, dx: number, dy: number): any {
  if (Array.isArray(g)) {
    let i = 0;
    for (const g1 of g) {
      applyShifts(g1, i * dx, dy);
      i++;
    }
    return g;
  }

  if (g instanceof GeometryQuery) {
    g.tryTranslateInPlace(dx, dy, 0);
  }
  return g;
}
function exerciseIVaultJSon(ck: Checker, g: any, doParse: boolean = false, noisy: boolean = false) {
  if (Array.isArray(g)) {
    for (const g1 of g)
      exerciseIVaultJSon(ck, g1, doParse, noisy);
    return;
  }

  if (g instanceof GeometryQuery) {
    const imData = IVaultJson.Writer.toIVaultJson(g);
    saveJson(imData, allIVaultJsonSamples);
    if (noisy)
      GeometryCoreTestIO.consoleLog(prettyPrint(imData));
    if (doParse) {
      const g1 = IVaultJson.Reader.parse(imData) as GeometryQuery;
      if (!g1 || !g.isAlmostEqual(g1)) {
        ck.announceError("IVaultJson round trip error", g, prettyPrint(imData), prettyPrint(g1));
        IVaultJson.Reader.parse(imData);
        GeometryCoreTestIO.consoleLog("*********** round trip data *********");
        GeometryCoreTestIO.consoleLog(prettyPrint(g));
        GeometryCoreTestIO.consoleLog(prettyPrint(imData));
        GeometryCoreTestIO.consoleLog(prettyPrint(g1));
        g.isAlmostEqual(g1);
        GeometryCoreTestIO.consoleLog("=====================================");

        const imData1 = IVaultJson.Writer.toIVaultJson(g);
        const g2 = IVaultJson.Reader.parse(imData1) as GeometryQuery;
        g.isAlmostEqual(g2);
      }
      if (noisy)
        GeometryCoreTestIO.consoleLog("Round Trip", prettyPrint(g1));
    }
    return;
  }

}

function exerciseIVaultJSonArray(ck: Checker, g: any[], doParse: boolean = false, noisy: boolean = false) {
  const writer = new IVaultJson.Writer();
  const imData = writer.emit(g);
  saveJson(imData, allIVaultJsonSamples);
  if (noisy)
    GeometryCoreTestIO.consoleLog(prettyPrint(imData));
  if (doParse) {
    const g1 = IVaultJson.Reader.parse(imData) as any[];
    if (ck.testTrue(Array.isArray(g1), "[] returns as array", g1)) {
      if (ck.testExactNumber(g.length, g1.length, "Array lengths", g, g1)) {
        for (let i = 0; i < g.length; i++) {
          ck.testTrue(g[i].isAlmostEqual(g1[i]), g[i], g1[i]);
          if (noisy)
            GeometryCoreTestIO.consoleLog("Round Trip", prettyPrint(g1[i]));
        }
      }
    }
  }
}
//
// IVaultJsonSamples workflow:
// * Each execution of it("CreateIVaultJsCreateIVaultJsonSamplesonSamples") constructs GeometryQuery objects and saves them in the test output
//            path     test/output/IVaultJsonSamples
// * a copy of those is saved in path     test/IVaultJsonSamples
// * Each execution of it("ReadIVaultJson") reads tht saved files in test/IVaultJsonSamples, converts to GeometryQuery, converts that back to
//     json and does a deep compare of the before/after json
//

describe("CreateIVaultJsonSamples", () => {
  it("GeometryQueryToIVaultJS", () => {
    const ck = new Checker();
    const numSample = 3;
    ck.testUndefined(IVaultJson.Writer.toIVaultJson(undefined), "IVaultJsonWriter(undefined)");

    exerciseIVaultJSon(ck, Sample.createLineStrings(), true, false);
    exerciseIVaultJSon(ck, Sample.createSmoothCurvePrimitives(numSample), true, false);
    exerciseIVaultJSon(ck, CoordinateXYZ.create(Point3d.create(11, 7, 5)), true, false);

    exerciseIVaultJSon(ck, Sample.createSimplePaths(), true, false);
    exerciseIVaultJSon(ck, Sample.createSimpleLoops(), true, false);
    exerciseIVaultJSon(ck, Sample.createSimpleParityRegions(), true, false);

    exerciseIVaultJSon(ck, Sample.createSpheres(), true, false);
    exerciseIVaultJSon(ck, Sample.createCones(), true, false);
    exerciseIVaultJSon(ck, Sample.createBoxes(), true, false);
    exerciseIVaultJSon(ck, Sample.createTorusPipes(), true, false);
    exerciseIVaultJSon(ck, Sample.createSimpleLinearSweeps(), true, false);
    exerciseIVaultJSon(ck, Sample.createSimpleRotationalSweeps(), true, false);
    exerciseIVaultJSon(ck, Sample.createRuledSweeps(), true, false);

    exerciseIVaultJSon(ck, applyShifts(Sample.createBsplineCurves(true), 10, 0), true, false);
    exerciseIVaultJSon(ck, applyShifts(Sample.createBspline3dHCurves(), 10, 10), true, false);
    exerciseIVaultJSon(ck, Sample.createXYGridBsplineSurface(4, 3, 3, 2)!, true, false);
    exerciseIVaultJSon(ck, Sample.createWeightedXYGridBsplineSurface(4, 3, 3, 2, 1.0, 1.1, 0.9, 1.0)!, true, false);
    exerciseIVaultJSon(ck, Sample.createSimpleIndexedPolyfaces(1), true, false);
    exerciseIVaultJSon(ck, Sample.createSimplePointStrings(), true, false);
    exerciseIVaultJSon(ck, Sample.createSimpleTransitionSpirals(), true, false);
    // exerciseIVaultJSon(ck, Sample.createSimpleIndexedPolyfaces(3), true, true);
    GeometryCoreTestIO.savePropertiesAsSeparateFiles(iVaultJsonOutputSubFolder, allIVaultJsonSamples);
    exerciseIVaultJSonArray(ck, Sample.createSmoothCurvePrimitives(numSample), true, false);

    // GeometryCoreTestIO.consoleLog(allIVaultJsonSamples);
    expect(ck.getNumErrors()).toBe(0);

  });
  // exercise the secondary ArcBy3Points property, with various point formats . ..
  it("ArcByStartMiddleEnd", () => {
    const ck = new Checker();
    const json = {
      arc: [[3, 1, 0], Point3d.create(3, 3, 0), { x: 1, y: 3, z: 0 }],
    };
    // exercise variant point from json:
    const point0 = Point3d.fromJSON(json.arc[0]);
    const point1 = Point3d.fromJSON(json.arc[1]);
    const point2 = Point3d.fromJSON(json.arc[2]);
    const arc = IVaultJson.Reader.parse(json);
    if (ck.testPointer(arc, "arc by 3 points") && arc instanceof Arc3d) {
      const point10 = arc.fractionToPoint(0.0);
      const point12 = arc.fractionToPoint(1.0);
      ck.testPoint3d(point0, point10, "start point");
      ck.testPoint3d(point2, point12, "end point");
      ck.testCoordinate(arc.center.distance(point0), arc.center.distance(point1));
    }
    expect(ck.getNumErrors()).toBe(0);
  });

  // make a mesh with identical normals present redundantly.
  // This was incorrectly compressed by the reader.
  it("MeshWithDuplicateNormals", () => {
    const ck = new Checker();
    const mesh = IndexedPolyface.create(true, false, false, true);
    mesh.data.point.pushXYZ(0, 0, 0);
    mesh.data.point.pushXYZ(1, 0, 0);
    mesh.data.point.pushXYZ(0, 1, 0);
    mesh.data.pointIndex.push(0, 1, 2);
    mesh.data.edgeVisible.push(true, true, true);
    mesh.addNormalXYZ(0, 0, 1);
    mesh.addNormal(Vector3d.create(0, 0, 1));    // in bug state, this reuses the first normal
    mesh.addNormalXYZ(0, 0, 1);
    mesh.addNormalIndex(0);
    mesh.addNormalIndex(1);
    mesh.addNormalIndex(2);
    mesh.terminateFacet();
    ck.testExactNumber(mesh.data.pointIndex.length, 3);
    ck.testExactNumber(mesh.data.point.length, 3);
    ck.testExactNumber(mesh.data.normal!.length, 3);
    ck.testExactNumber(mesh.data.normalIndex!.length, 3);
    mesh.expectedClosure = 1;
    ck.testExactNumber(1, mesh.expectedClosure, "expectedClosure property accessors");
    const meshJson = IVaultJson.Writer.toIVaultJson(mesh);
    const meshB = IVaultJson.Reader.parse(meshJson);
    ck.testTrue(mesh.isAlmostEqual(meshB), "confirm json round trip");
  });
  /* reread the files from several known sources */
  it("ReadIVaultJson", () => {
    const ck = new Checker();
    const compareObj = new DeepCompare();
    const skipList = ["xyVectors", "readme", "README"];
    const expectedJsonMismatchList = ["indexedMesh.numPerFace.",  // the mesh flips to zero-terminated
      "cone.ivjs",                // cone can change to cylinder
      "box.minimal.ivjs",         // minimal box gets remaining fields populated
    ];
    const expectedFBMismatchList = ["point.ivjs", // CoordinateXYZ is not implemented in writeGeometryQueryAsFBVariantGeometry...
    ];
    // read ivjs files from various places -- some produced by native, some by core-geometry ...
    for (const sourceDirectory of [iVaultJsonSamplesDirectory, iVaultJsonNativeSamplesDirectory]) {
      const items = fs.readdirSync(sourceDirectory);
      let numItems = 0;
      let numValuePassed = 0;

      for (const i of items) {
        const currFile = sourceDirectory + i;
        // skip known non-round-trip files ...
        let isFiltered = false;
        for (const candidate of skipList)
          if (currFile.lastIndexOf(candidate) >= 0) { isFiltered = true; break; }
        if (isFiltered) continue;
        Checker.noisy.printJSONFailure = true;
        const data = fs.readFileSync(currFile, "utf8");
        if (Checker.noisy.reportRoundTripFileNames)
          GeometryCoreTestIO.consoleLog(currFile);
        let jsonObject1;
        if (data.length > 0) {
          jsonObject1 = JSON.parse(data);
        } else {
          continue;
        }
        if (jsonObject1 as object) {
          numItems++;
          const geometryQuery1 = IVaultJson.Reader.parse(jsonObject1);
          const jsonObject2 = IVaultJson.Writer.toIVaultJson(geometryQuery1);
          if (compareObj.compare(jsonObject1, jsonObject2)) {
            if (Checker.noisy.printJSONSuccess) { GeometryCoreTestIO.consoleLog(`PASS: ${i}`); }
            numValuePassed++;
          } else {
            const jsonObject3 = IVaultJson.Writer.toIVaultJson(geometryQuery1);
            const geometryQuery3 = IVaultJson.Reader.parse(jsonObject3);
            if (deepAlmostEqual(geometryQuery1, geometryQuery3)) {
              isFiltered = false;
              for (const candidate of expectedJsonMismatchList)
                if (currFile.lastIndexOf(candidate) >= 0) { isFiltered = true; break; }
              GeometryCoreTestIO.consoleLog("%s json round trip mismatch (geometry matches):", isFiltered ? "Expected" : "Warning: Unexpected", currFile);
              if (!isFiltered) {
                GeometryCoreTestIO.consoleLog("jsonObject1:", prettyPrint(jsonObject1));
                GeometryCoreTestIO.consoleLog("jsonObject3:", prettyPrint(jsonObject3));
              }
            } else {
              ck.announceError("ivjs => GeometryQuery => ivjs round trip failure", currFile);
              GeometryCoreTestIO.consoleLog("jsonObject1:", prettyPrint(jsonObject1));
              GeometryCoreTestIO.consoleLog("jsonObject2:", prettyPrint(jsonObject2));
              if (Checker.noisy.printJSONFailure) { GeometryCoreTestIO.consoleLog(`FAIL: ${i}`); GeometryCoreTestIO.consoleLog(compareObj.errorTracker); }
            }
          }
          // test geometry roundtrip thru flatbuffer (and IVJS again)
          isFiltered = false;
          for (const candidate of expectedFBMismatchList)
            if (currFile.lastIndexOf(candidate) >= 0) { isFiltered = true; break; }
          if (isFiltered) continue;
          testGeometryQueryRoundTrip(ck, geometryQuery1);
        }
      }
      if (Checker.noisy.printJSONSuccess) {
        GeometryCoreTestIO.consoleLog(` ivjs => geometry files from ${sourceDirectory}`);
        GeometryCoreTestIO.consoleLog(`*************** ${numValuePassed} files passed out of ${numItems} checked`);
      }
    }
    ck.checkpoint("BSIJSON.ParseIVJS");
    expect(ck.getNumErrors()).toBe(0);
  });
});

describe("BoxProps", () => {
  type BoxProps = IVaultJson.BoxProps;

  function parseBox(props: BoxProps): Box | undefined {
    return IVaultJson.Reader.parseBox(props);
  }

  function expectBoxOrigin(inputProps: BoxProps, expectedOrigin: number): void {
    const box = parseBox(inputProps)!;
    expect(box).toBeDefined();
    expect(box.getBaseOrigin().x).toBe(expectedOrigin);
  }

  it("accepts either origin or baseOrigin", () => {
    expectBoxOrigin({ origin: [3, 2, 1], baseX: 10 }, 3);
    expectBoxOrigin({ baseOrigin: [4, 5, 6], baseX: 5 } as BoxProps, 4);
  });

  it("prefers origin if both origin and baseOrigin are specified", () => {
    expectBoxOrigin({
      origin: [5, 5, 5],
      baseOrigin: [6, 6, 6],
      baseX: 7,
    }, 5);
  });

  it("requires either origin or baseOrigin", () => {
    expect(parseBox({ baseX: 123 } as BoxProps)).toBeUndefined();
  });

  it("outputs both origin and baseOrigin", () => {
    const box = parseBox({ origin: [1, 2, 3], baseX: 4 })!;
    expect(box).toBeDefined();

    const solidProps = new IVaultJson.Writer().handleBox(box);
    const props = solidProps.box!;
    expect(props).toBeDefined();

    expect(props.origin).toBeDefined();
    const origin = Point3d.fromJSON(props.origin);
    expect(origin.x).toBe(1);
    expect(origin.y).toBe(2);
    expect(origin.z).toBe(3);

    expect(props.baseOrigin).toBeDefined();
    const baseOrigin = Point3d.fromJSON(props.baseOrigin);
    expect(baseOrigin?.x).toBe(1);
    expect(baseOrigin?.y).toBe(2);
    expect(baseOrigin?.z).toBe(3);
  });
});

describe("ParseCurveCollections", () => {
  it("BSplinePathRegression", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const inputs = IVaultJson.Reader.parse(JSON.parse(fs.readFileSync("./src/test/data/curve/pathWithBSplines.ivjs", "utf8"))) as Path[];
    if (ck.testDefined(inputs, "inputs successfully parsed")) {
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, inputs);
      for (const input of inputs) {
        ck.testExactNumber(7, input.children.length, "path has expected number of children");
        ck.testExactNumber(3, input.children.filter((child: CurvePrimitive): boolean => { return child instanceof BSplineCurve3dBase; }).length, "path has expected number of B-spline curve children");
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "ParseCurveCollection", "BSplinePathRegression");
    expect(ck.getNumErrors()).toBe(0);
  });
});
