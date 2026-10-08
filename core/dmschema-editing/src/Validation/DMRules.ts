/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Validation
 */

import {
  AnyClass, AnyProperty, CustomAttribute, CustomAttributeContainerProps, DMClass, DMClassModifier,
  DMStringConstants, EntityClass, Enumeration, Mixin, PrimitiveType, primitiveTypeToString,
  Property, RelationshipClass, RelationshipConstraint, RelationshipMultiplicity, Schema, SchemaGraph, SchemaItemType,
  StrengthDirection, strengthDirectionToString,
} from "@szewtwin/dmschema-metadata";
import {
  ClassDiagnostic, createClassDiagnosticClass, createCustomAttributeContainerDiagnosticClass, createPropertyDiagnosticClass,
  createRelationshipConstraintDiagnosticClass, createSchemaDiagnosticClass, createSchemaItemDiagnosticClass, CustomAttributeContainerDiagnostic,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DiagnosticType, PropertyDiagnostic, RelationshipConstraintDiagnostic, SchemaDiagnostic, SchemaItemDiagnostic,
} from "./Diagnostic";
import { IRuleSet } from "./Rules";

const ruleSetName = "DMObjects";

function getCode(code: number): string {
  return `${ruleSetName}-${code}`;
}

/**
 * The unique diagnostic codes for DMObjects rules.
 *
 * To provide meaning to code values, with anticipation
 * of future rules for all current DM Types, the following
 * value ranges should be used:
 *
 * - Schema:                    000-099
 * - Class:                     100-199
 * - Constant:                  200-299
 * - CustomAttribute            300-399
 * - CustomAttributeClass:      400-499
 * - CustomAttributeContainer:  500-599
 * - EntityClass:               600-699
 * - Enumeration:               700-799
 * - Format:                    800-899
 * - InvertedUnit:              900-999
 * - KindOfQuantity:            1000-1099
 * - Mixin:                     1100-1199
 * - Phenomenon:                1200-1299
 * - Property:                  1300-1399
 * - PropertyCategory:          1400-1499
 * - RelationshipClass:         1500-1599
 * - RelationshipConstraint:    1600-1699
 * - StructClass:               1700-1799
 * - Unit:                      1800-1899
 * - UnitSystem:                1900-1999
 * @beta
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const DiagnosticCodes = {
  // Class Rule Codes (100-199)
  BaseClassIsSealed: getCode(100),
  BaseClassOfDifferentType: getCode(101),
  // DM-102 has been deprecated. Leaving the code here to prevent re-use.
  AbstractClassWithNonAbstractBase: getCode(102),

  // CA Container Rule Codes (500-599)
  CustomAttributeNotOfConcreteClass: getCode(500),
  CustomAttributeSchemaMustBeReferenced: getCode(501),
  CustomAttributeClassNotFound: getCode(502),

  // Enumeration Rule Codes (700-799)
  EnumerationTypeUnsupported: getCode(700),

  // Mixin Rule Codes (1100-1199)
  MixinAppliedToClassMustDeriveFromConstraint: getCode(1100),

  // Property Rule Codes (1300-1399)
  IncompatibleValueTypePropertyOverride: getCode(1300),
  IncompatibleTypePropertyOverride: getCode(1301),
  IncompatibleUnitPropertyOverride: getCode(1302),

  // Relationship Rule Codes (1500-1599)
  AbstractConstraintMustNarrowBaseConstraints: getCode(1500),
  DerivedConstraintsMustNarrowBaseConstraints: getCode(1501),
  ConstraintClassesDeriveFromAbstractConstraint: getCode(1502),

  // Relationship Constraint Rule Codes (1600-1699)
  AtLeastOneConstraintClassDefined: getCode(1600),
  AbstractConstraintMustExistWithMultipleConstraints: getCode(1601),
};

/**
 * The list of [[IDiagnostic]] implementation classes used by the DM rule implementations.
 * @beta
 */
