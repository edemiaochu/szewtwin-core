/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module PresentationRules
 */

import { SingleSchemaClassSpecification } from "../ClassSpecifications.js";
import { ChildNodeSpecificationBase, DefaultGroupingPropertiesContainer } from "./ChildNodeSpecification.js";

/**
 * Returns nodes for instances returned by a provided DMSQL query.
 *
 * @see [Custom query instance nodes specification reference documentation page]($docs/presentation/hierarchies/CustomQueryInstanceNodes.md)
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface CustomQueryInstanceNodesSpecification extends ChildNodeSpecificationBase, DefaultGroupingPropertiesContainer {
  /** Used for serializing to JSON. */
  specType: "CustomQueryInstanceNodes";

  /**
   * Specifications of queries used to create the content. Query specifications define the actual
   * results of the specification.
   */
  queries?: QuerySpecification[];
}

/**
 * Query specifications used in [[CustomQueryInstanceNodesSpecification]].
 *
 * @see [Custom query specifications reference documentation section]($docs/presentation/hierarchies/CustomQueryInstanceNodes.md#attribute-queries)
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export declare type QuerySpecification = StringQuerySpecification | DMPropertyValueQuerySpecification;

/**
 * Used for serializing array of [[QuerySpecification]] to JSON.
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export enum QuerySpecificationTypes {
  String = "String",
  DMPropertyValue = "DMPropertyValue",
}

/**
 * Base interface for all [[QuerySpecification]] implementations.
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface QuerySpecificationBase {
  /**
   * Used for serializing to JSON.
   * @see QuerySpecificationTypes
   */
  specType: `${QuerySpecificationTypes}`;

  /**
   * Specification of DMClass whose instances the query returns. The specification may also point to a
   * base class of instances returned by the query. If the query returns instances that are not of this
   * class, they aren't included in the result set.
   */
  class: SingleSchemaClassSpecification;
}

/**
 * The specification contains an DMSQL query which is used to query for instances.
 *
 * @see [String query specification reference documentation section]($docs/presentation/hierarchies/CustomQueryInstanceNodes.md#string-query-specification)
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface StringQuerySpecification extends QuerySpecificationBase {
  /** Used for serializing to JSON. */
  specType: "String";

  /** Specifies the search DMSQL query. */
  query: string;
}

/**
 * The specification specifies the name of the parent node instance property whose value is the DMSQL
 * used to query for instances.
 *
 * @see [DMProperty value query specification reference documentation section]($docs/presentation/hierarchies/CustomQueryInstanceNodes.md#dmproperty-value-query-specification)
 * @public
 * @deprecated in 5.2 - will not be removed until after 2026-10-01. Use the new [@szewtwin/presentation-hierarchies](https://github.com/szewTwin/presentation/blob/master/packages/hierarchies/README.md)
 * package for creating hierarchies.
 */
export interface DMPropertyValueQuerySpecification extends QuerySpecificationBase {
  /** Used for serializing to JSON. */
  specType: "DMPropertyValue";

  /**
   * Specifies name of the parent instance property whose value contains the DMSQL query.
   */
  parentPropertyName: string;
}
