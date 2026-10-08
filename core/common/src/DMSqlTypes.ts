/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DMSQL
 */

import { assert, Id64String } from "@szewtwin/core-szewec";

/** Describes the different data types an DMSQL value can be of.
 * See also [DMSQL]($docs/learning/DMSQL).
 * @public
 * @extensions
 */
export enum DMSqlValueType {
  // do not change the values of the enum as it must match its counterpart in the addon
  Blob = 1,
  Boolean = 2,
  DateTime = 3,
  Double = 4,
  Geometry = 5,
  Id = 6,
  Int = 7,
  Int64 = 8,
  Point2d = 9,
  Point3d = 10,
  String = 11,
  Navigation = 12,
  Struct = 13,
  PrimitiveArray = 14,
  StructArray = 15,
  Guid = 16,
}

/** An DMSQL Navigation value.
 * It is returned from DMSQL SELECT statements for navigation properties.
 * See also [DMSQL]($docs/learning/DMSQL).
 * @public
 * @extensions
 */
export interface NavigationValue {
  /** DMInstanceId of the related instance */
  id: Id64String;
  /** Fully qualified class name of the relationship backing the Navigation property */
  relClassName?: string;
}

/** An DMSQL Navigation value which can be bound to a navigation property DMSQL parameter
 * See also [DMSQL]($docs/learning/DMSQL).
 * @public
 * @extensions
 */
export interface NavigationBindingValue {
  /** DMInstanceId of the related instance */
  id: Id64String;
  /** Fully qualified class name of the relationship backing the Navigation property */
  relClassName?: string;
  /** Table space where the relationship's schema is persisted. This is only required
   * if other DMDb files are attached to the primary one. In case a schema exists in more than one of the files,
   * pass the table space to disambiguate.
   */
  relClassTableSpace?: string;
}

/** Equivalent of the DMEnumeration OpCode in the **DMDbChange** DMSchema.
 * The enum can be used when programmatically binding values to the InstanceChange.OpCode property of
 * the DMDbChange DMSchema.
 *
 * See also
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @public
 * @extensions
 */
export enum ChangeOpCode {
  Insert = 1,
  Update = 2,
  Delete = 4,
}

/** The enum represents the values for the ChangedValueState argument of the DMSQL function **Changes**.
 * The enum can be used when programmatically binding values to the ChangedValueState argument
 * in an DMSQL using the **Changes** DMSQL function.
 *
 * See also
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @public
 * @extensions
 */
export enum ChangedValueState {
  AfterInsert = 1,
  BeforeUpdate = 2,
  AfterUpdate = 3,
  BeforeDelete = 4,
}

/** Defines the DMSQL system properties.
 * See also [DMSQL]($docs/learning/DMSQL).
 * @public
 * @extensions
 */
export enum DMSqlSystemProperty {
  DMInstanceId,
  DMClassId,
  SourceDMInstanceId,
  SourceDMClassId,
  TargetDMInstanceId,
  TargetDMClassId,
  NavigationId,
  NavigationRelClassId,
  PointX,
  PointY,
  PointZ,
}

/** Utility to format DMProperty names according to the szewTwin.js formatting rules.
 * See also [DMSQL Row Format]($docs/learning/ECSQLRowFormat).
 * @public
 */
export class DMJsNames {

  /** Formats the specified DMProperty name according to the szewTwin.js formatting rules.
   *
   *  See [DMSQL Row Format]($docs/learning/ECSQLRowFormat) which describes the formatting rules.
   *
   * @param dmProperty Property name as defined in the DMSchema for regular DMProperties
   *        or the name of an DMSQL system properties
   * @param isSystemProperty if omitted, the method will try to find out whether the given property
   *        is a system property or not. If true is specified, the method will throw if the property name
   *        is not a known system property. If false is specified, the method will not attempt to recognize
   *        the property name as system property.
   */
  public static toJsName(propName: string, isSystemProperty?: boolean) {
    assert(propName !== undefined, "propName must not be undefined");

    const propTypeUnknown: boolean = isSystemProperty === undefined || isSystemProperty === null;

    const accessStringTokens: string[] = propName.split(".");
    const tokenCount: number = accessStringTokens.length;
    assert(tokenCount > 0);

    if (tokenCount === 1) {
      if (propTypeUnknown || isSystemProperty) {
        if (propName === "DMInstanceId")
          return DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.DMInstanceId);

        if (propName === "DMClassId")
          return DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.DMClassId);

        if (propName === "SourceDMInstanceId")
          return DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.SourceDMInstanceId);

        if (propName === "TargetDMInstanceId")
          return DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.TargetDMInstanceId);

        if (propName === "SourceDMClassId")
          return DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.SourceDMClassId);

        if (propName === "TargetDMClassId")
          return DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.TargetDMClassId);

        return DMJsNames.lowerFirstChar(propName);
      }

      return DMJsNames.lowerFirstChar(propName);
    }

    // parse access string and convert the leaf tokens if they are system props
    // The first char of the access string is lowered.
    let jsName: string = DMJsNames.lowerFirstChar(`${accessStringTokens[0]}.`);
    for (let j = 1; j < tokenCount - 1; j++) {
      jsName += `${accessStringTokens[j]}.`;
    }

    const leafToken: string = accessStringTokens[tokenCount - 1];

    if (propTypeUnknown || isSystemProperty) {
      if (leafToken === "Id")
        jsName += DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.NavigationId);
      else if (leafToken === "RelDMClassId")
        jsName += DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.NavigationRelClassId);
      else if (leafToken === "X")
        jsName += DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.PointX);
      else if (leafToken === "Y")
        jsName += DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.PointY);
      else if (leafToken === "Z")
        jsName += DMJsNames.systemPropertyToJsName(DMSqlSystemProperty.PointZ);
      else if (propTypeUnknown)
        jsName += DMJsNames.lowerFirstChar(leafToken);
      else
        throw new Error(`Property ${leafToken} of access string ${propName} is no DMSQL system property.`);
    } else
      jsName += leafToken;

    return jsName;
  }

  /** Returns the name of the specified DMSQL system property according to the
   *  szewTwin.js formatting rules.
   *
   *  See [DMSQL Row Format]($docs/learning/ECSQLRowFormat) which describes the formatting rules.
   * @param systemPropertyType System property type
   */
  public static systemPropertyToJsName(systemPropertyType: DMSqlSystemProperty): string {
    switch (systemPropertyType) {
      case DMSqlSystemProperty.DMInstanceId:
      case DMSqlSystemProperty.NavigationId:
        return "id";
      case DMSqlSystemProperty.DMClassId:
        return "className";
      case DMSqlSystemProperty.SourceDMInstanceId:
        return "sourceId";
      case DMSqlSystemProperty.SourceDMClassId:
        return "sourceClassName";
      case DMSqlSystemProperty.TargetDMInstanceId:
        return "targetId";
      case DMSqlSystemProperty.TargetDMClassId:
        return "targetClassName";
      case DMSqlSystemProperty.NavigationRelClassId:
        return "relClassName";
      case DMSqlSystemProperty.PointX:
        return "x";
      case DMSqlSystemProperty.PointY:
        return "y";
      case DMSqlSystemProperty.PointZ:
        return "z";
      default:
        throw new Error(`Unknown DMSqlSystemProperty enum value ${String(systemPropertyType)}.`);
    }
  }

  private static lowerFirstChar(name: string): string { return name[0].toLowerCase() + name.substring(1); }
}