export const Diagnostics = {
  /** DM-001: Required message parameters: schema name, referenced schema name */
  SupplementalSchemasCannotBeReferenced: createSchemaDiagnosticClass<[string, string]>(getCode(1),
    "Referenced schema '{1}' of schema '{0}' is a supplemental schema. Supplemental schemas are not allowed to be referenced."),

  /** DM-002: Required message parameters: schema name, reference schema alias, first schema reference name, second schema reference name. */
  SchemaRefAliasMustBeUnique: createSchemaDiagnosticClass<[string, string, string, string]>(getCode(2),
    "Schema '{0}' has multiple schema references ({2}, {3}) with the same alias '{1}', which is not allowed."),

  /** DM-003: Required message parameters: schema name, cycle text */
  ReferenceCyclesNotAllowed: createSchemaDiagnosticClass<[string, string]>(getCode(3),
    "Schema '{0}' has reference cycles: {1}"),

  /** DM-100: Required message parameters: childClass.FullName, baseClass.FullName */
  BaseClassIsSealed: createClassDiagnosticClass<[string, string]>(DiagnosticCodes.BaseClassIsSealed,
    "Class '{0}' cannot derive from sealed base class '{1}'."),

  /** DM-101: Required message parameters: childClass.FullName, baseClass.FullName, baseClass.schemaItemType */
  BaseClassIsOfDifferentType: createClassDiagnosticClass<[string, string, string]>(DiagnosticCodes.BaseClassOfDifferentType,
    "Class '{0}' cannot derive from base class '{1}' of type '{2}'."),

  /** **DEPRECATED** DM-102: Required message parameters: childClass.FullName, baseClass.FullName */
  AbstractClassWithNonAbstractBase: createClassDiagnosticClass<[string, string]>(DiagnosticCodes.AbstractClassWithNonAbstractBase,
    "Abstract Class '{0}' cannot derive from base class '{1}' because it is not an abstract class."),

  /** DM-500: Required message parameters: CustomAttribute container name and CustomAttributeClass name. */
  CustomAttributeNotOfConcreteClass: createCustomAttributeContainerDiagnosticClass<[string, string]>(DiagnosticCodes.CustomAttributeNotOfConcreteClass,
    "The CustomAttribute container '{0}' has a CustomAttribute with the class '{1}' which is not a concrete class."),

  /** DM-501: Required message parameters: CustomAttribute container name, CustomAttributeClass name, CustomAttributeClass Schema name. */
  CustomAttributeSchemaMustBeReferenced: createCustomAttributeContainerDiagnosticClass<[string, string]>(DiagnosticCodes.CustomAttributeSchemaMustBeReferenced,
    "The CustomAttribute container '{0}' has a CustomAttribute with the class '{1}' whose schema is not referenced by the container's Schema."),

  /** DM-502: Required message parameters: CustomAttribute container name and CustomAttributeClass name. */
  CustomAttributeClassNotFound: createCustomAttributeContainerDiagnosticClass<[string, string]>(DiagnosticCodes.CustomAttributeClassNotFound,
    "The CustomAttribute container '{0}' has a CustomAttribute with the class '{1}' which cannot be found."),

  /** DM-700: Required message parameters: Enumeration name */
  EnumerationTypeUnsupported: createSchemaItemDiagnosticClass<Enumeration, [string]>(DiagnosticCodes.EnumerationTypeUnsupported,
    "Enumeration '{0}' has invalid primitive type."),

  /** DM-1100: Required message parameters: mixin class fullName, class fullName, applies to constraint class fullName */
  MixinAppliedToClassMustDeriveFromConstraint: createSchemaItemDiagnosticClass<EntityClass, [string, string, string]>(DiagnosticCodes.MixinAppliedToClassMustDeriveFromConstraint,
    "Mixin '{0}' cannot be applied to the class '{1}' because it does not satisfy the applies to constraint '{2}'."),

  /** DM-1300: Required message parameters: childClass.FullName, property name, baseClass.FullName, base value type, child value type */
  IncompatibleValueTypePropertyOverride: createPropertyDiagnosticClass<[string, string, string, string, string]>(DiagnosticCodes.IncompatibleValueTypePropertyOverride,
    "The DMProperty '{0}.{1}' has a base property '{2}.{1}' with a value type of {3} which is incompatible with the value type of {4}."),

  /** DM-1301: Required message parameters: childClass.FullName, property name, baseClass.FullName, base property type, child property type */
  IncompatibleTypePropertyOverride: createPropertyDiagnosticClass<[string, string, string, string, string]>(DiagnosticCodes.IncompatibleTypePropertyOverride,
    "The DMProperty '{0}.{1}' has a base property '{2}.{1}' with a type of {3} which is incompatible with the type of {4}."),

  /** DM-1302: Required message parameters: childClass.Name, property name, baseClass.Name, baseClass Koq name, baseClass Koq persistence unit name, child class Koq persistence unit name, child class Koq name */
  IncompatibleUnitPropertyOverride: createPropertyDiagnosticClass<[string, string, string, string, string, string, string]>(DiagnosticCodes.IncompatibleUnitPropertyOverride,
    "The DMProperty '{0}.{1}' has a base property '{2}.{1}' with KindOfQuantity '{3}' with persistence unit '{4}' which is not the same as the persistence unit '{5}' of the provided KindOfQuantity '{6}'."),

  /** DM-1303: Required message parameters: property.fullName, navigation relationship.fullName */
  NavigationRelationshipMustBeRoot: createPropertyDiagnosticClass<[string, string]>(getCode(1303),
    "The referenced relationship '{1}', used in NavigationProperty '{0}' is not the root relationship."),

  /** DM-1304: Required message parameters: property.fullName, navigation relationship.fullName */
  NavigationTargetMustHaveSingularMultiplicity: createPropertyDiagnosticClass<[string, string, string]>(getCode(1304),
    "NavigationProperty '{0}' uses the relationship '{1}' that cannot be traversed in the '{2}' direction due to a max multiplicity greater than 1."),

  /** DM-1305: Required message parameters: property.fullName, navigation relationship.fullName */
  NavigationRelationshipAbstractConstraintEntityOrMixin: createPropertyDiagnosticClass<[string, string]>(getCode(1305),
    "The NavigationProperty '{0}', using the relationship '{1}', points to a RelationshipClass, which is not allowed.  NavigationProperties must point to an EntityClass or Mixin."),

  /** DM-1306: Required message parameters: class name, property name, navigation relationship.fullName */
  NavigationClassMustBeAConstraintClassOfRelationship: createPropertyDiagnosticClass<[string, string, string, string]>(getCode(1306),
    "The class '{0}' of NavigationProperty '{1}' is not supported by the {3} constraint of the referenced relationship '{2}'."),

  /** DM-1500: Required message parameters: abstract constraint class name, relationship end (source/target), relationship name, base relationship name */
  AbstractConstraintMustNarrowBaseConstraints: createSchemaItemDiagnosticClass<RelationshipClass, [string, string, string, string]>(DiagnosticCodes.AbstractConstraintMustNarrowBaseConstraints,
    "The abstract constraint class '{0}' on the {1}-Constraint of '{2}' is not supported by the base class constraint in '{3}'."),

  /** DM-1501: Required message parameters: constraint class name, relationship end (source/target), relationship name, base relationship name */
  DerivedConstraintsMustNarrowBaseConstraints: createSchemaItemDiagnosticClass<RelationshipClass, [string, string, string, string]>(DiagnosticCodes.DerivedConstraintsMustNarrowBaseConstraints,
    "The constraint class '{0}' on the {1}-Constraint of '{2}' is not supported by the base class constraint in '{3}'."),

  /** DM-1502: Required message parameters: constraint class name, relationship end (source/target), relationship name, abstract constraint class name */
  ConstraintClassesDeriveFromAbstractConstraint: createSchemaItemDiagnosticClass<RelationshipClass, [string, string, string, string]>(DiagnosticCodes.ConstraintClassesDeriveFromAbstractConstraint,
    "The constraint class '{0}' on the {1}-Constraint of '{2}' is not derived from the abstract constraint class '{3}'."),

  /** DM-1600: Required message parameters: relationship end (source/target), relationship name */
  AtLeastOneConstraintClassDefined: createRelationshipConstraintDiagnosticClass<[string, string]>(DiagnosticCodes.AtLeastOneConstraintClassDefined,
    "The {0}-Constraint of '{1}' does not contain any constraint classes."),

  /** DM-1601: Required message parameters: relationship end (source/target), relationship name */
  AbstractConstraintMustExistWithMultipleConstraints: createRelationshipConstraintDiagnosticClass<[string, string]>(DiagnosticCodes.AbstractConstraintMustExistWithMultipleConstraints,
    "The {0}-Constraint of '{1}' has multiple constraint classes which requires an abstract constraint to be defined."),
};

