/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import { NodeKey, StandardNodeTypes } from "../../presentation-common/hierarchy/Key.js";
import {
  createTestDMClassGroupingNodeKey,
  createTestDMInstanceKey,
  createTestDMInstancesNodeKey,
  createTestDMPropertyGroupingNodeKey,
  createTestLabelGroupingNodeKey,
  createTestNodeKey,
} from "../_helpers/index.js";

describe("NodeKey", () => {
  describe("isInstancesNodeKey", () => {
    it("returns correct results for different types of nodes", () => {
      expect(NodeKey.isInstancesNodeKey(createTestNodeKey())).to.be.false;
      expect(NodeKey.isInstancesNodeKey(createTestDMInstancesNodeKey())).to.be.true;
      expect(NodeKey.isInstancesNodeKey(createTestDMClassGroupingNodeKey())).to.be.false;
      expect(NodeKey.isInstancesNodeKey(createTestDMPropertyGroupingNodeKey())).to.be.false;
      expect(NodeKey.isInstancesNodeKey(createTestLabelGroupingNodeKey())).to.be.false;
    });
  });

  describe("isClassGroupingNodeKey", () => {
    it("returns correct results for different types of nodes", () => {
      expect(NodeKey.isClassGroupingNodeKey(createTestNodeKey())).to.be.false;
      expect(NodeKey.isClassGroupingNodeKey(createTestDMInstancesNodeKey())).to.be.false;
      expect(NodeKey.isClassGroupingNodeKey(createTestDMClassGroupingNodeKey())).to.be.true;
      expect(NodeKey.isClassGroupingNodeKey(createTestDMPropertyGroupingNodeKey())).to.be.false;
      expect(NodeKey.isClassGroupingNodeKey(createTestLabelGroupingNodeKey())).to.be.false;
    });
  });

  describe("isPropertyGroupingNodeKey", () => {
    it("returns correct results for different types of nodes", () => {
      expect(NodeKey.isPropertyGroupingNodeKey(createTestNodeKey())).to.be.false;
      expect(NodeKey.isPropertyGroupingNodeKey(createTestDMInstancesNodeKey())).to.be.false;
      expect(NodeKey.isPropertyGroupingNodeKey(createTestDMClassGroupingNodeKey())).to.be.false;
      expect(NodeKey.isPropertyGroupingNodeKey(createTestDMPropertyGroupingNodeKey())).to.be.true;
      expect(NodeKey.isPropertyGroupingNodeKey(createTestLabelGroupingNodeKey())).to.be.false;
    });
  });

  describe("isLabelGroupingNodeKey", () => {
    it("returns correct results for different types of nodes", () => {
      expect(NodeKey.isLabelGroupingNodeKey(createTestNodeKey())).to.be.false;
      expect(NodeKey.isLabelGroupingNodeKey(createTestDMInstancesNodeKey())).to.be.false;
      expect(NodeKey.isLabelGroupingNodeKey(createTestDMClassGroupingNodeKey())).to.be.false;
      expect(NodeKey.isLabelGroupingNodeKey(createTestDMPropertyGroupingNodeKey())).to.be.false;
      expect(NodeKey.isLabelGroupingNodeKey(createTestLabelGroupingNodeKey())).to.be.true;
    });
  });

  describe("isGroupingNodeKey", () => {
    it("returns correct results for different types of nodes", () => {
      expect(NodeKey.isGroupingNodeKey(createTestNodeKey())).to.be.false;
      expect(NodeKey.isGroupingNodeKey(createTestDMInstancesNodeKey())).to.be.false;
      expect(NodeKey.isGroupingNodeKey(createTestDMClassGroupingNodeKey())).to.be.true;
      expect(NodeKey.isGroupingNodeKey(createTestDMPropertyGroupingNodeKey())).to.be.true;
      expect(NodeKey.isGroupingNodeKey(createTestLabelGroupingNodeKey())).to.be.true;
    });
  });

  describe("equals", () => {
    it("returns `false` when types are different", () => {
      const lhs = createTestNodeKey({ type: "a" });
      const rhs = createTestNodeKey({ type: "b" });
      expect(NodeKey.equals(lhs, rhs)).to.be.false;
    });

    it("returns `false` when `pathFromRoot` lengths are different", () => {
      const lhs = createTestNodeKey({ pathFromRoot: ["a", "b"] });
      const rhs = createTestNodeKey({ pathFromRoot: ["a", "b", "c"] });
      expect(NodeKey.equals(lhs, rhs)).to.be.false;
    });

    describe("when versions are equal", () => {
      it("returns `false` when `pathFromRoot` contents are different", () => {
        const lhs = createTestNodeKey({ version: 999, pathFromRoot: ["a", "b"] });
        const rhs = createTestNodeKey({ version: 999, pathFromRoot: ["a", "c"] });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `true` when `pathFromRoot` contents are similar", () => {
        const lhs = createTestNodeKey({ version: 999, pathFromRoot: ["a", "b"] });
        const rhs = createTestNodeKey({ version: 999, pathFromRoot: ["a", "b"] });
        expect(NodeKey.equals(lhs, rhs)).to.be.true;
      });
    });

    describe("when versions are different", () => {
      it("returns `false` when instance key counts are different for instance node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMInstancesNode,
          instanceKeys: [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })],
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMInstancesNode,
          instanceKeys: [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" }), createTestDMInstanceKey({ id: "0x3" })],
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `false` when instance keys are different for instance node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMInstancesNode,
          instanceKeys: [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })],
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMInstancesNode,
          instanceKeys: [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x3" })],
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `true` when instance keys are similar for instance node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMInstancesNode,
          instanceKeys: [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })],
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMInstancesNode,
          instanceKeys: [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })],
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.true;
      });

      it("returns `false` when class names are different for class grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMClassGroupingNode,
          className: "a",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMClassGroupingNode,
          className: "b",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `true` when class names are similar for class grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMClassGroupingNode,
          className: "a",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMClassGroupingNode,
          className: "a",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.true;
      });

      it("returns `false` when class names are different for property grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMPropertyGroupingNode,
          className: "a",
          propertyName: "p",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMPropertyGroupingNode,
          className: "b",
          propertyName: "p",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `false` when property names are different for property grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMPropertyGroupingNode,
          className: "a",
          propertyName: "p1",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMPropertyGroupingNode,
          className: "a",
          propertyName: "p2",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `true` when class and property names are similar for property grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DMPropertyGroupingNode,
          className: "a",
          propertyName: "p",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DMPropertyGroupingNode,
          className: "a",
          propertyName: "p",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.true;
      });

      it("returns `false` when labels are different for label grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DisplayLabelGroupingNode,
          label: "a",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DisplayLabelGroupingNode,
          label: "b",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.false;
      });

      it("returns `true` when labels are similar for label grouping node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
          type: StandardNodeTypes.DisplayLabelGroupingNode,
          label: "a",
        });
        const rhs = createTestNodeKey({
          version: 2,
          type: StandardNodeTypes.DisplayLabelGroupingNode,
          label: "a",
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.true;
      });

      it("returns `true` when types and `pathFromRoot` lengths are equal for base node keys", () => {
        const lhs = createTestNodeKey({
          version: 1,
        });
        const rhs = createTestNodeKey({
          version: 2,
        });
        expect(NodeKey.equals(lhs, rhs)).to.be.true;
      });
    });
  });
});
