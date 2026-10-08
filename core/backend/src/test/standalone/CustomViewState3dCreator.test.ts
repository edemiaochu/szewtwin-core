/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { CustomViewState3dProps } from "@szewtwin/core-common";
import { SnapshotDb } from "../../IVaultDb";
import { CompressedId64Set, Id64String} from "@szewtwin/core-szewec";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { CustomViewState3dCreator } from "../../CustomViewState3dCreator";
import { Range3d } from "@szewtwin/core-geometry";

describe("CustomViewState3dCreator", () => {
  let ivault: SnapshotDb;
  after(() => {
    if (ivault && ivault.isOpen)
      ivault.close();
  });
  before(() => {
    const filename = IVaultTestUtils.resolveAssetFile("mirukuru.ibim");
    ivault = SnapshotDb.openFile(filename);
  });
  function setsAreEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
    return set1.size === set2.size && [...set1].every((value) => set2.has(value));
  }

  it("should get correct data from customviewstate3dcreator", async () => {
    const expectedCatIds = new Set<Id64String>().add("0x17");
    const expectedModelIds = new Set<Id64String>().add("0x1c").add("0x28");
    const expectedModelExtents: Range3d = new Range3d(288874.09375, 3803760.75, -0.0005000000237487257, 289160.84375, 3803959.5, 0.0005000000237487257);

    const customViewStateCreator = new CustomViewState3dCreator(ivault);
    const result: CustomViewState3dProps = await customViewStateCreator.getCustomViewState3dData({});
    const catIds = CompressedId64Set.decompressSet(result.categoryIds);
    const modelIds = CompressedId64Set.decompressSet(result.modelIds);
    assert.isTrue(setsAreEqual(expectedCatIds, catIds));
    assert.isTrue(setsAreEqual(expectedModelIds, modelIds));
    assert.isTrue(expectedModelExtents.isAlmostEqual(Range3d.fromJSON(result.modelExtents)));
  });
  it("should get correct data from customviewstate3dcreator when passing specific modelId", async () => {
    const expectedCatIds = new Set<Id64String>().add("0x17");
    const expectedModelIds = new Set<Id64String>().add("0x28");
    const expectedModelExtents: Range3d = new Range3d(1e200, 1e200, 1e200, -1e200, -1e200, -1e200);

    const customViewStateCreator = new CustomViewState3dCreator(ivault);
    const result: CustomViewState3dProps = await customViewStateCreator.getCustomViewState3dData({modelIds: CompressedId64Set.compressArray(["0x28"])});
    const catIds = CompressedId64Set.decompressSet(result.categoryIds);
    const modelIds = CompressedId64Set.decompressSet(result.modelIds);
    assert.isTrue(setsAreEqual(expectedCatIds, catIds));
    assert.isTrue(setsAreEqual(expectedModelIds, modelIds));
    assert.isTrue(expectedModelExtents.isAlmostEqual(Range3d.fromJSON(result.modelExtents)));
  });
});
