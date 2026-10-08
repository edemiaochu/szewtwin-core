/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

export * from "./SchemaFileLocater";
export * from "./SchemaXml";
export * from "./SchemaJsonFileLocater";
export * from "./SchemaXmlFileLocater";
export * from "./StubSchemaXmlFileLocater";
export * from "./SchemaXmlStringLocater";

/** @docs-package-description
 * The dmschema-locaters package contains classes for locating DMSchemas within a given
 * [SchemaContext](https://www.szewtwinjs.org/reference/dmschema-metadata/context/schemacontext). Each locater
 * implements the [ISchemaLocater interface](https://www.szewtwinjs.org/reference/dmschema-metadata/context/ischemalocater/).
 */
/**
 * @docs-group-description Locaters
 * ISchemaLocater implementations used to locate schemas in a given [SchemaContext](https://www.szewtwinjs.org/reference/dmschema-metadata/context/schemacontext).
 */
/**
 * @docs-group-description Utils
 * A set of utility classes used throughout the package.
 */
