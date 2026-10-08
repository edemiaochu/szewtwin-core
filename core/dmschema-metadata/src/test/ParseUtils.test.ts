/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  classModifierToString, containerTypeToString, CustomAttributeContainerType, DMClassModifier, parseClassModifier, parseCustomAttributeContainerType,
  parsePrimitiveType, parseRelationshipEnd, parseSchemaItemType, parseStrength, parseStrengthDirection, PrimitiveType, primitiveTypeToString,
  RelationshipEnd, relationshipEndToString, SchemaItemType, StrengthDirection, strengthDirectionToString, strengthToString,
  StrengthType,
} from "../DMObjects";
import { DMSchemaError, DMSchemaStatus } from "../Exception";

describe("Parsing/ToString Functions", () => {
  it("parsePrimitiveType", () => {
    expect(parsePrimitiveType("BInaRy")).equal(PrimitiveType.Binary);
    expect(parsePrimitiveType("boOL")).equal(PrimitiveType.Boolean);
    expect(parsePrimitiveType("boOLean")).equal(PrimitiveType.Boolean);
    expect(parsePrimitiveType("DaTEtime")).equal(PrimitiveType.DateTime);
    expect(parsePrimitiveType("DouBlE")).equal(PrimitiveType.Double);
    expect(parsePrimitiveType("szewDM.gEoMeTrY.CoMmoN.igeOMeTRY")).equal(PrimitiveType.IGeometry);
    expect(parsePrimitiveType("INt")).equal(PrimitiveType.Integer);
    expect(parsePrimitiveType("loNG")).equal(PrimitiveType.Long);
    expect(parsePrimitiveType("PoInt2d")).equal(PrimitiveType.Point2d);
    expect(parsePrimitiveType("POinT3d")).equal(PrimitiveType.Point3d);
    expect(parsePrimitiveType("STrINg")).equal(PrimitiveType.String);
    expect(parsePrimitiveType("invalid type")).toBeUndefined();
  });

  it("primitiveTypeToString", () => {
    expect(primitiveTypeToString(PrimitiveType.Binary)).to.equal("binary");
    expect(primitiveTypeToString(PrimitiveType.Boolean)).to.equal("boolean");
    expect(primitiveTypeToString(PrimitiveType.DateTime)).to.equal("dateTime");
    expect(primitiveTypeToString(PrimitiveType.Double)).to.equal("double");
    expect(primitiveTypeToString(PrimitiveType.IGeometry)).to.equal("Szewec.Geometry.Common.IGeometry");
    expect(primitiveTypeToString(PrimitiveType.Integer)).to.equal("int");
    expect(primitiveTypeToString(PrimitiveType.Long)).to.equal("long");
    expect(primitiveTypeToString(PrimitiveType.Point2d)).to.equal("point2d");
    expect(primitiveTypeToString(PrimitiveType.Point3d)).to.equal("point3d");
    expect(primitiveTypeToString(PrimitiveType.String)).to.equal("string");
    expect(() => primitiveTypeToString(PrimitiveType.Uninitialized)).to.throw(DMSchemaError, "An invalid PrimitiveType has been provided.");
  });

  it("parseClassModifier", () => {
    expect(parseClassModifier("Abstract")).toEqual(DMClassModifier.Abstract);
    expect(parseClassModifier("Sealed")).toEqual(DMClassModifier.Sealed);
    expect(parseClassModifier("None")).toEqual(DMClassModifier.None);

    expect(parseClassModifier("aBSTraCT")).toEqual(DMClassModifier.Abstract);
    expect(parseClassModifier("sEALEd")).toEqual(DMClassModifier.Sealed);
    expect(parseClassModifier("NoNE")).toEqual(DMClassModifier.None);
    expect(parseClassModifier("invalid modifier")).toBeUndefined();
  });

  it("classModiferToString", () => {
    expect(classModifierToString(DMClassModifier.Abstract)).to.equal("Abstract");
    expect(classModifierToString(DMClassModifier.Sealed)).to.equal("Sealed");
    expect(classModifierToString(DMClassModifier.None)).to.equal("None");
    expect(() => classModifierToString(5 as DMClassModifier)).to.throw(DMSchemaError, "An invalid DMClassModifier has been provided.");
  });

  it("parseCustomAttributeContainerType", () => {
    expect(parseCustomAttributeContainerType("SChEma")).to.equal(CustomAttributeContainerType.Schema);
    expect(parseCustomAttributeContainerType("ENTiTycLAsS")).to.equal(CustomAttributeContainerType.EntityClass);
    expect(parseCustomAttributeContainerType("CUstOmAttRIBUteClASs")).to.equal(CustomAttributeContainerType.CustomAttributeClass);
    expect(parseCustomAttributeContainerType("StRuCTclAsS")).to.equal(CustomAttributeContainerType.StructClass);
    expect(parseCustomAttributeContainerType("rElATIonSHIPcLaSS")).to.equal(CustomAttributeContainerType.RelationshipClass);
    expect(parseCustomAttributeContainerType("anYCLaSS")).to.equal(CustomAttributeContainerType.AnyClass);
    expect(parseCustomAttributeContainerType("pRImiTIVeProPErtY")).to.equal(CustomAttributeContainerType.PrimitiveProperty);
    expect(parseCustomAttributeContainerType("StRuCTProperty")).to.equal(CustomAttributeContainerType.StructProperty);
    expect(parseCustomAttributeContainerType("ARRayPRoPertY")).to.equal(CustomAttributeContainerType.PrimitiveArrayProperty);
    expect(parseCustomAttributeContainerType("sTRUctArrayPrOPErTy")).to.equal(CustomAttributeContainerType.StructArrayProperty);
    expect(parseCustomAttributeContainerType("nAviGAtIoNProPerTY")).to.equal(CustomAttributeContainerType.NavigationProperty);
    expect(parseCustomAttributeContainerType("AnyProPErTy")).to.equal(CustomAttributeContainerType.AnyProperty);
    expect(parseCustomAttributeContainerType("SouRcEReLatIoNShiPCoNstRaInT")).to.equal(CustomAttributeContainerType.SourceRelationshipConstraint);
    expect(parseCustomAttributeContainerType("TarGETreLATIoNShIPCOnSTrAInT")).to.equal(CustomAttributeContainerType.TargetRelationshipConstraint);
    expect(parseCustomAttributeContainerType("AnyRELaTioNShiPCoNSTrAInt")).to.equal(CustomAttributeContainerType.AnyRelationshipConstraint);
    expect(parseCustomAttributeContainerType("aNy")).to.equal(CustomAttributeContainerType.Any);
    expect(() => parseCustomAttributeContainerType("invalid type")).to.throw(DMSchemaError, "invalid type is not a valid CustomAttributeContainerType value.");

    const combo = CustomAttributeContainerType.Schema
      | CustomAttributeContainerType.AnyClass
      | CustomAttributeContainerType.TargetRelationshipConstraint
      | CustomAttributeContainerType.StructProperty;
    expect(parseCustomAttributeContainerType(";Schema|AnyClass,TargetRelationshipConstraint;StructProperty")).toEqual(combo);
  });

  it("containerTypeToString", () => {
    expect(containerTypeToString(CustomAttributeContainerType.Schema)).toEqual("Schema");
    expect(containerTypeToString(CustomAttributeContainerType.EntityClass)).toEqual("EntityClass");
    expect(containerTypeToString(CustomAttributeContainerType.CustomAttributeClass)).toEqual("CustomAttributeClass");
    expect(containerTypeToString(CustomAttributeContainerType.StructClass)).toEqual("StructClass");
    expect(containerTypeToString(CustomAttributeContainerType.RelationshipClass)).toEqual("RelationshipClass");
    expect(containerTypeToString(CustomAttributeContainerType.AnyClass)).toEqual("AnyClass");
    expect(containerTypeToString(CustomAttributeContainerType.PrimitiveProperty)).toEqual("PrimitiveProperty");
    expect(containerTypeToString(CustomAttributeContainerType.StructProperty)).toEqual("StructProperty");
    expect(containerTypeToString(CustomAttributeContainerType.PrimitiveArrayProperty)).toEqual("ArrayProperty");
    expect(containerTypeToString(CustomAttributeContainerType.StructArrayProperty)).toEqual("StructArrayProperty");
    expect(containerTypeToString(CustomAttributeContainerType.NavigationProperty)).toEqual("NavigationProperty");
    expect(containerTypeToString(CustomAttributeContainerType.AnyProperty)).toEqual("AnyProperty");
    expect(containerTypeToString(CustomAttributeContainerType.SourceRelationshipConstraint)).toEqual("SourceRelationshipConstraint");
    expect(containerTypeToString(CustomAttributeContainerType.TargetRelationshipConstraint)).toEqual("TargetRelationshipConstraint");
    expect(containerTypeToString(CustomAttributeContainerType.AnyRelationshipConstraint)).toEqual("AnyRelationshipConstraint");
    expect(containerTypeToString(CustomAttributeContainerType.Any)).toEqual("Any");

    const combo = CustomAttributeContainerType.Schema
      | CustomAttributeContainerType.AnyClass
      | CustomAttributeContainerType.TargetRelationshipConstraint
      | CustomAttributeContainerType.StructProperty;
    expect(containerTypeToString(combo)).toEqual("Schema, AnyClass, StructProperty, TargetRelationshipConstraint");
  });

  it("parseRelationshipEnd", () => {
    expect(parseRelationshipEnd("SoUrCE")).toEqual(RelationshipEnd.Source);
    expect(parseRelationshipEnd("TarGeT")).toEqual(RelationshipEnd.Target);
    expect(parseRelationshipEnd("inVAlId")).toBeUndefined();
  });

  it("relationshipEndToString", () => {
    expect(relationshipEndToString(RelationshipEnd.Source)).to.equal("Source");
    expect(relationshipEndToString(RelationshipEnd.Target)).to.equal("Target");
    expect(() => relationshipEndToString(5 as RelationshipEnd)).to.throw(DMSchemaError, "An invalid RelationshipEnd has been provided.");
  });

  it("parseStrength", () => {
    expect(parseStrength("ReFEReNcInG")).toEqual(StrengthType.Referencing);
    expect(parseStrength("HOLdIng")).toEqual(StrengthType.Holding);
    expect(parseStrength("EMBedDiNG")).toEqual(StrengthType.Embedding);
    expect(parseStrength("inVAlId")).toBeUndefined();
  });

  it("strengthToString", () => {
    expect(strengthToString(StrengthType.Embedding)).to.equal("Embedding");
    expect(strengthToString(StrengthType.Referencing)).to.equal("Referencing");
    expect(strengthToString(StrengthType.Holding)).to.equal("Holding");
    expect(() => strengthToString(5 as StrengthType)).to.throw(DMSchemaError, "An invalid Strength has been provided.");
  });

  it("parseStrengthDirection", () => {
    expect(parseStrengthDirection("forward")).toEqual(StrengthDirection.Forward);
    expect(parseStrengthDirection("BACKWARD")).toEqual(StrengthDirection.Backward);
    expect(parseStrengthDirection("invalid")).toBeUndefined();
  });

  it("strengthDirectionToString", () => {
    expect(strengthDirectionToString(StrengthDirection.Backward)).to.equal("Backward");
    expect(strengthDirectionToString(StrengthDirection.Forward)).to.equal("Forward");
    expect(() => strengthDirectionToString(5 as StrengthDirection)).to.throw(DMSchemaError, "An invalid StrengthDirection has been provided.");
  });

  it("parseSchemaItemType", () => {
    expect(parseSchemaItemType("eNtItyCLaSs")).toEqual(SchemaItemType.EntityClass);
    expect(parseSchemaItemType("mIXIn")).toEqual(SchemaItemType.Mixin);
    expect(parseSchemaItemType("sTRuCTcLaSS")).toEqual(SchemaItemType.StructClass);
    expect(parseSchemaItemType("cuSTomATTRIbuTEClaSs")).toEqual(SchemaItemType.CustomAttributeClass);
    expect(parseSchemaItemType("rELAtIONsHiPClaSs")).toEqual(SchemaItemType.RelationshipClass);
    expect(parseSchemaItemType("enUmERAtiON")).toEqual(SchemaItemType.Enumeration);
    expect(parseSchemaItemType("KiNDofQuaNTiTy")).toEqual(SchemaItemType.KindOfQuantity);
    expect(parseSchemaItemType("prOpeRtYcAteGoRy")).toEqual(SchemaItemType.PropertyCategory);
    expect(parseSchemaItemType("inVAlId")).toBeUndefined();
  });

  it("schemaItemTypeToString", () => {
    expect(SchemaItemType.EntityClass).toEqual("EntityClass");
    expect(SchemaItemType.Mixin).toEqual("Mixin");
    expect(SchemaItemType.StructClass).toEqual("StructClass");
    expect(SchemaItemType.CustomAttributeClass).toEqual("CustomAttributeClass");
    expect(SchemaItemType.RelationshipClass).toEqual("RelationshipClass");
    expect(SchemaItemType.Enumeration).toEqual("Enumeration");
    expect(SchemaItemType.KindOfQuantity).toEqual("KindOfQuantity");
    expect(SchemaItemType.PropertyCategory).toEqual("PropertyCategory");
  });
});

