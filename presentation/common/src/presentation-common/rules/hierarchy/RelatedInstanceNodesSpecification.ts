/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module PresentationRules
 */

import { RepeatableRelationshipPathSpecification } from "../RelationshipPathSpecification.js";
import { ChildNodeSpecificationBase, DefaultGroupingPropertiesContainer } from "./ChildNodeSpecification.js";

/**
 * Produces DMInstance nodes that are related to some source DMInstance. The source instance is determined
 * by traversing the hierarchy upwards until an DMInstance node is encountered.
 *
 * @see [Related instance nodes specification reference documentation page]($docs/presentation/hierarchies/RelatedInstanceNodes.md)
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface RelatedInstanceNodesSpecification extends ChildNodeSpecificationBase, DefaultGroupingPropertiesContainer {
  /** Used for serializing to JSON. */
  specType: "RelatedInstanceNodes";

  /**
   * Specifies a chain of [relationship path specifications]($docs/presentation/RepeatableRelationshipPathSpecification.md)
   * that forms a path from a source instance to the output instances. When this array is empty, the specification produces
   * no results.
   */
  relationshipPaths: RepeatableRelationshipPathSpecification[];

  /**
   * Specifies an [DMExpression]($docs/presentation/hierarchies/DMExpressions.md#instance-filter) for filtering
   * instances of DMClasses targeted through the [[relationshipPaths]] attribute.
   */
  instanceFilter?: string;
}
