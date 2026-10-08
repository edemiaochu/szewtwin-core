/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import * as dm from "../../presentation-common/DM.js";

/**
 * @internal Used for testing only.
 */
export const createTestDMInstanceKey = (props?: Partial<dm.InstanceKey>) => ({
  className: "SchemaName:ClassName",
  id: "0x1",
  ...props,
});

/**
 * @internal Used for testing only.
 */
export const createTestDMClassInfo = (props?: Partial<dm.ClassInfo>) => ({
  id: "0x1",
  name: "SchemaName:ClassName",
  label: "Class Label",
  ...props,
});

/**
 * @internal Used for testing only.
 */
export const createTestRelatedClassInfo = (props?: Partial<dm.RelatedClassInfo>) => ({
  sourceClassInfo: createTestDMClassInfo({ id: "0x1", name: "source:class", label: "Source" }),
  targetClassInfo: createTestDMClassInfo({ id: "0x2", name: "target:class", label: "Target" }),
  isPolymorphicTargetClass: false,
  relationshipInfo: createTestDMClassInfo({ id: "0x3", name: "relationship:class", label: "Relationship" }),
  isForwardRelationship: false,
  isPolymorphicRelationship: false,
  ...props,
});

/**
 * @internal Used for testing only.
 */
export const createTestRelatedClassInfoWithOptionalRelationship = (props?: Partial<dm.RelatedClassInfoWithOptionalRelationship>) => ({
  sourceClassInfo: createTestDMClassInfo({ id: "0x1", name: "source:class", label: "Source" }),
  targetClassInfo: createTestDMClassInfo({ id: "0x2", name: "target:class", label: "Target" }),
  isPolymorphicTargetClass: false,
  ...props,
});

/**
 * @internal Used for testing only.
 */
export const createTestRelationshipPath = (length: number = 2) => {
  const path = new Array<dm.RelatedClassInfo>();
  while (length--) {
    path.push(createTestRelatedClassInfo());
  }
  return path;
};

/**
 * @internal Used for testing only.
 */
export const createTestPropertyInfo = (props?: Partial<dm.PropertyInfo>) => ({
  classInfo: createTestDMClassInfo(),
  name: "PropertyName",
  type: "string",
  ...props,
});
