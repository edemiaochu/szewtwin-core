/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { SchemaContext } from "./Context";
import { SchemaMatchType } from "./DMObjects";
import { DMSchemaError, DMSchemaStatus } from "./Exception";
import { Schema } from "./Metadata/Schema";
import { SchemaJsonLocater, SchemaPropsGetter } from "./SchemaJsonLocater";
import { DMVersion, SchemaKey } from "./SchemaKey";

/**
 * A utility class for loading DM Schema objects using a function that returns schema json for a given schema name.
 * Loaded schemas are held in memory within  a schema context managed by SchemaLoader.
 * The SchemaLoader object should be held in memory if multiple calls to [[getSchema]] or [[tryGetSchema]]
 * is a possibility, thereby avoiding unnecessary schema retrievals from the function.
 *
 * Since the development of this class, the IVaultDb class has been enhanced to include a schema context.
 * In most cases, that is sufficient so a SchemaLoader is not needed. This class is likely to be removed in the future.
 *
 * ** Example **
 * ```ts
 * [[include:IVaultSchemas.loadFromDb]]
 * ```
 * @beta This will no longer be needed as of 5.0.0 since IVaultDb now has a schema context.
 */
export class SchemaLoader {
  private _context: SchemaContext;

  public constructor(getSchema: SchemaPropsGetter) {
    this._context = new SchemaContext();
    const locater = new SchemaJsonLocater(getSchema);
    this._context.addLocater(locater);
  }

  /** Get a schema by name
   * @param schemaName a string with the name of the schema to load.
   * @throws [DMSchemaError]($dmschema-metadata) if the schema is not found or cannot be loaded.
   */
  public getSchema(schemaName: string): Schema {
    const schema = this.tryGetSchema(schemaName);
    if (!schema)
      throw new DMSchemaError(DMSchemaStatus.UnableToLocateSchema, `reading schema=${schemaName}`);

    return schema;
  }

  /** Attempts to get a schema by name
   * @param schemaName a string with the name of the schema to load.
   * @throws [DMSchemaError]($dmschema-metadata) if the schema exists, but cannot be loaded.
   */
  public tryGetSchema(schemaName: string): Schema | undefined {
    // SchemaKey version is not used when locating schema in an iVault, so the version is arbitrary.
    const key = new SchemaKey(schemaName, new DMVersion(1, 0, 0));
    const schema = this._context.getSchemaSync(key, SchemaMatchType.Latest);
    return schema;
  }

  /** Gets the SchemaContext used by the loader. */
  public get context(): SchemaContext {
    return this._context;
  }
}
