/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { DMClassModifier, DMVersion, Format, SchemaContext, SchemaKey } from "@szewtwin/dmschema-metadata";
import { FormatTraits, FormatType } from "@szewtwin/core-quantity";
import { SchemaContextEditor } from "../../Editing/Editor";
import { DMEditingStatus } from "../../Editing/Exception";

describe("Formats tests", () => {
  let testEditor: SchemaContextEditor;
  let testKey: SchemaKey;
  let context: SchemaContext;

  beforeEach(async () => {
    context = new SchemaContext();
    testEditor = new SchemaContextEditor(context);
    testKey = await testEditor.createSchema("testSchema", "test", 1, 0, 0);
  });

  it("should create a valid Format", async () => {
    const result = await testEditor.formats.create(testKey, "testFormat", FormatType.Decimal, "testLabel");
    const format = await testEditor.schemaContext.getSchemaItem(result) as Format;
    expect(format.fullName).to.eql("testSchema.testFormat");
    expect(format.label).to.eql("testLabel");
  });

  it("create Format with invalid type for units, throws", async () => {
    const entityResult = await testEditor.entities.create(testKey, "testEntity", DMClassModifier.None);
    await expect(testEditor.formats.create(testKey, "testFormat", FormatType.Decimal, "testLabel", [entityResult])).to.be.eventually.rejected.then(function (error) {
      expect(error).to.have.property("errorNumber", DMEditingStatus.CreateSchemaItemFailed);
      expect(error).to.have.nested.property("innerError.message", `The specified Format unit ${entityResult.fullName} is not of type Unit or InvertedUnit`);
      expect(error).to.have.nested.property("innerError.errorNumber", DMEditingStatus.InvalidFormatUnitsSpecified);
    });
  });

  it("should create a valid Format from FormatProps", async () => {
    const formatProps = {
      name: "testFormat",
      type: "Station",
      precision: 5,
      roundFactor: 5,
      minWidth: 5,
      showSignOption: "noSign",
      formatTraits: "KeepDecimalPoint",
      decimalSeparator: ",",
      thousandSeparator: ",",
      uomSeparator: "",
      scientificType: "",
      stationOffsetSize: 4,
      stationSeparator: "",
    };

    const result = await testEditor.formats.createFromProps(testKey, formatProps);
    const format = await testEditor.schemaContext.getSchemaItem(result) as Format;
    expect(format?.fullName).to.eql("testSchema.testFormat");
    expect(format?.decimalSeparator).to.eql(",");
    expect(format?.stationOffsetSize).to.eql(4);
    expect(format?.formatTraits).to.eql(FormatTraits.KeepDecimalPoint);
  });

  it("try creating format in unknown schema, throws error", async () => {
    const badKey = new SchemaKey("unknownSchema", new DMVersion(1,0,0));
    await expect(testEditor.formats.create(badKey, "testFormat", FormatType.Decimal, "testLabel")).to.be.eventually.rejected.then(function (error) {
      expect(error).to.have.property("errorNumber", DMEditingStatus.CreateSchemaItemFailed);
      expect(error).to.have.nested.property("innerError.message", `Schema Key ${badKey.toString(true)} could not be found in the context.`);
      expect(error).to.have.nested.property("innerError.errorNumber", DMEditingStatus.SchemaNotFound);
    });
  });

  it("try creating format with existing name, throws error", async () => {
    await testEditor.formats.create(testKey, "testFormat", FormatType.Decimal, "testLabel");
    await expect(testEditor.formats.create(testKey, "testFormat", FormatType.Decimal, "testLabel")).to.be.eventually.rejected.then(function (error) {
      expect(error).to.have.property("errorNumber", DMEditingStatus.CreateSchemaItemFailed);
      expect(error).to.have.nested.property("innerError.message", `Format testSchema.testFormat already exists in the schema ${testKey.name}.`);
      expect(error).to.have.nested.property("innerError.errorNumber", DMEditingStatus.SchemaItemNameAlreadyExists);
    });
  });
  // TODO: Add test when units are given (needs the unit editing to be created.)
});
