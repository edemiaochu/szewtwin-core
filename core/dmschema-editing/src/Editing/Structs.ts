/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { SchemaItemKey, SchemaItemType, SchemaKey, StructClass, StructClassProps } from "@szewtwin/dmschema-metadata";
import { SchemaContextEditor } from "./Editor";
import { DMClasses } from "./DMClasses";
import { MutableStructClass } from "./Mutable/MutableClass";
import { ClassId, DMEditingStatus, SchemaEditingError } from "./Exception";

/**
 * @alpha A class extending DMClasses allowing you to create schema items of type StructClass.
 */
export class Structs extends DMClasses {
  protected override get itemTypeClass(): typeof StructClass {
    return StructClass;
  }

  public constructor(schemaEditor: SchemaContextEditor) {
    super(SchemaItemType.StructClass, schemaEditor);
  }

  public async create(schemaKey: SchemaKey, name: string, displayLabel?: string, baseClassKey?: SchemaItemKey): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createClass<StructClass>(schemaKey, this.schemaItemType, (schema) => schema.createStructClass.bind(schema), name, baseClassKey) as MutableStructClass;

      if (displayLabel)
        newClass.setDisplayLabel(displayLabel);

      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFailed, new ClassId(this.schemaItemType, name, schemaKey), e);
    }
  }

  /**
   *  Creates a StructClass through a StructClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param structProps a json object that will be used to populate the new StructClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, structProps: StructClassProps): Promise<SchemaItemKey> {
    try {
      const newClass = await this.createSchemaItemFromProps(schemaKey, this.schemaItemType, (schema) => schema.createStructClass.bind(schema), structProps);
      return newClass.key;
    } catch (e: any) {
      throw new SchemaEditingError(DMEditingStatus.CreateSchemaItemFromProps, new ClassId(this.schemaItemType, structProps.name ?? "Unknown", schemaKey), e);
    }
  }
}