/**
 * All schema validation rules that fall under the category of DMObjects.
 * @beta
 */
export const DMRuleSet: IRuleSet = {
  name: ruleSetName,

  schemaRules: [
    validateSchemaReferences,
  ],
  classRules: [
    baseClassIsSealed,
    baseClassIsOfDifferentType,
  ],
  propertyRules: [
    incompatibleValueTypePropertyOverride,
    incompatibleTypePropertyOverride,
    incompatibleUnitPropertyOverride,
    validateNavigationProperty,
  ],
  relationshipRules: [
    abstractConstraintMustNarrowBaseConstraints,
    constraintClassesDeriveFromAbstractConstraint,
    derivedConstraintsMustNarrowBaseConstraints,
  ],
  relationshipConstraintRules: [
    atLeastOneConstraintClassDefined,
    abstractConstraintMustExistWithMultipleConstraints,
  ],
  enumerationRules: [
    enumerationTypeUnsupported,
  ],
  entityClassRules: [
    mixinAppliedToClassMustDeriveFromConstraint,
  ],
  customAttributeInstanceRules: [
    validateCustomAttributeInstance,
  ],
};

/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Validates schema references against multiple DM rules.
 * @param schema The schema to validate.
 * @internal
 */
export async function* validateSchemaReferences(schema: Schema): AsyncIterable<SchemaDiagnostic<any[]>> {
  yield* validateSchemaReferencesSync(schema);
}

