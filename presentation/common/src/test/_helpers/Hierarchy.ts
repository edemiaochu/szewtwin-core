/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import {
  DMClassGroupingNodeKey,
  DMInstancesNodeKey,
  DMPropertyGroupingNodeKey,
  LabelDefinition,
  LabelGroupingNodeKey,
  Node,
  NodeKey,
  NodePathElement,
  StandardNodeTypes,
} from "../../presentation-common.js";
import { createTestLabelDefinition } from "./Content.js";
import { createTestDMInstanceKey } from "./DM.js";

/** @internal Used for testing only. */
export const createTestNodeKey = (props?: Partial<NodeKey>) => ({
  type: "test-node",
  version: 0,
  pathFromRoot: [],
  ...props,
});

export const createTestDMInstancesNodeKey = (props?: Partial<DMInstancesNodeKey>): DMInstancesNodeKey => ({
  ...createTestNodeKey(),
  type: StandardNodeTypes.DMInstancesNode,
  instanceKeys: [createTestDMInstanceKey()],
  ...props,
});

/** @internal Used for testing only. */
export const createTestDMClassGroupingNodeKey = (props?: Partial<DMClassGroupingNodeKey>): DMClassGroupingNodeKey => ({
  ...createTestNodeKey(),
  type: StandardNodeTypes.DMClassGroupingNode,
  className: "SchemaName:ClassName",
  groupedInstancesCount: 1,
  ...props,
});

/** @internal Used for testing only. */
export const createTestDMPropertyGroupingNodeKey = (props?: Partial<DMPropertyGroupingNodeKey>): DMPropertyGroupingNodeKey => ({
  ...createTestNodeKey(),
  type: StandardNodeTypes.DMPropertyGroupingNode,
  className: "SchemaName:ClassName",
  propertyName: "PropertyName",
  groupingValues: [123],
  groupedInstancesCount: 1,
  ...props,
});

/** @internal Used for testing only. */
export const createTestLabelGroupingNodeKey = (props?: Partial<LabelGroupingNodeKey>): LabelGroupingNodeKey => ({
  ...createTestNodeKey(),
  type: StandardNodeTypes.DisplayLabelGroupingNode,
  label: "Test label",
  groupedInstancesCount: 1,
  ...props,
});

/** @internal Used for testing only. */
export const createTestDMInstancesNode = (props?: Partial<Node & { key: DMInstancesNodeKey }>): Node & { key: DMInstancesNodeKey } => ({
  key: createTestDMInstancesNodeKey(props?.key),
  label: createTestLabelDefinition(),
  ...props,
});

/** @internal Used for testing only. */
export const createTestNode = (props?: Partial<Node>): Node => ({
  key: createTestNodeKey(),
  label: LabelDefinition.fromLabelString("test label"),
  ...props,
});

/** @internal Used for testing only. */
export const createTestNodePathElement = (props?: Partial<NodePathElement>): NodePathElement => ({
  node: createTestNode(),
  index: 0,
  children: [],
  ...props,
});
