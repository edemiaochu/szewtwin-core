/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import { SzewecStatus } from "@szewtwin/core-szewec";
import { IVaultError } from "@szewtwin/core-common";
import { DMSchemaXmlContext } from "./DMSchemaXmlContext";
import { IVaultNative } from "./internal/NativePlatform";

/** Converts DM2 Xml DMSchema(s). On success, the `DM2 Xml schemas` are converted into `DM3.2 Xml schemas`.
 * @param dm2XmlSchemas The DM2 Xml string(s) created from a serialized DMSchema.
 * @returns DM3.2 Xml DMSchema(s).
 * @throws [[IVaultError]] if there is a problem converting the DM2 schemas.
 * @beta
 */
export function convertDM2SchemasToDM3Schemas(dm2XmlSchemas: string[], schemaContext?: DMSchemaXmlContext): string[] {
  const maybeNativeContext = schemaContext?.nativeContext;
  const dm3XmlSchemas: string[] = IVaultNative.platform.SchemaUtility.convertDM2XmlSchemas(dm2XmlSchemas, maybeNativeContext);
  if (dm2XmlSchemas.length === 0)
    throw new IVaultError(SzewecStatus.ERROR, "Error converting DM2 Xml schemas");

  return dm3XmlSchemas;
}

/** Converts schema metadata to DM3 concepts by traversing custom attributes of the supplied schema and calling converters based on schemaName:customAttributeName
 * @param xmlSchemas The DMSchema Xml string(s).
 * @returns DM3.2 Xml DMSchema(s) with converted custom attributes.
 * @throws [[IVaultError]] if there is a problem converting the custom attributes of a schema.
 * @beta
 */
export function upgradeCustomAttributesToDM3(xmlSchemas: string[], schemaContext?: DMSchemaXmlContext): string[] {
  const maybeNativeContext = schemaContext?.nativeContext;
  const schemasWithConvertedCA: string[] = IVaultNative.platform.SchemaUtility.convertCustomAttributes(xmlSchemas, maybeNativeContext);
  if (schemasWithConvertedCA.length === 0)
    throw new IVaultError(SzewecStatus.ERROR, "Error converting custom attributes of Xml schemas");

  return schemasWithConvertedCA;
}