/**
 * Validates schema references against multiple DM rules.
 * @param schema The schema to validate.
 * @internal
 */
export function* validateSchemaReferencesSync(schema: Schema): Iterable<SchemaDiagnostic<any[]>> {
  const aliases = new Map();
  for (const schemaRef of schema.references) {
    if (schemaRef.customAttributes && schemaRef.customAttributes.has("CoreCustomAttributes.SupplementalSchema"))
      yield new Diagnostics.SupplementalSchemasCannotBeReferenced(schema, [schema.name, schemaRef.name]);

    if (schema.schemaKey.matches(schemaRef.schemaKey))
      yield new Diagnostics.ReferenceCyclesNotAllowed(schema, [schema.name, `${schema.name} --> ${schemaRef.name}`]);

    if (aliases.has(schemaRef.alias)) {
      const currentRef = aliases.get(schemaRef.alias);
      yield new Diagnostics.SchemaRefAliasMustBeUnique(schema, [schema.name, schemaRef.alias, currentRef.name, schemaRef.name]);
    } else {
      aliases.set(schemaRef.alias, schemaRef);
    }
  }

  const graph = SchemaGraph.generateGraphSync(schema);
  const cycles = graph.detectCycles();
  if (cycles) {
    const result = cycles.map((cycle) => `${cycle.schema.schemaKey.name} --> ${cycle.refSchema.schemaKey.name}`).join(", ");
    yield new Diagnostics.ReferenceCyclesNotAllowed(schema, [schema.name, result]);
  }
}
/**
 * DM Rule: Sealed classes cannot be a base class.
 * @internal
 */
export async function* baseClassIsSealed(dmClass: AnyClass): AsyncIterable<ClassDiagnostic<any[]>> {
  if (!dmClass.baseClass)
    return;

  const baseClass = await dmClass.baseClass;
  // return if rule passed
  if (baseClass.modifier !== DMClassModifier.Sealed)
    return;

  yield new Diagnostics.BaseClassIsSealed(dmClass, [dmClass.fullName, baseClass.fullName]);
}

/**
 * DM Rule: Base and child class must be of the same type (i.e. Entity, Mixin, Relationship, etc.)
 * @internal
 */
export async function* baseClassIsOfDifferentType(dmClass: AnyClass): AsyncIterable<ClassDiagnostic<any[]>> {
  if (!dmClass.baseClass)
    return;

  const baseClass = await dmClass.baseClass;
  // return if rule passed
  if (baseClass.schemaItemType === dmClass.schemaItemType)
    return;

  const itemType = baseClass.schemaItemType;
  yield new Diagnostics.BaseClassIsOfDifferentType(dmClass, [dmClass.fullName, baseClass.fullName, itemType]);
}

/**
 * DM Rule: When overriding a class primitive property, the child and base property must be of the same type (string, number, etc...).
 * @internal
*/
export async function* incompatibleValueTypePropertyOverride(property: AnyProperty): AsyncIterable<PropertyDiagnostic<any[]>> {
  if (!property.class.baseClass)
    return;

  const maybePrimitiveType = getPrimitiveType(property);
  if (!maybePrimitiveType)
    return;

  const primitiveType: PrimitiveType = maybePrimitiveType;

  async function callback(baseClass: DMClass): Promise<PropertyDiagnostic<any[]> | undefined> {
    const baseProperty = await baseClass.getProperty(property.name, true);
    if (!baseProperty)
      return;

    // Other rules will catch this if false, but we need to make sure
    // types match for this rule to be valid.
    if (!propertyTypesMatch(property, baseProperty))
      return;

    const baseType = getPrimitiveType(baseProperty);

    // Return if rule passed
    if (!baseType || primitiveType === baseType)
      return;

    return new Diagnostics.IncompatibleValueTypePropertyOverride(property, [property.class.fullName, property.name, baseClass.fullName, primitiveTypeToString(baseType), primitiveTypeToString(primitiveType)]);
  }

  for await (const baseClass of property.class.getAllBaseClasses()) {
    const result = await callback(baseClass);
    if (result)
      yield result;
  }
}

