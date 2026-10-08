/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import { createTestDMInstanceKey, createTestDMInstancesNodeKey, createTestNodeKey } from "@szewtwin/presentation-common/test-utils";
import { SelectionHelper } from "../../presentation-frontend.js";

describe("SelectionHelper", () => {
  describe("getKeysForSelection", () => {
    it("returns all DMInstance keys when DMInstances node key is provided", () => {
      const nodeKey = createTestDMInstancesNodeKey();
      const selectionKeys = SelectionHelper.getKeysForSelection([nodeKey]);
      expect(selectionKeys.length).to.eq(nodeKey.instanceKeys.length);
      expect(selectionKeys).to.deep.eq(nodeKey.instanceKeys);
    });

    it("returns node key when non-DMInstance node key is provided", () => {
      const nodeKey = createTestNodeKey();
      const selectionKeys = SelectionHelper.getKeysForSelection([nodeKey]);
      expect(selectionKeys.length).to.eq(1);
      expect(selectionKeys[0]).to.deep.eq(nodeKey);
    });

    it("returns key when DMInstance key is provided", () => {
      const key = createTestDMInstanceKey();
      const selectionKeys = SelectionHelper.getKeysForSelection([key]);
      expect(selectionKeys.length).to.eq(1);
      expect(selectionKeys[0]).to.deep.eq(key);
    });
  });
});
