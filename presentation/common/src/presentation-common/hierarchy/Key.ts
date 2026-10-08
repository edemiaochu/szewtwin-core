/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Hierarchies
 */

import { assert, Id64String } from "@szewtwin/core-szewec";
import { InstanceKey } from "../DM.js";

/**
 * Standard node types
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export enum StandardNodeTypes {
  DMInstancesNode = "DMInstancesNode",
  DMClassGroupingNode = "DMClassGroupingNode",
  DMPropertyGroupingNode = "DMPropertyGroupingNode",
  DisplayLabelGroupingNode = "DisplayLabelGroupingNode",
}

/**
 * One of the node key types
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export type NodeKey = BaseNodeKey | DMInstancesNodeKey | DMClassGroupingNodeKey | DMPropertyGroupingNodeKey | LabelGroupingNodeKey;
/**
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace NodeKey {
  /** Checks if the supplied key is an [[DMInstancesNodeKey]] */
  export function isInstancesNodeKey(key: NodeKey): key is DMInstancesNodeKey {
    return key.type === StandardNodeTypes.DMInstancesNode;
  }

  /** Checks if the supplied key is an [[DMClassGroupingNodeKey]] */
  export function isClassGroupingNodeKey(key: NodeKey): key is DMClassGroupingNodeKey {
    return key.type === StandardNodeTypes.DMClassGroupingNode;
  }

  /** Checks if the supplied key is an [[DMPropertyGroupingNodeKey]] */
  export function isPropertyGroupingNodeKey(key: NodeKey): key is DMPropertyGroupingNodeKey {
    return key.type === StandardNodeTypes.DMPropertyGroupingNode;
  }

  /** Checks if the supplied key is a [[LabelGroupingNodeKey]] */
  export function isLabelGroupingNodeKey(key: NodeKey): key is LabelGroupingNodeKey {
    return key.type === StandardNodeTypes.DisplayLabelGroupingNode;
  }

  /** Checks if the supplied key is a grouping node key */
  export function isGroupingNodeKey(key: NodeKey): key is GroupingNodeKey {
    return isClassGroupingNodeKey(key) || isPropertyGroupingNodeKey(key) || isLabelGroupingNodeKey(key);
  }

  /**
   * Checks if two given node keys are equal, taking their versions into account.
   *
   * When comparing two keys of the same version, the algorithm uses [[NodeKey.pathFromRoot]] array
   * which is the most accurate way of checking equality. However, when version are different,
   * [[NodeKey.pathFromRoot]] array may contain different strings even though keys represent the same node.
   * In that case equality is checked using other key attributes, depending on the type of the node (type,
   * label, grouping class, property name, etc.).
   */
  export function equals(lhs: NodeKey, rhs: NodeKey): boolean {
    // types must always be equal
    if (lhs.type !== rhs.type) {
      return false;
    }

    // `pathFromRoot` lengths must always be equal
    if (lhs.pathFromRoot.length !== rhs.pathFromRoot.length) {
      return false;
    }

    // when versions are equal, compare using contents of `pathFromRoot` array
    if (lhs.version === rhs.version) {
      for (let i = 0; i < lhs.pathFromRoot.length; ++i) {
        if (lhs.pathFromRoot[i] !== rhs.pathFromRoot[i]) {
          return false;
        }
      }
      return true;
    }

    // when versions aren't equal, compare using other key information, because key hashes
    // of different key versions can't be compared
    if (isInstancesNodeKey(lhs)) {
      assert(isInstancesNodeKey(rhs));
      if (lhs.instanceKeys.length !== rhs.instanceKeys.length) {
        return false;
      }
      for (let i = 0; i < lhs.instanceKeys.length; ++i) {
        if (0 !== InstanceKey.compare(lhs.instanceKeys[i], rhs.instanceKeys[i])) {
          return false;
        }
      }
      return true;
    }
    if (isClassGroupingNodeKey(lhs)) {
      assert(isClassGroupingNodeKey(rhs));
      return lhs.className === rhs.className;
    }
    if (isPropertyGroupingNodeKey(lhs)) {
      assert(isPropertyGroupingNodeKey(rhs));
      return lhs.className === rhs.className && lhs.propertyName === rhs.propertyName;
    }
    if (isLabelGroupingNodeKey(lhs)) {
      assert(isLabelGroupingNodeKey(rhs));
      return lhs.label === rhs.label;
    }
    return true;
  }
}

/**
 * Node key path. Can be used to define path from one node to another.
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export type NodeKeyPath = NodeKey[];

/**
 * Data structure that describes a basic node key
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface BaseNodeKey {
  /** Node type */
  type: string;

  /**
   * Version of the key. Different versions suggest that node keys were created by two different
   * versions of the library. In that case, keys representing the same node may be different.
   */
  version: number;

  /** Node hash path from root to the node whose key this is */
  pathFromRoot: string[];

  /** Query that returns all selected instance keys */
  instanceKeysSelectQuery?: PresentationQuery;
}

/**
 * Data structure that describes a node DMInstance node key
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface DMInstancesNodeKey extends BaseNodeKey {
  type: StandardNodeTypes.DMInstancesNode;
  /** List of [[InstanceKey]] objects of DMInstances represented by the node */
  instanceKeys: InstanceKey[];
}

/**
 * Data structure that describes a grouping node key
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface GroupingNodeKey extends BaseNodeKey {
  /**
   * Get the number of instances grouped by the node represented
   * by this key.
   *
   * **Note:** this property is just a helper and is not involved
   * in identifying a node.
   */
  groupedInstancesCount: number;
}

/**
 * Data structure that describes an DMClass grouping node key
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface DMClassGroupingNodeKey extends GroupingNodeKey {
  type: StandardNodeTypes.DMClassGroupingNode;
  /** Full name of the grouping DMClass */
  className: string;
}

/**
 * Data structure that describes an DMProperty grouping node key
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface DMPropertyGroupingNodeKey extends GroupingNodeKey {
  type: StandardNodeTypes.DMPropertyGroupingNode;
  /** Full name of the grouping DMProperty class */
  className: string;
  /** Name of the DMProperty */
  propertyName: string;
  /** Raw grouping values */
  groupingValues: any[];
}

/**
 * Data structure that describes a display label grouping node key
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface LabelGroupingNodeKey extends GroupingNodeKey {
  type: StandardNodeTypes.DisplayLabelGroupingNode;
  /** Grouping display label */
  label: string;
}

/**
 * Data structure that describes a presentation query
 * @public
 */
export interface PresentationQuery {
  /** DMSQL query */
  query: string;
  /** The query bindings */
  bindings?: PresentationQueryBinding[];
}

/**
 * Defines an [[Id64String]] value binding.
 * @public
 */
export interface IdBinding {
  type: "Id";
  value: Id64String;
}

/**
 * Defines an [[IdSet]] value binding for use with `InVirtualSet` DMSQL function.
 * @public
 */
export interface IdSetBinding {
  type: "IdSet";
  value: Id64String[];
}

/**
 * Defines an DM value binding.
 * @public
 */
export interface DMValueBinding {
  type: "DMValue";
  valueType: string;
  valueTypeExtended?: string;
  value: any;
}

/**
 * Defines a binding for a list of DM values for use with `InVirtualSet` DMSQL function.
 * @public
 */
export interface DMValueSetBinding {
  type: "ValueSet";
  valueType: string;
  valueTypeExtended?: string;
  value: any[];
}

/**
 * One of the [[PresentationQuery]] binding types.
 * @public
 */
export type PresentationQueryBinding = IdBinding | IdSetBinding | DMValueBinding | DMValueSetBinding;