/**
 * DM Rule: When overriding a class property, the child and base property must be of the same property type (primitive, struct, enumeration, etc...).
 * @internal
 */
export async function* incompatibleTypePropertyOverride(property: AnyProperty): AsyncIterable<PropertyDiagnostic<any[]>> {
  if (!property.class.baseClass)
    return;

  async function callback(baseClass: DMClass): Promise<PropertyDiagnostic<any[]> | undefined> {
    const baseProperty = await baseClass.getProperty(property.name, true);
    if (!baseProperty)
      return;

    // Return if rule passed
    if (propertyTypesMatch(property, baseProperty))
      return;

    return new Diagnostics.IncompatibleTypePropertyOverride(property, [property.class.fullName, property.name, baseClass.fullName, baseProperty.constructor.name, property.constructor.name]);
  }

  for await (const baseClass of property.class.getAllBaseClasses()) {
    const result = await callback(baseClass);
    if (result)
      yield result;
  }
}

/**
 * DM Rule: When overriding a kindOfQuantity property, the child and base property units must be the same.
 * @internal
 */
export async function* incompatibleUnitPropertyOverride(property: AnyProperty): AsyncIterable<PropertyDiagnostic<any[]>> {
  if (!property.kindOfQuantity || !property.class.baseClass)
    return;

  async function callback(baseClass: DMClass): Promise<PropertyDiagnostic<any[]> | undefined> {
    const baseProperty = await baseClass.getProperty(property.name, true);
    if (!baseProperty || !baseProperty.kindOfQuantity)
      return;

    // Other rules will catch this if false, but we need to make sure
    // types match for this rule to be valid.
    if (!propertyTypesMatch(property, baseProperty))
      return;

    const koq = await property.kindOfQuantity;
    const baseKoq = await baseProperty.kindOfQuantity;
    if (!koq || !baseKoq)
      return;

    const unit = await koq.persistenceUnit;
    const baseUnit = await baseKoq.persistenceUnit;

    if (!unit || !baseUnit)
      return;

    // return if rule passed
    if (unit.key.matches(baseUnit.key))
      return;

    return new Diagnostics.IncompatibleUnitPropertyOverride(property, [
      property.class.fullName,
      property.name,
      baseClass.fullName,
      baseKoq.fullName,
      baseUnit.fullName,
      unit.fullName,
      koq.fullName,
    ]);
  }

  for await (const baseClass of property.class.getAllBaseClasses()) {
    const result = await callback(baseClass);
    if (result)
      yield result;
  }
}

/**
 * Validates Navigation Properties. DM Rules: 1303, 1304
 * @internal
 */
export async function* validateNavigationProperty(property: AnyProperty): AsyncIterable<PropertyDiagnostic<any[]>> {
  if (!property.isNavigation())
    return;

  const navProp = property;
  const relationship = await navProp.relationshipClass;

  if (relationship.baseClass)
    yield new Diagnostics.NavigationRelationshipMustBeRoot(property, [property.fullName, relationship.fullName]);

  let thisConstraint: RelationshipConstraint;
  let thatConstraint: RelationshipConstraint;
  let navigationClassSide: string;
  if (navProp.direction === StrengthDirection.Forward) {
    thisConstraint = relationship.source;
    thatConstraint = relationship.target;
    navigationClassSide = "source";
  } else {
    thisConstraint = relationship.target;
    thatConstraint = relationship.source;
    navigationClassSide = "target";
  }

  const thatAbstractConstraint = await thatConstraint.abstractConstraint;
  if (thatAbstractConstraint && thatAbstractConstraint.schemaItemType === SchemaItemType.RelationshipClass) {
    yield new Diagnostics.NavigationRelationshipAbstractConstraintEntityOrMixin(property, [property.fullName, relationship.fullName]);
  }

  const isClassSupported = async (dmClass: DMClass, propertyName: string, constraintName: string): Promise<boolean> => {
    if (constraintName === dmClass.fullName && undefined !== await dmClass.getProperty(propertyName, true))
      return true;

    const inheritedProp = await dmClass.getInheritedProperty(propertyName);
    if (inheritedProp && constraintName === inheritedProp.class.fullName)
      return true;

    const baseClass = await dmClass.baseClass;
    if (!baseClass)
      return false;

    return isClassSupported(baseClass, propertyName, constraintName);
  };

  let classSupported = false;
  if (thisConstraint.constraintClasses) {
    for (const constraintClass of thisConstraint.constraintClasses) {
      classSupported = await isClassSupported(property.class, property.name, constraintClass.fullName);
      if (classSupported)
        break;
    }
  }

  if (!classSupported)
    yield new Diagnostics.NavigationClassMustBeAConstraintClassOfRelationship(property, [property.class.name, property.name, relationship.fullName, navigationClassSide]);

  if (thatConstraint.multiplicity === RelationshipMultiplicity.oneMany || thatConstraint.multiplicity === RelationshipMultiplicity.zeroMany) {
    const direction = strengthDirectionToString(navProp.direction);
    yield new Diagnostics.NavigationTargetMustHaveSingularMultiplicity(property, [property.fullName, relationship.fullName, direction]);
  }

  return;
}

