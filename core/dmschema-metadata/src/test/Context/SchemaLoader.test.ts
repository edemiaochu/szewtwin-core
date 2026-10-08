/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, describe, it } from "vitest";
import { SchemaLoader } from "../../SchemaLoader";
import { DMSchemaError } from "../../Exception";
import { DMSchemaNamespaceUris } from "../../Constants";

describe("SchemaLoader", () => {

  const getSchemaProps = (schemaName: string) => {
    if (schemaName === "SchemaD") {
      return {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        alias: "d",
        description: "This is a test Schema.",
        label: "SchemaD",
        name: "SchemaD",
        version: "04.04.04",
      };
    } else {
      return undefined;
    }
  };

  it("should load a known DM Schema by name", () => {
    const schemaLoader = new SchemaLoader(getSchemaProps);
    const schema = schemaLoader.getSchema("SchemaD");
    assert.isDefined(schema);
    assert.equal(schema.name, "SchemaD");
  });

  it("load unknown DM Schema by name should throw NotFound DMSchemaError", () => {
    const schemaLoader = new SchemaLoader(getSchemaProps);
    assert.throws(() => schemaLoader.getSchema("DoesNotExist"), DMSchemaError);
  });

  it("try load unknown DM Schema by name should return undefined", () => {
    const schemaLoader = new SchemaLoader(getSchemaProps);
    const schema = schemaLoader.tryGetSchema("DoesNotExist");
    assert.isUndefined(schema);
  });
});
