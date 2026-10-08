/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  CustomAttribute, DelayedPromiseWithProps, DMClass, DMClassModifier, EntityClass, LazyLoadedRelationshipConstraintClass, Mixin, NavigationPropertyProps,
  RelationshipClass, RelationshipClassProps, RelationshipConstraint, RelationshipEnd, RelationshipMultiplicity, SchemaItemKey, SchemaItemType,
  SchemaKey, StrengthDirection, StrengthType,
} from "@szewtwin/dmschema-metadata";
import { SchemaContextEditor } from "./Editor";
import { DMClasses } from "./DMClasses";
import { MutableRelationshipClass, MutableRelationshipConstraint } from "./Mutable/MutableRelationshipClass";
import * as Rules from "../Validation/DMRules";
import { AnyDiagnostic, RelationshipConstraintDiagnostic, SchemaItemDiagnostic } from "../Validation/Diagnostic";
import { NavigationProperties } from "./Properties";
import { ClassId, CustomAttributeId, DMEditingStatus, RelationshipConstraintId, SchemaEditingError } from "./Exception";
import { MutableClass } from "./Mutable/MutableClass";

/**
 * @alpha
 * A class extending DMClasses allowing you to create schema items of type RelationshipClass.
 */
export class RelationshipClasses extends DMClasses {
  protected override get itemTypeClass(): typeof RelationshipClass {
    return RelationshipClass;
  }

  public constructor(schemaEditor: SchemaContextEditor) {
    super(SchemaItemType.RelationshipClass, schemaEditor);
  }

  /**
   * Allows access for editing of NavigationProperty attributes.
   */
  public readonly navigationProperties = new NavigationProperties(this.schemaItemType, this.schemaEditor);

  /**
   * Creates a RelationshipClass.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param name The name of the new class.
   * @param modifier The DMClassModifier of the new class.
   * @param strength The relationship StrengthType of the class.
   * @param StrengthDirection The relationship StrengthDirection of the class.
   * @param baseClassKey An optional SchemaItemKey that specifies the base relationship class.
   */
  public async create(schemaKey: SchemaKey, name: string, modifier: DMClassModifier, strength: StrengthType, direction: StrengthDirection, baseClassKey?: SchemaItemKey): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createClass<RelationshipClass>(schemaKey, this.schemaItemType, (schema) => schema.createRelationshipClass.bind(schema), name, baseClassKey, modifier) as MutableRelationshipClass;

