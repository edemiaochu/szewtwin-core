/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect, use } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as path from "path";
import * as DM from "@szewtwin/dmschema-metadata";
import { FileSchemaKey } from "../SchemaFileLocater";
import { StubSchemaXmlFileLocater } from "../StubSchemaXmlFileLocater";
import * as fs from "fs";

use(chaiAsPromised);

describe("StubSchemaXmlFileLocater tests:", () => {
  let locater: StubSchemaXmlFileLocater;
  let context: DM.SchemaContext;

  beforeEach(() => {
    locater = new StubSchemaXmlFileLocater();
    locater.addSchemaSearchPath(path.join(__dirname, "assets"));
    context = new DM.SchemaContext();
    context.addLocater(locater);
  });

  it("loadSchema, schema text not provided, schema loaded successfully", async () => {
    const schemaPath = path.join(__dirname, "assets", "SchemaA.02.00.02.dmschema.xml");
    const schemaKey = new FileSchemaKey(new DM.SchemaKey("SchemaA", 2, 0, 2), schemaPath);
    schemaKey.schemaText = fs.readFileSync(schemaPath, "utf-8");
    const schema = locater.loadSchema(schemaPath);
    expect(schema).is.not.undefined;
    expect(schema.schemaKey).to.deep.equal(schemaKey);
  });

  it("loadSchema, schema text provided, schema loaded successfully", async () => {
    const schemaPath = path.join(__dirname, "assets", "SchemaA.02.00.02.dmschema.xml");
    const schemaText = fs.readFileSync(schemaPath, "utf-8");
    const schemaKey = new FileSchemaKey(new DM.SchemaKey("SchemaA", 2, 0, 2), schemaPath);
    schemaKey.schemaText = schemaText;

    const schema = locater.loadSchema(schemaPath, schemaText);
    expect(schema).is.not.undefined;
    expect(schema.schemaKey).to.deep.equal(schemaKey);
  });

  it("loadSchema, schema can't be found, throws", async () => {
    const schemaPath = path.join(__dirname, "assets", "DoesNotExist.01.00.00.dmschema.xml");
    expect(() => locater.loadSchema(schemaPath)).to.throw(Error, `ENOENT: no such file or directory, open '${schemaPath}'`);
  });

  it("locate valid schema with multiple references", async () => {
    const schemaKey = new DM.SchemaKey("SchemaA", 1, 1, 1);
    const schema = await context.getSchema(schemaKey, DM.SchemaMatchType.Exact);

    expect(schema).is.not.undefined;
    expect(schema!.name).to.equal("SchemaA");
    expect(schema!.schemaKey.version.toString()).to.equal("01.01.01");
  });

  it("locate valid schema with multiple references synchronously", () => {
    const schemaKey = new DM.SchemaKey("SchemaA", 1, 1, 1);
    const schema = context.getSchemaSync(schemaKey, DM.SchemaMatchType.Exact);

    expect(schema).is.not.undefined;
    expect(schema!.name).to.equal("SchemaA");
    expect(schema!.schemaKey.version.toString()).to.equal("01.01.01");
  });

  it("getSchema called multiple times for same schema", async () => {
    const schemaKey = new DM.SchemaKey("SchemaD", 4, 4, 4);

    const locater1 = await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, new DM.SchemaContext());
    const locater2 = await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, new DM.SchemaContext());
    const context1 = await context.getSchema(schemaKey, DM.SchemaMatchType.Exact);
    const context2 = await context.getSchema(schemaKey, DM.SchemaMatchType.Exact);

    // locater should not cache, but context should cache
    expect(locater1).not.equal(locater2);
    expect(locater1).not.equal(context1);
    expect(context1).to.equal(context2);
  });

  it("getSchema which does not exist, returns undefined", async () => {
    const schemaKey = new DM.SchemaKey("DoesNotExist");
    expect(await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, context)).to.be.undefined;
  });

  it("getSchema, full version, succeeds", async () => {
    const stub = await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 1), DM.SchemaMatchType.Exact, context);
    expect(stub).is.not.undefined;
    const key = stub!.schemaKey as FileSchemaKey;
    expect(key.name).to.equal("SchemaA");
    expect(key.version.toString()).to.equal("01.01.01");
  });

  it("getSchema, reference does not exist, throws.", async () => {
    const schemaKey = new DM.SchemaKey("RefDoesNotExist", 1, 1, 1);
    await expect(locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, context)).to.be.rejectedWith(DM.DMSchemaError, "Unable to locate referenced schema: DoesNotExist.3.3.3");
  });

  it("getSchema, references set", async () => {
    const schemaA = await context.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 1), DM.SchemaMatchType.Exact);
    const schemaB = await context.getSchema(new DM.SchemaKey("SchemaB", 2, 2, 2), DM.SchemaMatchType.Exact);
    const schemaC = await context.getSchema(new DM.SchemaKey("SchemaC", 3, 3, 3), DM.SchemaMatchType.Exact);
    const schemaD = await context.getSchema(new DM.SchemaKey("SchemaD", 4, 4, 4), DM.SchemaMatchType.Exact);

    expect(schemaA).is.not.undefined;
    expect(schemaA!.references.length).to.equal(2);
    expect(schemaA!.references[0]).to.deep.equal(schemaC);
    expect(schemaA!.references[1]).to.deep.equal(schemaB);
    expect(schemaA!.references[0].references[0]).to.deep.equal(schemaD);
    expect(schemaA!.references[1].references[0]).to.deep.equal(schemaC);
    expect(schemaA!.references[1].references[1]).to.deep.equal(schemaD);
  });

  it("getSchema, exact version, wrong minor, fails", async () => {
    expect(await context.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 2), DM.SchemaMatchType.Exact)).to.be.undefined;
  });

  it("getSchema, latest, succeeds", async () => {
    const stub = await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 0), DM.SchemaMatchType.Latest, context);

    expect(stub).is.not.undefined;
    expect(stub!.schemaKey.name).to.equal("SchemaA");
    expect(stub!.schemaKey.version.toString()).to.equal("02.00.02");
  });

  it("getSchema, latest write compatible, succeeds", async () => {
    const stub = await context.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 0), DM.SchemaMatchType.LatestWriteCompatible);

    expect(stub).is.not.undefined;
    expect(stub!.schemaKey.name).to.equal("SchemaA");
    expect(stub!.schemaKey.version.toString()).to.equal("01.01.01");
  });

  it("getSchema, latest write compatible, write version wrong, fails", async () => {
    expect(await context.getSchema(new DM.SchemaKey("SchemaA", 1, 2, 0), DM.SchemaMatchType.LatestWriteCompatible)).to.be.undefined;
  });

  it("getSchema, latest read compatible, succeeds", async () => {
    const stub = await context.getSchema(new DM.SchemaKey("SchemaA", 1, 0, 0), DM.SchemaMatchType.LatestReadCompatible);

    expect(stub).is.not.undefined;
    expect(stub!.schemaKey.name).to.equal("SchemaA");
    expect(stub!.schemaKey.version.toString()).to.equal("01.01.01");
  });

  it("getSchema, latest read compatible, read version wrong, fails", async () => {
    expect(await context.getSchema(new DM.SchemaKey("SchemaA", 2, 1, 1), DM.SchemaMatchType.LatestWriteCompatible)).to.be.undefined;
  });

  it("Schema XML has DM v2 nameSpacePrefix, alias set properly on deserialized schema.", async () => {
    const schema = await locater.getSchema(new DM.SchemaKey("ECv2Schema", 1, 0, 1), DM.SchemaMatchType.Exact, context);
    expect(schema!.alias).to.equal("v2");
  });

  it("sync - should ignore commented out schema references", () => {
    const stub = context.getSchemaSync(new DM.SchemaKey("RefCommentedOut", 1, 1, 1), DM.SchemaMatchType.LatestReadCompatible);

    expect(stub).is.not.undefined;
    expect(stub!.schemaKey.name).to.equal("RefCommentedOut");
    expect(stub!.schemaKey.version.toString()).to.equal("01.01.01");
  });

  it("async - should ignore commented out schema references", async () => {
    const stub = await context.getSchema(new DM.SchemaKey("RefCommentedOut", 1, 1, 1), DM.SchemaMatchType.LatestReadCompatible);

    expect(stub).is.not.undefined;
    expect(stub!.schemaKey.name).to.equal("RefCommentedOut");
    expect(stub!.schemaKey.version.toString()).to.equal("01.01.01");
  });

  it("getSchemaKey, valid version and name, succeeds", () => {
    const schemaXml = `<DMSchema schemaName="SchemaA" version="1.1.1"> </DMSchema>`;
    const key = locater.getSchemaKey(schemaXml);
    expect(key).to.deep.equal(new DM.SchemaKey("SchemaA", new DM.DMVersion(1, 1, 1)));
  });
  it("getSchemaKey, invalid xml, throws", () => {
    const schemaXml = `<DMSchemaBad schemaName="SchemaA" version="1.1.1"> </DMSchemaBad>`;
    expect(() => locater.getSchemaKey(schemaXml)).to.throw(DM.DMSchemaError, `Could not find '<DMSchema>' tag in the given file`);
  });
  it("getSchemaKey, invalid schemaName attribute, throws", () => {
    const schemaXml = `<DMSchema schemaNameBad="SchemaA" version="1.1.1"> </DMSchema>`;
    expect(() => locater.getSchemaKey(schemaXml)).to.throw(DM.DMSchemaError, `Could not find the DMSchema 'schemaName' or 'version' tag in the given file`);
  });
  it("getSchemaKey, invalid schemaName, throws", () => {
    const schemaXml = `<DMSchema version="1.1.1" schemaName=""> </DMSchema>`;
    expect(() => locater.getSchemaKey(schemaXml)).to.throw(DM.DMSchemaError, `Could not find the DMSchema 'schemaName' or 'version' tag in the given file`);
  });
  it("getSchemaKey, invalid version attribute, throws", () => {
    const schemaXml = `<DMSchema schemaName="SchemaA" versionBad="1.1.1"> </DMSchema>`;
    expect(() => locater.getSchemaKey(schemaXml)).to.throw(DM.DMSchemaError, `Could not find the DMSchema 'schemaName' or 'version' tag in the given file`);
  });
  it("getSchemaKey, invalid version, throws", () => {
    const schemaXml = `<DMSchema schemaName="SchemaA" version=""> </DMSchema>`;
    expect(() => locater.getSchemaKey(schemaXml)).to.throw(DM.DMSchemaError, `Could not find the DMSchema 'schemaName' or 'version' tag in the given file`);
  });
  it("getSchemaKey, ECv2 schema, valid version set", () => {
    const schemaXml = `<DMSchema schemaName="ECv2Schema" version="1.1" nameSpacePrefix="v2" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.2.0"> </DMSchema>`;
    const key = locater.getSchemaKey(schemaXml);
    expect(key).to.deep.equal(new DM.SchemaKey("ECv2Schema", new DM.DMVersion(1, 0, 1)));
  });
});
