/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import { assert } from "@szewtwin/core-szewec";
import { IVaultError } from "@szewtwin/core-common";
import { IVaultJsNative } from "@szewec/ivaultjs-native";
import { IVaultNative } from "./internal/NativePlatform";

/** @internal */
export type SchemaKey = IVaultJsNative.DMSchemaXmlContext.SchemaKey;

/** @internal */
export type SchemaMatchType = IVaultJsNative.DMSchemaXmlContext.SchemaMatchType;

/** Context used when deserializing a [Schema]($dmschema-metadata) from an XML file.
 * A schema may contain references to other schemas, which may reside elsewhere on the local disk than the referencing schema.
 * The context maintains a list of directories ("search paths") to search for referenced schemas. Directories can be appended to the list via [[addSchemaPath]].
 * When a referenced schema needs to be located, the list of directories is searched in the order in which each was added.
 * Once located, the schema is cached to avoid performing repeated lookups in the file system.
 * @see [[readSchemaFromXmlFile]] to deserialize a schema.
 * @public @preview
 */
export class DMSchemaXmlContext {
  private _nativeContext: IVaultJsNative.DMSchemaXmlContext | undefined;

  /** Construct a context with an empty list of search paths. */
  constructor() {
    this._nativeContext = new IVaultNative.platform.DMSchemaXmlContext();
  }

  /** @internal */
  public get nativeContext(): IVaultJsNative.DMSchemaXmlContext {
    assert(undefined !== this._nativeContext);
    return this._nativeContext;
  }

  /** Append a directory to the list of directories that will be searched to locate referenced schemas.
   * The directories are searched in the order in which they were added to the list.
   * @param searchPath The absolute path to the directory to search.
   */
  public addSchemaPath(searchPath: string): void {
    this.nativeContext.addSchemaPath(searchPath);
  }

  /** Set the last locater to be used when trying to find a schema
   * @param locater Locater that should be used as the last locater when trying to find a schema
   * @internal
   */
  public setSchemaLocater(locater: IVaultJsNative.DMSchemaXmlContext.SchemaLocaterCallback): void {
    this.nativeContext.setSchemaLocater(locater);
  }

  /** Adds a schema locator to the beginning of the list of locators used to search for schemas.
   * This schema locator will be prioritized over other locators when searching for schemas in the current context.
   * @param locater Locater to add to the current context
   * @internal
   */
  public setFirstSchemaLocater(locater: IVaultJsNative.DMSchemaXmlContext.SchemaLocaterCallback): void {
    this.nativeContext.setFirstSchemaLocater(locater);
  }

  /** Deserialize a [Schema]($dmschema-metadata) from an DMSchemaXML-formatted file.
   * @param filePath The absolute path of the XML file.
   * @returns The JSON representation of the schema, as a [SchemaProps]($dmschema-metadata).
   * @throws [[IVaultError]] if there is a problem reading schema from the XML file
   */
  public readSchemaFromXmlFile(filePath: string): any {
    const response = this.nativeContext.readSchemaFromXmlFile(filePath);
    if (response.error) {
      throw new IVaultError(response.error.status, response.error.message);
    }

    assert(undefined !== response.result);
    return JSON.parse(response.result);
  }
}
