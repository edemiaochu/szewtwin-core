/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DMSQL
 */

/** @public */
export interface DMSchemaReferenceProps {
  readonly name: string;
  readonly version: string;
}

/** @public */
export interface DMSchemaItemProps {
  readonly $schema?: string;
  readonly schema?: string;
  readonly schemaVersion?: string;
  readonly name?: string;
  readonly schemaItemType?: string;
  readonly label?: string;
  readonly description?: string;
  readonly customAttributes?: Array<{ [value: string]: any }>;
}

/** Properties of an DMSchema
 *  @public
 */
export interface DMSchemaProps {
  readonly $schema: string;
  readonly name: string;
  readonly version: string;
  readonly alias: string;
  readonly label?: string;
  readonly description?: string;
  readonly references?: DMSchemaReferenceProps[];
  readonly items?: { [name: string]: DMSchemaItemProps };
  readonly customAttributes?: Array<{ [value: string]: any }>;
}
