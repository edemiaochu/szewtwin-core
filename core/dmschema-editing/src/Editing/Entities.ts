/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  DMClassModifier, EntityClass, EntityClassProps,
  Mixin, NavigationPropertyProps, RelationshipClass, SchemaItemKey, SchemaItemType, SchemaKey, StrengthDirection,
} from "@szewtwin/dmschema-metadata";
import { SchemaContextEditor } from "./Editor";
import { DMClasses } from "./DMClasses";
import { MutableEntityClass } from "./Mutable/MutableEntityClass";
import { NavigationProperties } from "./Properties";
import { ClassId, DMEditingStatus, SchemaEditingError } from "./Exception";

/**
 * @alpha
 * A class extending DMClasses allowing you to create schema items of type EntityClass.
 */
export class Entities extends DMClasses {
  protected override get itemTypeClass(): typeof EntityClass {
    return EntityClass;
  }

  public constructor(schemaEditor: SchemaContextEditor) {
    super(SchemaItemType.EntityClass, schemaEditor);
  }

  /**
   * Allows access for editing of NavigationProperty attributes.
   */
  public readonly navigationProperties = new NavigationProperties(SchemaItemType.EntityClass, this.schemaEditor);

  public async createElement(schemaKey: SchemaKey, name: string, modifier: DMClassModifier, baseClassKey: SchemaItemKey, displayLabel?: string, mixins?: Mixin[]): Promise<SchemaItemKey> {
    try {
      const baseClass = await this.getSchemaItem(baseClassKey, EntityClass);
      if (!(await (baseClass).is("Element", "BisCore"))) {
        throw new SchemaEditingError(DMEditingStatus.BaseClassIsNotElement, new ClassId(this.schemaItemType, baseClassKey));
      }
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateElement, new ClassId(this.schemaItemType, name, schemaKey), e);
    }

    return this.create(schemaKey, name, modifier, displayLabel, baseClassKey, mixins);
  }

  public async createElementUniqueAspect(schemaKey: SchemaKey, name: string, modifier: DMClassModifier, baseClassKey: SchemaItemKey, displayLabel?: string, mixins?: Mixin[]): Promise<SchemaItemKey> {
    try {
      const baseClass = await this.getSchemaItem(baseClassKey, EntityClass);
      if (!(await (baseClass).is("ElementUniqueAspect", "BisCore"))) {
        throw new SchemaEditingError(DMEditingStatus.BaseClassIsNotElementUniqueAspect, new ClassId(this.schemaItemType, baseClassKey));
      }
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateElement, new ClassId(this.schemaItemType, name, schemaKey), e);
    }

    return this.create(schemaKey, name, modifier, displayLabel, baseClassKey, mixins);
  }

  public async createElementMultiAspect(schemaKey: SchemaKey, name: string, modifier: DMClassModifier, baseClassKey: SchemaItemKey, displayLabel?: string, mixins?: Mixin[]): Promise<SchemaItemKey> {
    try {
      const baseClass = await this.getSchemaItem(baseClassKey, EntityClass);
      if (!(await (baseClass).is("ElementMultiAspect", "BisCore"))) {
        throw new SchemaEditingError(DMEditingStatus.BaseClassIsNotElementMultiAspect, new ClassId(this.schemaItemType, baseClassKey));
      }
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateElement, new ClassId(this.schemaItemType, name, schemaKey), e);
    }

    return this.create(schemaKey, name, modifier, displayLabel, baseClassKey, mixins);
  }

  public async create(schemaKey: SchemaKey, name: string, modifier: DMClassModifier, displayLabel?: string, baseClassKey?: SchemaItemKey, mixins?: Mixin[]): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createClass<EntityClass>(schemaKey, this.schemaItemType, (schema) => schema.createEntityClass.bind(schema), name, baseClassKey, modifier) as MutableEntityClass;

      if (mixins !== undefined)
        mixins.forEach((m) => newClass.addMixin(m));

      if (displayLabel)
        newClass.setDisplayLabel(displayLabel);

      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFailed, new ClassId(this.schemaItemType, name, schemaKey), e);
    }
  }

  /**
   * Creates an EntityClass through an EntityClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param entityProps a json object that will be used to populate the new EntityClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, entityProps: EntityClassProps): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createSchemaItemFromProps(schemaKey, this.schemaItemType, (schema) => schema.createEntityClass.bind(schema), entityProps);
      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFromProps, new ClassId(this.schemaItemType, entityProps.name ?? "Unknown", schemaKey), e);
    }
  }

  public async addMixin(entityKey: SchemaItemKey, mixinKey: SchemaItemKey): Promise<void> {
    try {
      const entity = await this.getSchemaItem(entityKey, MutableEntityClass);
      const mixin = await this.getSchemaItem(mixinKey, Mixin);
      entity.addMixin(mixin);
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.AddMixin, new ClassId(SchemaItemType.EntityClass, entityKey), e);
    }
  }

  public async createNavigationProperty(entityKey: SchemaItemKey, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<void> {
    try {
      const entity = await this.getSchemaItem(entityKey, MutableEntityClass);
      await entity.createNavigationProperty(name, relationship, direction);
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateNavigationProperty, new ClassId(SchemaItemType.RelationshipClass, entityKey), e);
    }
  }

  /**
   * Creates a Navigation Property through a NavigationPropertyProps.
   * @param classKey a SchemaItemKey of the Entity Class that will house the new property.
   * @param navigationProps a json object that will be used to populate the new Navigation Property.
   */
  public async createNavigationPropertyFromProps(classKey: SchemaItemKey, navigationProps: NavigationPropertyProps): Promise<void> {
    try {
      const entity = await this.getSchemaItem(classKey, MutableEntityClass);
      const property = await entity.createNavigationProperty(navigationProps.name, navigationProps.relationshipName, navigationProps.direction);
      await property.fromJSON(navigationProps);
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateNavigationPropertyFromProps, new ClassId(SchemaItemType.EntityClass, classKey), e);
    }
  }
}
