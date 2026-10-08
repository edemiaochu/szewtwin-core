/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DMClass, ISchemaPartVisitor, RelationshipClass, Schema, SchemaItem,
  SchemaItemType, SchemaPartVisitorDelegate,
} from "@szewtwin/dmschema-metadata";

/**
 * The purpose of this class is to traverse a given schema, allowing clients to hook into
 * the traversal process via Visitors to allow for custom processing of the schema elements.
 * @internal
 */
export class SchemaWalker {
  private _visitorHelper: SchemaPartVisitorDelegate;

  // This is a cache of the schema we are traversing. The schema also exists within the _context but in order
  // to not have to go back to the context every time we use this cache.
  private _schema?: Schema;

  /**
   * Initializes a new SchemaWalker instance.
   * @param visitor An ISchemaWalkerVisitor implementation whose methods will be called during schema traversal.
   */
  constructor(visitor: ISchemaPartVisitor) {
    this._visitorHelper = new SchemaPartVisitorDelegate(visitor);
  }

  /**
   * Traverses the given Schema, calling ISchemaWalkerVisitor methods along the way.
   * @param schema The Schema to traverse.
   */
  public async traverseSchema(schema: Schema): Promise<Schema> {
    this._schema = schema;

    await this._visitorHelper.visitSchema(schema);
    await this._visitorHelper.visitSchemaPart(schema);

    for (const item of this._schema.getItems())
      await this.traverseSchemaItem(item);
    return schema;
  }

  private async traverseSchemaItem(schemaItem: SchemaItem): Promise<void> {
    await this._visitorHelper.visitSchemaPart(schemaItem);

    if (DMClass.isDMClass(schemaItem))
      await this.traverseClass(schemaItem);
  }

  private async traverseClass(dmClass: DMClass): Promise<void> {
    for (const property of await dmClass.getProperties(true)) {
      await this._visitorHelper.visitSchemaPart(property);
    }

    if (dmClass.schemaItemType === SchemaItemType.RelationshipClass) {
      await this._visitorHelper.visitSchemaPart((dmClass as RelationshipClass).source);
      await this._visitorHelper.visitSchemaPart((dmClass as RelationshipClass).target);
    }
  }
}
