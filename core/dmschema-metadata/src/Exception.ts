/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { SzewecError } from "@szewtwin/core-szewec";

/** @public @preview */
export enum DMSchemaStatus {
  DMSCHEMA_ERROR_BASE = 0x88EC,
  Success = 0,
  DuplicateItem = DMSCHEMA_ERROR_BASE + 1,
  DuplicateProperty = DMSCHEMA_ERROR_BASE + 2,
  DuplicateSchema = DMSCHEMA_ERROR_BASE + 3,
  ImmutableSchema = DMSCHEMA_ERROR_BASE + 4,
  InvalidContainerType = DMSCHEMA_ERROR_BASE + 5,
  InvalidDMJson = DMSCHEMA_ERROR_BASE + 6,
  InvalidDMName = DMSCHEMA_ERROR_BASE + 7,
  InvalidDMVersion = DMSCHEMA_ERROR_BASE + 8,
  InvalidEnumValue = DMSCHEMA_ERROR_BASE + 9,
  InvalidModifier = DMSCHEMA_ERROR_BASE + 10,
  InvalidMultiplicity = DMSCHEMA_ERROR_BASE + 11,
  InvalidPrimitiveType = DMSCHEMA_ERROR_BASE + 12,
  InvalidSchemaItemType = DMSCHEMA_ERROR_BASE + 13,
  InvalidStrength = DMSCHEMA_ERROR_BASE + 14,
  InvalidStrengthDirection = DMSCHEMA_ERROR_BASE + 15,
  InvalidRelationshipEnd = DMSCHEMA_ERROR_BASE + 16,
  InvalidType = DMSCHEMA_ERROR_BASE + 17,
  MissingSchemaUrl = DMSCHEMA_ERROR_BASE + 18,
  UnableToLocateSchema = DMSCHEMA_ERROR_BASE + 19,
  InvalidSchemaXML = DMSCHEMA_ERROR_BASE + 20,
  InvalidSchemaString = DMSCHEMA_ERROR_BASE + 21,
  ClassNotFound = DMSCHEMA_ERROR_BASE + 22,
  SchemaContextUndefined = DMSCHEMA_ERROR_BASE + 23,
  DifferentSchemaContexts = DMSCHEMA_ERROR_BASE + 24,
  InvalidSchemaComparisonArgument = DMSCHEMA_ERROR_BASE + 25,
  InvalidSchemaAlias = DMSCHEMA_ERROR_BASE + 26,
  InvalidSchemaKey = DMSCHEMA_ERROR_BASE + 27,
  UnableToLoadSchema = DMSCHEMA_ERROR_BASE + 28,
  NewerDMSpecVersion = DMSCHEMA_ERROR_BASE + 29,
}

/** @internal */
export class DMSchemaError extends SzewecError {
  public constructor(public override readonly errorNumber: number, message?: string) {
    super(errorNumber, message);
  }

  public toDebugString(): string {
    switch (this.errorNumber) {
      case DMSchemaStatus.DuplicateItem: return this._appendMessage("DMSchemaStatus.DuplicateItem");
      case DMSchemaStatus.DuplicateProperty: return this._appendMessage("DMSchemaStatus.DuplicateProperty");
      case DMSchemaStatus.DuplicateSchema: return this._appendMessage("DMSchemaStatus.DuplicateSchema");
      case DMSchemaStatus.ImmutableSchema: return this._appendMessage("DMSchemaStatus.ImmutableSchema");
      case DMSchemaStatus.InvalidContainerType: return this._appendMessage("DMSchemaStatus.InvalidContainerType");
      case DMSchemaStatus.InvalidDMJson: return this._appendMessage("DMSchemaStatus.InvalidDMJson");
      case DMSchemaStatus.InvalidDMName: return this._appendMessage("DMSchemaStatus.InvalidDMName");
      case DMSchemaStatus.InvalidDMVersion: return this._appendMessage("DMSchemaStatus.InvalidDMVersion");
      case DMSchemaStatus.InvalidEnumValue: return this._appendMessage("DMSchemaStatus.InvalidEnumValue");
      case DMSchemaStatus.InvalidModifier: return this._appendMessage("DMSchemaStatus.InvalidModifier");
      case DMSchemaStatus.InvalidMultiplicity: return this._appendMessage("DMSchemaStatus.InvalidMultiplicity");
      case DMSchemaStatus.InvalidPrimitiveType: return this._appendMessage("DMSchemaStatus.InvalidPrimitiveType");
      case DMSchemaStatus.InvalidSchemaItemType: return this._appendMessage("DMSchemaStatus.InvalidSchemaItemType");
      case DMSchemaStatus.InvalidStrength: return this._appendMessage("DMSchemaStatus.InvalidStrength");
      case DMSchemaStatus.InvalidStrengthDirection: return this._appendMessage("DMSchemaStatus.InvalidStrengthDirection");
      case DMSchemaStatus.InvalidRelationshipEnd: return this._appendMessage("DMSchemaStatus.InvalidRelationshipEnd");
      case DMSchemaStatus.InvalidType: return this._appendMessage("DMSchemaStatus.InvalidType");
      case DMSchemaStatus.MissingSchemaUrl: return this._appendMessage("DMSchemaStatus.MissingSchemaUrl");
      case DMSchemaStatus.UnableToLocateSchema: return this._appendMessage("DMSchemaStatus.UnableToLocateSchema");
      case DMSchemaStatus.ClassNotFound: return this._appendMessage("DMSchemaStatus.ClassNotFound");
      case DMSchemaStatus.SchemaContextUndefined: return this._appendMessage("DMSchemaStatus.SchemaContextUndefined");
      case DMSchemaStatus.DifferentSchemaContexts: return this._appendMessage("DMSchemaStatus.DifferentSchemaContexts");
      default:
        /* istanbul ignore next */
        return this._appendMessage(`Error ${this.errorNumber.toString()}`);
    }
  }

  private _appendMessage(e: string): string {
    return this.message ? `${e}: ${this.message}` : e;
  }
}