/**
 * Validates a Relationship class and yields DM-1500, DM-1501, and DM-1502 rule violations.
 * @internal
 */
export async function* validateRelationship(dmClass: RelationshipClass): AsyncIterable<SchemaItemDiagnostic<RelationshipClass, any[]>> {
  yield* abstractConstraintMustNarrowBaseConstraints(dmClass);
  yield* derivedConstraintsMustNarrowBaseConstraints(dmClass);
  yield* constraintClassesDeriveFromAbstractConstraint(dmClass);
}

/**
 * DM Rule: When overriding a RelationshipClass, the derived abstract constraint must narrow the base constraint classes.
 * @internal
 */
export async function* abstractConstraintMustNarrowBaseConstraints(dmClass: RelationshipClass): AsyncIterable<SchemaItemDiagnostic<RelationshipClass, any[]>> {
  if (!dmClass.baseClass)
    return;

  const baseRelationship = await dmClass.baseClass as RelationshipClass;

  const sourceResult = await applyAbstractConstraintMustNarrowBaseConstraints(dmClass, dmClass.source, baseRelationship);
  if (sourceResult)
    yield sourceResult;
  const targetResult = await applyAbstractConstraintMustNarrowBaseConstraints(dmClass, dmClass.target, baseRelationship);
  if (targetResult)
    yield targetResult;
}

/**
 * DM Rule: When overriding a RelationshipClass, derived constraint classes must narrow base constraint classes.
 * @internal
 */
export async function* derivedConstraintsMustNarrowBaseConstraints(dmClass: RelationshipClass): AsyncIterable<SchemaItemDiagnostic<RelationshipClass, any[]>> {
  if (!dmClass.baseClass)
    return;

  const baseRelationship = await dmClass.baseClass as RelationshipClass;

  const sourceResult = await applyDerivedConstraintsMustNarrowBaseConstraints(dmClass, dmClass.source, baseRelationship);
  if (sourceResult)
    yield sourceResult;
  const targetResult = await applyDerivedConstraintsMustNarrowBaseConstraints(dmClass, dmClass.target, baseRelationship);
  if (targetResult)
    yield targetResult;
}

/**
 * DM Rule: All constraint classes must have a common base class specified in the abstract constraint.
 * @internal
 */
export async function* constraintClassesDeriveFromAbstractConstraint(dmClass: RelationshipClass): AsyncIterable<SchemaItemDiagnostic<RelationshipClass, any[]>> {
  const sourceResult = await applyConstraintClassesDeriveFromAbstractConstraint(dmClass, dmClass.source);
  if (sourceResult)
    yield sourceResult;
  const targetResult = await applyConstraintClassesDeriveFromAbstractConstraint(dmClass, dmClass.target);
  if (targetResult)
    yield targetResult;
}

/**
 * Validates a RelationshipConstraint and yields DM-1600 and DM-1601 rule violations.
 * @internal
 */
export async function* validateRelationshipConstraint(constraint: RelationshipConstraint): AsyncIterable<RelationshipConstraintDiagnostic<any[]>> {
  yield* atLeastOneConstraintClassDefined(constraint);
  yield* abstractConstraintMustExistWithMultipleConstraints(constraint);
}

/**
 * DM Rule: At least on concrete constraint class must be defined in the list of constraint classes.
 * @internal
 */
