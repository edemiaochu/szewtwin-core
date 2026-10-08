/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Validation
 */

import { AnyClass, AnyDMType, AnyProperty, Constant, CustomAttribute, CustomAttributeClass,
  CustomAttributeContainerProps, EntityClass, Enumeration, Format, InvertedUnit, KindOfQuantity, Mixin, Phenomenon,
  PropertyCategory, RelationshipClass, RelationshipConstraint, Schema, SchemaItem, StructClass, Unit,
  UnitSystem } from "@szewtwin/dmschema-metadata";
import { BaseDiagnostic } from "./Diagnostic";

/**
 * Interface used for all rule implementations used during schema validation.
 * @beta
 */
export type IRule<T extends AnyDMType, U = object> = (dmDefinition: T, ...args: U[]) => AsyncIterable<BaseDiagnostic<T, any[]>>;

/** @beta */
export type BaseRule<T extends AnyDMType, U extends AnyDMType> = IRule<T, U>;

/**
 * Interface used to represent logical collection of [IRule]($dmschema-editing) instances.
 * @beta
 */
export interface IRuleSet {
  /** The name of the rule set. */
  name: string;

  /** A collection of schema names that should be excluded from adhering to the rules defined in this rule set. */
  schemaExclusionSet?: string[];

  /** The rules that apply to [Schema]($dmschema-metadata) objects. */
  schemaRules?: Array<IRule<Schema>>;
  /** The rules that apply to [SchemaItem]($dmschema-metadata) objects. */
  schemaItemRules?: Array<IRule<SchemaItem>>;
  /** The rules that apply to [DMClass]($dmschema-metadata) objects. */
  classRules?: Array<IRule<AnyClass>>;
  /** The rules that apply to [Property]($dmschema-metadata) objects. */
  propertyRules?: Array<IRule<AnyProperty>>;
  /** The rules that apply to [EntityClass]($dmschema-metadata) objects. */
  entityClassRules?: Array<IRule<EntityClass>>;
  /** The rules that apply to [StructClass]($dmschema-metadata) objects. */
  structClassRules?: Array<IRule<StructClass>>;
  /** The rules that apply to [Mixin]($dmschema-metadata) objects. */
  mixinRules?: Array<IRule<Mixin>>;
  /** The rules that apply to [RelationshipClass]($dmschema-metadata) objects. */
  relationshipRules?: Array<IRule<RelationshipClass>>;
  /** The rules that apply to [RelationshipConstraint]($dmschema-metadata) objects. */
  relationshipConstraintRules?: Array<IRule<RelationshipConstraint>>;
  /** The rules that apply to [CustomAttributeClass]($dmschema-metadata) objects. */
  customAttributeClassRules?: Array<IRule<CustomAttributeClass>>;
  /** The rules that apply to [CustomAttributeContainerProps]($dmschema-metadata) objects. */
  customAttributeContainerRules?: Array<IRule<CustomAttributeContainerProps>>;
  /** The rules that apply to [CustomAttribute]($dmschema-metadata) objects. */
  customAttributeInstanceRules?: Array<BaseRule<CustomAttributeContainerProps, CustomAttribute>>;
  /** The rules that apply to [Enumeration]($dmschema-metadata) objects. */
  enumerationRules?: Array<IRule<Enumeration>>;
  /** The rules that apply to [KindOfQuantity]($dmschema-metadata) objects. */
  kindOfQuantityRules?: Array<IRule<KindOfQuantity>>;
  /** The rules that apply to [PropertyCategory]($dmschema-metadata) objects. */
  propertyCategoryRules?: Array<IRule<PropertyCategory>>;
  /** The rules that apply to [Format]($dmschema-metadata) objects. */
  formatRules?: Array<IRule<Format>>;
  /** The rules that apply to [Unit]($dmschema-metadata) objects. */
  unitRules?: Array<IRule<Unit>>;
  /** The rules that apply to [InvertedUnit]($dmschema-metadata) objects. */
  invertedUnitRules?: Array<IRule<InvertedUnit>>;
  /** The rules that apply to [UnitSystem]($dmschema-metadata) objects. */
  unitSystemRules?: Array<IRule<UnitSystem>>;
  /** The rules that apply to [Phenomenon]($dmschema-metadata) objects. */
  phenomenonRules?: Array<IRule<Phenomenon>>;
  /** The rules that apply to [Constant]($dmschema-metadata) objects. */
  constantRules?: Array<IRule<Constant>>;
}