describe("DMSchemaError ", () => {
  it("toDebugString", () => {
    expect(new DMSchemaError(DMSchemaStatus.DuplicateItem).toDebugString()).to.equal("DMSchemaStatus.DuplicateItem");
    expect(new DMSchemaError(DMSchemaStatus.DuplicateProperty, "msg").toDebugString()).to.equal("DMSchemaStatus.DuplicateProperty: msg");
    expect(new DMSchemaError(DMSchemaStatus.DuplicateSchema, "msg").toDebugString()).to.equal("DMSchemaStatus.DuplicateSchema: msg");
    expect(new DMSchemaError(DMSchemaStatus.ImmutableSchema, "msg").toDebugString()).to.equal("DMSchemaStatus.ImmutableSchema: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidContainerType, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidContainerType: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidDMJson, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidDMJson: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidDMName, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidDMName: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidDMVersion, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidDMVersion: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidEnumValue, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidEnumValue: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidModifier, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidModifier: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidMultiplicity, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidMultiplicity: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidPrimitiveType, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidPrimitiveType: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidSchemaItemType, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidSchemaItemType: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidStrength, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidStrength: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidStrengthDirection, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidStrengthDirection: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidRelationshipEnd, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidRelationshipEnd: msg");
    expect(new DMSchemaError(DMSchemaStatus.InvalidType, "msg").toDebugString()).to.equal("DMSchemaStatus.InvalidType: msg");
    expect(new DMSchemaError(DMSchemaStatus.MissingSchemaUrl, "msg").toDebugString()).to.equal("DMSchemaStatus.MissingSchemaUrl: msg");
    expect(new DMSchemaError(DMSchemaStatus.UnableToLocateSchema, "msg").toDebugString()).to.equal("DMSchemaStatus.UnableToLocateSchema: msg");
    expect(new DMSchemaError(-9999).toDebugString()).to.equal("Error -9999");
  });
});
