/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Guid } from "@szewtwin/core-szewec";
import { Range3d } from "@szewtwin/core-geometry";
import { Cartographic } from "@szewtwin/core-common";
import { BlankConnection } from "../IVaultConnection";

/** Open a blank connection for tests. */
export function createBlankConnection(name = "test-blank-connection",
  location = Cartographic.fromDegrees({ longitude: -75.686694, latitude: 40.065757, height: 0 }),
  extents = new Range3d(-1000, -1000, -100, 1000, 1000, 100),
  szewTwinId = Guid.createValue()): BlankConnection {
  return BlankConnection.create({ name, location, extents, szewTwinId });
}
