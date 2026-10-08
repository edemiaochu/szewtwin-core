/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "path";
import * as DM from "@szewtwin/dmschema-metadata";
import { FileSchemaKey } from "../SchemaFileLocater";
import { SchemaJsonFileLocater } from "../SchemaJsonFileLocater";

describe("SchemaJsonFileLocater tests: ", () => {
  let locater: SchemaJsonFileLocater;
  let context: DM.SchemaContext;

  beforeEach(() => {
    locater = new SchemaJsonFileLocater();

    locater.addSchemaSearchPath(path.join(__dirname, "assets"));
    context = new DM.SchemaContext();
    context.addLocater(locater);
  });

  it("locate valid schema with multiple references", async () => {
    const schemaKey = new DM.SchemaKey("SchemaA", 1, 1, 1);
    const schema = await context.getSchema(schemaKey, DM.SchemaMatchType.Exact);

    assert.isDefined(schema);
    assert.strictEqual(schema!.schemaKey.name, "SchemaA");
    assert.strictEqual(schema!.schemaKey.version.toString(), "01.01.01");
  });

  it("locate valid schema with multiple references synchronously", () => {
    const schemaKey = new DM.SchemaKey("SchemaA", 1, 1, 1);
    const schema = context.getSchemaSync(schemaKey, DM.SchemaMatchType.Exact);

    assert.isDefined(schema);
    assert.strictEqual(schema!.schemaKey.name, "SchemaA");
    assert.strictEqual(schema!.schemaKey.version.toString(), "01.01.01");
  });

  it("getSchema called multiple times for same schema", async () => {
    const schemaKey = new DM.SchemaKey("SchemaD", 4, 4, 4);

    const locater1 = await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, new DM.SchemaContext());
    const locater2 = await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, new DM.SchemaContext());
    const context1 = await context.getSchema(schemaKey, DM.SchemaMatchType.Exact);
    const context2 = await context.getSchema(schemaKey, DM.SchemaMatchType.Exact);

    // locater should not cache, but context should cache
    assert.notEqual(locater1, locater2);
    assert.notEqual(locater1, context1);
    assert.strictEqual(context1, context2);
  });

  it("getSchema called multiple times for same schema synchronously", () => {
    const schemaKey = new DM.SchemaKey("SchemaD", 4, 4, 4);

    const locater1 = locater.getSchemaSync(schemaKey, DM.SchemaMatchType.Exact, new DM.SchemaContext());
    const locater2 = locater.getSchemaSync(schemaKey, DM.SchemaMatchType.Exact, new DM.SchemaContext());
    const context1 = context.getSchemaSync(schemaKey, DM.SchemaMatchType.Exact);
    const context2 = context.getSchemaSync(schemaKey, DM.SchemaMatchType.Exact);

    // locater should not cache, but context should cache
    assert.notEqual(locater1, locater2);
    assert.notEqual(locater1, context1);
    assert.strictEqual(context1, context2);
  });

  it("getSchema which does not exist, returns undefined", async () => {
    const schemaKey = new DM.SchemaKey("DoesNotExist");
    const result = await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, context);
    assert.isUndefined(result);
  });

  it("loadSchema from file, bad schema name, throws", async () => {
    const schemaKey = new DM.SchemaKey("BadSchemaName");

    try {
      await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, context);
    } catch (e) {
      const error = e as DM.DMSchemaError;
      assert.strictEqual(error.errorNumber, DM.DMSchemaStatus.InvalidDMJson);
      return;
    }

    assert.fail(0, 1, "Expected DMObjects exception");
  });

  it("loadSchema from file, bad schema version, throws", async () => {
    const schemaKey = new DM.SchemaKey("BadSchemaVersion");

    try {
      await locater.getSchema(schemaKey, DM.SchemaMatchType.Exact, context);
    } catch (e) {
      const error = e as DM.DMSchemaError;
      assert.strictEqual(error.errorNumber, DM.DMSchemaStatus.InvalidDMJson);
      return;
    }

    assert.fail(0, 1, "Expected DMObjects exception");
  });

  it("getSchema, full version, succeeds", async () => {
    const stub = await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 1), DM.SchemaMatchType.Exact, context);

    assert.isDefined(stub);
    const key = stub!.schemaKey as FileSchemaKey;
    assert.strictEqual(key.name, "SchemaA");
    assert.strictEqual(key.version.toString(), "01.01.01");
  });

  it("getSchema, exact version, wrong minor, fails", async () => {
    assert.isUndefined(await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 2), DM.SchemaMatchType.Exact, context));
  });

  it("getSchema, latest, succeeds", async () => {
    const schema = await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 0), DM.SchemaMatchType.Latest, context);
    assert.isDefined(schema);
    assert.strictEqual(schema!.schemaKey.name, "SchemaA");
    assert.strictEqual(schema!.schemaKey.version.toString(), "02.00.02");
  });

  it("getSchema, latest write compatible, succeeds", async () => {
    const stub = await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 1, 0), DM.SchemaMatchType.LatestWriteCompatible, context);

    assert.isDefined(stub);
    assert.strictEqual(stub!.schemaKey.name, "SchemaA");
    assert.strictEqual(stub!.schemaKey.version.toString(), "01.01.01");
  });

  it("getSchema, latest write compatible, write version wrong, fails", async () => {
    assert.isUndefined(await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 2, 0), DM.SchemaMatchType.LatestWriteCompatible, context));
  });

  it("getSchema, latest read compatible, succeeds", async () => {
    const stub = await locater.getSchema(new DM.SchemaKey("SchemaA", 1, 0, 0), DM.SchemaMatchType.LatestReadCompatible, context);

    assert.isDefined(stub);
    assert.strictEqual(stub!.schemaKey.name, "SchemaA");
    assert.strictEqual(stub!.schemaKey.version.toString(), "01.01.01");
  });

  it("getSchema, latest read compatible, read version wrong, fails", async () => {
    assert.isUndefined(await locater.getSchema(new DM.SchemaKey("SchemaA", 2, 1, 1), DM.SchemaMatchType.LatestReadCompatible, context));
  });
});
