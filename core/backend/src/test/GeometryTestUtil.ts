/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import {
  Point3d, Transform, YawPitchRollAngles,
} from "@szewtwin/core-geometry";
import {
  BRepEntity, ColorDef,
} from "@szewtwin/core-common";
import { IVaultTestUtils } from "./IVaultTestUtils";

export const brepData: { data: string } = JSON.parse(
  fs.readFileSync(IVaultTestUtils.resolveAssetFile("brepdata1.json"), {
    encoding: "utf8",
  }),
);

export function createBRepDataProps(origin?: Point3d, angles?: YawPitchRollAngles): BRepEntity.DataProps {
  // This brep has a face symbology attribute attached to one face, make it green.
  const faceSymb: BRepEntity.FaceSymbologyProps[] = [
    { color: ColorDef.blue.toJSON() }, // base symbology should match appearance...
    { color: ColorDef.green.toJSON(), transparency: 0.5 },
  ];

  const brepProps: BRepEntity.DataProps = {
    data: brepData.data,
    faceSymbology: faceSymb,
    transform: Transform.createOriginAndMatrix(origin, angles ? angles.toMatrix3d() : undefined).toJSON(),
  };

  return brepProps;
}