      newClass.setStrength(strength);
      newClass.setStrengthDirection(direction);

      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFailed, new ClassId(this.schemaItemType, name, schemaKey), e);
    }
  }

  /**
   * Sets the source RelationshipConstraint on the relationship.
   * @param relationshipKey The SchemaItemKey for the relationship.
   * @param source The RelationshipConstraint to add.
   */
  public async setSourceConstraint(relationshipKey: SchemaItemKey, source: RelationshipConstraint): Promise<void> {
    const relationship = await this.getSchemaItem(relationshipKey, MutableRelationshipClass)
      .catch((e) => {
        throw new SchemaEditingError(DMEditingStatus.SetSourceConstraint, new ClassId(this.schemaItemType, relationshipKey), e);
      });

    relationship.setSourceConstraint(source);
  }

  /**
   * Sets the target RelationshipConstraint on the relationship.
   * @param relationshipKey The SchemaItemKey for the relationship.
   * @param target The RelationshipConstraint to add.
   */
  public async setTargetConstraint(relationshipKey: SchemaItemKey, target: RelationshipConstraint): Promise<void> {
    const relationship = await this.getSchemaItem(relationshipKey, MutableRelationshipClass)
      .catch((e) => {
        throw new SchemaEditingError(DMEditingStatus.SetTargetConstraint, new ClassId(this.schemaItemType, relationshipKey), e);
      });

    relationship.setTargetConstraint(target);
  }

  /**
   * Creates a RelationshipClass through a RelationshipClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param relationshipProps a json object that will be used to populate the new RelationshipClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, relationshipProps: RelationshipClassProps): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createSchemaItemFromProps(schemaKey, this.schemaItemType, (schema) => schema.createRelationshipClass.bind(schema), relationshipProps);

      await newClass.source.fromJSON(relationshipProps.source);
      await newClass.target.fromJSON(relationshipProps.target);

      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFromProps, new ClassId(this.schemaItemType, relationshipProps.name ?? "Unknown", schemaKey), e);
    }
  }

  /**
   * Sets the base class of a RelationshipClass.
   * @param relationshipKey The SchemaItemKey of the RelationshipClass.
   * @param baseClassKey The SchemaItemKey of the base class. Specifying 'undefined' removes the base class.
   */
  public override async setBaseClass(itemKey: SchemaItemKey, baseClassKey?: SchemaItemKey): Promise<void> {
    const relClass = await this.schemaEditor.schemaContext.getSchemaItem(itemKey, RelationshipClass)
      .catch((e) => {
        throw new SchemaEditingError(DMEditingStatus.SetBaseClass, new ClassId(this.schemaItemType, itemKey), e);
      });
    const baseClass = relClass?.baseClass;

    await super.setBaseClass(itemKey, baseClassKey);

    if (!relClass)
      throw new SchemaEditingError(DMEditingStatus.SetBaseClass, new ClassId(SchemaItemType.RelationshipClass, itemKey));

    try {
      await this.validate(relClass);
    } catch (e: any) {
      await (relClass as DMClass as MutableClass).setBaseClass(baseClass);
      throw new SchemaEditingError(DMEditingStatus.SetBaseClass, new ClassId(SchemaItemType.RelationshipClass, itemKey), e);
    }
  }

  public async createNavigationProperty(relationshipKey: SchemaItemKey, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<void> {
    try {
      const relationshipClass = await this.getSchemaItem(relationshipKey, MutableRelationshipClass);
      await relationshipClass.createNavigationProperty(name, relationship, direction);
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateNavigationProperty, new ClassId(SchemaItemType.RelationshipClass, relationshipKey), e);
    }
  }

  /**
   * Creates a Navigation Property through a NavigationPropertyProps.
   * @param classKey a SchemaItemKey of the Relationship Class that will house the new property.
   * @param navigationProps a json object that will be used to populate the new Navigation Property.
   */
  public async createNavigationPropertyFromProps(relationshipKey: SchemaItemKey, navigationProps: NavigationPropertyProps): Promise<void> {
    try {
      const relationshipClass = await this.getSchemaItem(relationshipKey, MutableRelationshipClass);
      const property = await relationshipClass.createNavigationProperty(navigationProps.name, navigationProps.relationshipName, navigationProps.direction);
      await property.fromJSON(navigationProps);
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateNavigationPropertyFromProps, new ClassId(SchemaItemType.RelationshipClass, relationshipKey), e);
    }
  }

  public async setConstraintMultiplicity(constraint: RelationshipConstraint, multiplicity: RelationshipMultiplicity): Promise<void> {
    const mutableConstraint = constraint as MutableRelationshipConstraint;
    mutableConstraint.setMultiplicity(multiplicity);
  }

  public async setConstraintPolymorphic(constraint: RelationshipConstraint, polymorphic: boolean): Promise<void> {
    const mutableConstraint = constraint as MutableRelationshipConstraint;
    mutableConstraint.setPolymorphic(polymorphic);
  }

  public async setConstraintRelationshipEnd(constraint: RelationshipConstraint, relationshipEnd: RelationshipEnd): Promise<void> {
    const mutableConstraint = constraint as MutableRelationshipConstraint;
    mutableConstraint.setRelationshipEnd(relationshipEnd);
  }

  public async setAbstractConstraint(constraint: RelationshipConstraint, abstractConstraint?: EntityClass | Mixin | RelationshipClass): Promise<void> {
    const existing: LazyLoadedRelationshipConstraintClass | undefined = constraint.abstractConstraint;
    const mutableConstraint = constraint as MutableRelationshipConstraint;

    if (undefined === abstractConstraint) {
      mutableConstraint.setAbstractConstraint(undefined);
    } else {
      mutableConstraint.setAbstractConstraint(new DelayedPromiseWithProps(abstractConstraint.key, async () => abstractConstraint));
    }

    try {
      await this.validate(constraint.relationshipClass);
    } catch (e: any) {
      mutableConstraint.setAbstractConstraint(existing);
      throw new SchemaEditingError(DMEditingStatus.SetAbstractConstraint, new RelationshipConstraintId(constraint), e);
    }

    try {
      await this.validate(constraint);
    } catch (e: any) {
      mutableConstraint.setAbstractConstraint(existing);
      throw new SchemaEditingError(DMEditingStatus.SetAbstractConstraint, new RelationshipConstraintId(constraint), e);
    }
  }

  public async addConstraintClass(constraint: RelationshipConstraint, dmClass: EntityClass | Mixin | RelationshipClass): Promise<void> {
    const mutableConstraint = constraint as MutableRelationshipConstraint;
    mutableConstraint.addClass(new DelayedPromiseWithProps(dmClass.key, async () => dmClass));

    try {
      await this.validate(constraint.relationshipClass);
    } catch (e: any) {
      mutableConstraint.removeClass(new DelayedPromiseWithProps(dmClass.key, async () => dmClass));
      throw new SchemaEditingError(DMEditingStatus.AddConstraintClass, new RelationshipConstraintId(constraint), e);
    }

    try {
      await this.validate(constraint);
    } catch (e: any) {
      mutableConstraint.removeClass(new DelayedPromiseWithProps(dmClass.key, async () => dmClass));
      throw new SchemaEditingError(DMEditingStatus.AddConstraintClass, new RelationshipConstraintId(constraint), e);
    }
  }

  public async removeConstraintClass(constraint: RelationshipConstraint, dmClass: EntityClass | Mixin | RelationshipClass): Promise<void> {
    const mutableConstraint = constraint as MutableRelationshipConstraint;
    mutableConstraint.removeClass(new DelayedPromiseWithProps(dmClass.key, async () => dmClass));

    try {
      await this.validate(constraint);
    } catch (e: any) {
      mutableConstraint.addClass(new DelayedPromiseWithProps(dmClass.key, async () => dmClass));
      throw new SchemaEditingError(DMEditingStatus.RemoveConstraintClass, new RelationshipConstraintId(constraint), e);
    }
  }

  public async addCustomAttributeToConstraint(constraint: RelationshipConstraint, customAttribute: CustomAttribute): Promise<void> {
    const mutableConstraint = constraint as MutableRelationshipConstraint;
    mutableConstraint.addCustomAttribute(customAttribute);

    const diagnosticIterable = Rules.validateCustomAttributeInstance(constraint, customAttribute);

    const diagnostics: AnyDiagnostic[] = [];
    for await (const diagnostic of diagnosticIterable) {
      diagnostics.push(diagnostic);
    }

    if (diagnostics.length > 0) {
      this.removeCustomAttribute(constraint, customAttribute);
      throw new SchemaEditingError(DMEditingStatus.AddCustomAttributeToConstraint, new RelationshipConstraintId(constraint),
        new SchemaEditingError(DMEditingStatus.RuleViolation, new CustomAttributeId(customAttribute.className, constraint), undefined, diagnostics));
    }
  }

  private async validate(relationshipOrConstraint: RelationshipClass | RelationshipConstraint): Promise<void> {
    let diagnosticIterable: AsyncIterable<SchemaItemDiagnostic<RelationshipClass, any[]>> | AsyncIterable<RelationshipConstraintDiagnostic<any[]>>;
    let relationshipKey: SchemaItemKey | string;

    if (relationshipOrConstraint instanceof RelationshipClass) {
      diagnosticIterable = Rules.validateRelationship(relationshipOrConstraint);
      relationshipKey = relationshipOrConstraint.key;
    } else {
      diagnosticIterable = Rules.validateRelationshipConstraint(relationshipOrConstraint);
      relationshipKey = relationshipOrConstraint.relationshipClass.key;
    }

    const diagnostics: AnyDiagnostic[] = [];
    for await (const diagnostic of diagnosticIterable) {
      diagnostics.push(diagnostic);
    }

    if (diagnostics.length > 0) {
      if (relationshipOrConstraint instanceof RelationshipClass) {
        throw new SchemaEditingError(DMEditingStatus.RuleViolation, new ClassId(SchemaItemType.RelationshipClass, relationshipKey), undefined, diagnostics);
      } else {
        throw new SchemaEditingError(DMEditingStatus.RuleViolation, new RelationshipConstraintId(relationshipOrConstraint), undefined, diagnostics);
      }
    }
  }
}