export async function* atLeastOneConstraintClassDefined(constraint: RelationshipConstraint): AsyncIterable<RelationshipConstraintDiagnostic<any[]>> {
  if (!constraint.constraintClasses || constraint.constraintClasses.length === 0) {
    const constraintType = constraint.isSource ? DMStringConstants.RELATIONSHIP_END_SOURCE : DMStringConstants.RELATIONSHIP_END_TARGET;
    yield new Diagnostics.AtLeastOneConstraintClassDefined(constraint, [constraintType, constraint.relationshipClass.fullName]);
  }
}

/**
 * DM Rule: If multiple constraints exist, an abstract constraint must be defined.
 * @internal
 */
export async function* abstractConstraintMustExistWithMultipleConstraints(constraint: RelationshipConstraint): AsyncIterable<RelationshipConstraintDiagnostic<any[]>> {
  if (!constraint.constraintClasses || constraint.constraintClasses.length <= 1) {
    return;
  }

  const abstractConstraint = await getAbstractConstraint(constraint);
  if (abstractConstraint)
    return;

  const constraintType = constraint.isSource ? DMStringConstants.RELATIONSHIP_END_SOURCE : DMStringConstants.RELATIONSHIP_END_TARGET;
  yield new Diagnostics.AbstractConstraintMustExistWithMultipleConstraints(constraint, [constraintType, constraint.relationshipClass.fullName]);
}

function propertyTypesMatch(propertyA: Property, propertyB: Property) {
  return propertyA.constructor.name === propertyB.constructor.name;
}

function getPrimitiveType(property: Property): PrimitiveType | undefined {
  if (property.isPrimitive())
    return (property).primitiveType;

  return undefined;
}

/**
 * DM Rule: Enumeration type must be a string or integer
 * @internal
 */
export async function* enumerationTypeUnsupported(enumeration: Enumeration): AsyncIterable<SchemaItemDiagnostic<Enumeration, any[]>> {
  const type = enumeration.type;
  if (type === PrimitiveType.Integer || type === PrimitiveType.String)
    return;

  yield new Diagnostics.EnumerationTypeUnsupported(enumeration, [enumeration.fullName]);
}

/**
 * DM Rule: Mixin applied to class must derived from the Mixin appliesTo constraint.
 * @internal
 */
export async function* mixinAppliedToClassMustDeriveFromConstraint(entityClass: EntityClass): AsyncIterable<SchemaItemDiagnostic<EntityClass, any[]>> {
  for (const lazyMixin of entityClass.mixins) {
    const mixin = await lazyMixin;
    if (!mixin.appliesTo)
      continue;

    if (!await entityClass.is(await mixin.appliesTo))
      yield new Diagnostics.MixinAppliedToClassMustDeriveFromConstraint(entityClass, [mixin.fullName, entityClass.fullName, mixin.appliesTo.fullName]);
  }

  return;
}

/**
 * Validates a custom attribute instance and yields DM-500, DM-501, and DM-502 rule violations.
 * @internal
 */
export async function* validateCustomAttributeInstance(container: CustomAttributeContainerProps, customAttribute: CustomAttribute): AsyncIterable<CustomAttributeContainerDiagnostic<any[]>> {
  yield* customAttributeNotOfConcreteClass(container, customAttribute);
  yield* customAttributeSchemaMustBeReferenced(container, customAttribute);
  yield* customAttributeClassMustExist(container, customAttribute);
}

/** DM Rule: CustomAttribute instance must be of a concrete CustomAttributeClass. */
async function* customAttributeNotOfConcreteClass(container: CustomAttributeContainerProps, customAttribute: CustomAttribute): AsyncIterable<CustomAttributeContainerDiagnostic<any[]>> {
  const schema = container.schema;
  const caClass = await schema.lookupItem(customAttribute.className) as DMClass;
  if (!caClass)
    return;

  if (caClass.modifier !== DMClassModifier.Abstract)
    return;

  yield new Diagnostics.CustomAttributeNotOfConcreteClass(container, [container.fullName, caClass.fullName]);
}

/** DM Rule: CustomAttribute Schema must be referenced by the container's Schema. */
async function* customAttributeSchemaMustBeReferenced(container: CustomAttributeContainerProps, customAttribute: CustomAttribute): AsyncIterable<CustomAttributeContainerDiagnostic<any[]>> {
  const schema = container.schema;
  const nameParts = customAttribute.className.split(".");
  if (nameParts.length === 1 || nameParts[0] === schema.name)
    return;

  if (schema.references.some((s) => s.name === nameParts[0]))
    return;

  yield new Diagnostics.CustomAttributeSchemaMustBeReferenced(container, [container.fullName, customAttribute.className]);
}

