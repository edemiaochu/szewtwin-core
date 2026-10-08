/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { getInstancesCount, KeySet } from "../presentation-common.js";
import { createTestDMClassGroupingNodeKey, createTestDMInstanceKey, createTestDMInstancesNodeKey, createTestNodeKey } from "./_helpers/index.js";

describe("getInstancesCount", () => {
  it("calculates correct count with instance keys, instance node keys and grouping node keys", () => {
    const keys = new KeySet([
      createTestDMInstanceKey(), // 1
      createTestDMInstancesNodeKey({ instanceKeys: [createTestDMInstanceKey(), createTestDMInstanceKey()] }), // 2
      createTestDMClassGroupingNodeKey({ groupedInstancesCount: 5 }), // 5
      createTestNodeKey(),
    ]);
    expect(getInstancesCount(keys)).to.eq(8);
  });
});
