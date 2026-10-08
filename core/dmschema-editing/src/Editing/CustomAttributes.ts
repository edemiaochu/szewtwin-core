/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  CustomAttributeClass,
  CustomAttributeClassProps, CustomAttributeContainerType,
  SchemaItemKey, SchemaItemType, SchemaKey,
} from "@szewtwin/dmschema-metadata";
import { SchemaContextEditor } from "./Editor";
import { DMClasses } from "./DMClasses";
import { MutableCAClass } from "./Mutable/MutableCAClass";
import { ClassId, DMEditingStatus, SchemaEditingError } from "./Exception";

/**
 * @alpha
 * A class extending DMClasses allowing you to create schema items of type CustomAttributeClass.
 */
export class CustomAttributes extends DMClasses {
  public constructor(schemaEditor: SchemaContextEditor) {
    super(SchemaItemType.CustomAttributeClass, schemaEditor);
  }

  protected override get itemTypeClass(): typeof CustomAttributeClass {
    return CustomAttributeClass;
  }

  public async create(schemaKey: SchemaKey, name: string, appliesTo: CustomAttributeContainerType, displayLabel?: string, baseClassKey?: SchemaItemKey): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createClass<CustomAttributeClass>(schemaKey, this.schemaItemType, (schema) => schema.createCustomAttributeClass.bind(schema), name, baseClassKey) as MutableCAClass;

      if (displayLabel)
        newClass.setDisplayLabel(displayLabel);

      newClass.setAppliesTo(appliesTo);
      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFailed, new ClassId(this.schemaItemType, name, schemaKey), e);
    }
  }

  /**
   * Creates a CustomAttributeClass through a CustomAttributeClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param caProps a json object that will be used to populate the new CustomAttributeClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, caProps: CustomAttributeClassProps): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createSchemaItemFromProps(schemaKey, this.schemaItemType, (schema) => schema.createCustomAttributeClass.bind(schema), caProps);
      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFromProps, new ClassId(this.schemaItemType, caProps.name ?? "Unknown", schemaKey), e);
    }
  }
}