/** DM Rule: CustomAttribute instance class must exist. */
async function* customAttributeClassMustExist(container: CustomAttributeContainerProps, customAttribute: CustomAttribute): AsyncIterable<CustomAttributeContainerDiagnostic<any[]>> {
  const schema = container.schema;
  const caClass = await schema.lookupItem(customAttribute.className) as DMClass;
  if (!caClass)
    yield new Diagnostics.CustomAttributeClassNotFound(container, [container.fullName, customAttribute.className]);
}

async function applyAbstractConstraintMustNarrowBaseConstraints(dmClass: RelationshipClass, constraint: RelationshipConstraint, baseRelationship: RelationshipClass): Promise<SchemaItemDiagnostic<RelationshipClass, any[]> | undefined> {
  const baseConstraint = constraint.isSource ? baseRelationship.source : baseRelationship.target;
  const abstractConstraint = await constraint.abstractConstraint;
  if (!abstractConstraint)
    return;

  if (await baseConstraint.supportsClass(abstractConstraint))
    return;

  const constraintType = constraint.isSource ? DMStringConstants.RELATIONSHIP_END_SOURCE : DMStringConstants.RELATIONSHIP_END_TARGET;
  return new Diagnostics.AbstractConstraintMustNarrowBaseConstraints(dmClass, [abstractConstraint.fullName, constraintType, constraint.relationshipClass.fullName, baseRelationship.fullName]);
}

async function applyDerivedConstraintsMustNarrowBaseConstraints(dmClass: RelationshipClass, constraint: RelationshipConstraint, baseRelationship: RelationshipClass): Promise<SchemaItemDiagnostic<RelationshipClass, any[]> | undefined> {
  const baseConstraint = constraint.isSource ? baseRelationship.source : baseRelationship.target;

  if (!constraint.constraintClasses)
    return;

  for (const classPromise of constraint.constraintClasses) {
    const constraintClass = await classPromise;

    if (await baseConstraint.supportsClass(constraintClass))
      continue;

    const constraintType = constraint.isSource ? DMStringConstants.RELATIONSHIP_END_SOURCE : DMStringConstants.RELATIONSHIP_END_TARGET;
    return new Diagnostics.DerivedConstraintsMustNarrowBaseConstraints(dmClass, [constraintClass.fullName, constraintType, constraint.relationshipClass.fullName, baseRelationship.fullName]);
  }

  return;
}

async function applyConstraintClassesDeriveFromAbstractConstraint(dmClass: RelationshipClass, constraint: RelationshipConstraint): Promise<SchemaItemDiagnostic<RelationshipClass, any[]> | undefined> {
  const abstractConstraint = await getAbstractConstraint(constraint);
  if (!abstractConstraint)
    return;

  if (!constraint.constraintClasses)
    return;

  for (const classPromise of constraint.constraintClasses) {
    const constraintClass = await classPromise;

    if (Mixin.isMixin(constraintClass) && EntityClass.isEntityClass(abstractConstraint)) {
      if (!await (constraintClass).applicableTo(abstractConstraint)) {
        const constraintType = constraint.isSource ? DMStringConstants.RELATIONSHIP_END_SOURCE : DMStringConstants.RELATIONSHIP_END_TARGET;
        return new Diagnostics.ConstraintClassesDeriveFromAbstractConstraint(dmClass, [constraintClass.fullName, constraintType, constraint.relationshipClass.fullName, abstractConstraint.fullName]);
      }
      continue;
    }

    if (!await constraintClass.is(abstractConstraint)) {
      const constraintType = constraint.isSource ? DMStringConstants.RELATIONSHIP_END_SOURCE : DMStringConstants.RELATIONSHIP_END_TARGET;
      return new Diagnostics.ConstraintClassesDeriveFromAbstractConstraint(dmClass, [constraintClass.fullName, constraintType, constraint.relationshipClass.fullName, abstractConstraint.fullName]);
    }
  }

  return;
}

async function getAbstractConstraint(constraint: RelationshipConstraint): Promise<DMClass | undefined> {
  const abstractConstraint = await constraint.abstractConstraint;
  if (abstractConstraint)
    return abstractConstraint;

  const baseRelationship = await constraint.relationshipClass.baseClass as RelationshipClass;
  if (!baseRelationship)
    return;

  const baseConstraint = constraint.isSource ? baseRelationship.source : baseRelationship.target;

  return getAbstractConstraint(baseConstraint);
}
