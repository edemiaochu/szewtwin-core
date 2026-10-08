/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module PresentationRules
 */

import { MultiSchemaClassesSpecification } from "../ClassSpecifications.js";
import { ChildNodeSpecificationBase, DefaultGroupingPropertiesContainer } from "./ChildNodeSpecification.js";

/**
 * Returns nodes for instances of specific DMClasses.
 *
 * @see [Instance nodes of specific classes specification reference documentation page]($docs/presentation/hierarchies/InstanceNodesOfSpecificClasses.md)
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface InstanceNodesOfSpecificClassesSpecification extends ChildNodeSpecificationBase, DefaultGroupingPropertiesContainer {
  /** Used for serializing to JSON. */
  specType: "InstanceNodesOfSpecificClasses";

  /**
   * Defines a set of [multi schema classes]($docs/presentation/MultiSchemaClassesSpecification.md) that
   * specify which DMClasses need to be selected to form the result.
   */
  classes: MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[];

  /**
   * Defines a set of [multi schema classes]($docs/presentation/MultiSchemaClassesSpecification.md) that
   * prevents specified DMClasses and subclasses from being selected by [[classes]] attribute.
   */
  excludedClasses?: MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[];

  /**
   * Specifies an [DMExpression]($docs/presentation/hierarchies/DMExpressions.md#instance-filter) for filtering
   * instances of DMClasses specified through the [[classes]] attribute.
   */
  instanceFilter?: string;
}
