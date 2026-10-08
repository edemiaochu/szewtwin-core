/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { DMVersion, Schema, SchemaContext, SchemaJsonLocater, SchemaKey, SchemaMatchType } from "@szewtwin/dmschema-metadata";
import { SchemaJsonFileLocater } from "../SchemaJsonFileLocater";

describe("Concurrent schema JSON deserialization", () => {
  const assetDir: string = path.join(__dirname, "assets");
  const schemaFolder = path.join(__dirname, "assets", "json");

  const schemaKeys: SchemaKey[] = [];
  let context: SchemaContext;
  let contextSync: SchemaContext;
  let syncSchemas: Array<Schema | undefined> = [];

  const locater = new SchemaJsonFileLocater();

  before(() => {
    if (!fs.existsSync(assetDir))
      fs.mkdirSync(assetDir);
    if (!fs.existsSync(schemaFolder))
      fs.mkdirSync(schemaFolder);

    copySchemasToAssetsDir();

    // Deserialize schemas synchronously/serially as standard to compare to
    contextSync = new SchemaContext();
    locater.addSchemaSearchPath(schemaFolder);
    contextSync.addLocater(locater);

    const schemaFiles = fs.readdirSync(schemaFolder);
    schemaFiles.forEach((fileName) => {
      const schemaFile = path.join(schemaFolder, fileName);
      const schemaJson = JSON.parse(fs.readFileSync(schemaFile, "utf-8"));
      const schemaName = schemaJson.name;
      const schemaVersion = schemaJson.version;

      const key = new SchemaKey(schemaName.toString(), DMVersion.fromString(schemaVersion.toString()));
      schemaKeys.push(key);
    });

    syncSchemas = schemaKeys.map((key): Schema | undefined => {
      if (!key)
        return undefined;

      const schema = contextSync.getSchemaSync(key, SchemaMatchType.Latest);
      return schema;
    });
  });

  beforeEach(() => {
    context = new SchemaContext();
    context.addLocater(locater);
  });

  function getSchemaPathFromPackage(packageName: string, schemaFileName: string): string {
    const schemaFile = path.join(__dirname, "..", "..", "..", "node_modules", "@szewec", packageName, schemaFileName);
    return schemaFile;
  }

  function copySchemasToAssetsDir() {
    // Copy Schemas that we need for testing
    fs.copyFileSync(getSchemaPathFromPackage("aec-units-schema", "AecUnits.dmschema.json"), path.join(schemaFolder, "AecUnits.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("architectural-physical-schema", "ArchitecturalPhysical.dmschema.json"), path.join(schemaFolder, "ArchitecturalPhysical.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("bis-core-schema", "BisCore.dmschema.json"), path.join(schemaFolder, "BisCore.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("bis-custom-attributes-schema", "BisCustomAttributes.dmschema.json"), path.join(schemaFolder, "BisCustomAttributes.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("construction-schema", "Construction.dmschema.json"), path.join(schemaFolder, "Construction.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("core-custom-attributes-schema", "CoreCustomAttributes.dmschema.json"), path.join(schemaFolder, "CoreCustomAttributes.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("dmdb-map-schema", "DMDbMap.dmschema.json"), path.join(schemaFolder, "DMDbMap.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("dmdb-schema-policies-schema", "DMDbSchemaPolicies.dmschema.json"), path.join(schemaFolder, "DMDbSchemaPolicies.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("formats-schema", "Formats.dmschema.json"), path.join(schemaFolder, "Formats.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("linear-referencing-schema", "LinearReferencing.dmschema.json"), path.join(schemaFolder, "LinearReferencing.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("physical-material-schema", "PhysicalMaterial.dmschema.json"), path.join(schemaFolder, "PhysicalMaterial.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("plant-custom-attributes-schema", "PlantCustomAttributes.dmschema.json"), path.join(schemaFolder, "PlantCustomAttributes.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("quantity-takeoffs-aspects-schema", "QuantityTakeoffsAspects.dmschema.json"), path.join(schemaFolder, "QuantityTakeoffsAspects.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("spatial-composition-schema", "SpatialComposition.dmschema.json"), path.join(schemaFolder, "SpatialComposition.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("structural-physical-schema", "StructuralPhysical.dmschema.json"), path.join(schemaFolder, "StructuralPhysical.dmschema.json"));
    fs.copyFileSync(getSchemaPathFromPackage("units-schema", "Units.dmschema.json"), path.join(schemaFolder, "Units.dmschema.json"));
  }

  it("should match schemas deserialized concurrently with schemas deserialized serially", async () => {
    const schemaPromises = schemaKeys.map(async (key): Promise<Schema | undefined> => {
      if (!key)
        return undefined;

      const schema = await context.getSchema(key, SchemaMatchType.Latest);
      return schema;
    });
    const asyncSchemas = await Promise.all(schemaPromises);

    for (let i = 0; i < schemaKeys.length; i++) {
      const syncSchema = syncSchemas[i];
      expect(syncSchema).not.to.be.undefined;
      const syncJSON = syncSchema!.toJSON();

      const asyncSchema = asyncSchemas[i];
      expect(asyncSchema).not.to.be.undefined;
      const asyncJSON = asyncSchema!.toJSON();
      expect(asyncJSON).to.deep.equal(syncJSON);
    }
  });

  it("should be able to mix getSchema and getSchemaSync", async () => {
    const schemaPromises = schemaKeys.map(async (key, index): Promise<Schema | undefined> => {
      if (index % 2 === 0) {
        // Use getSchema() for even indices
        if (!key)
          return undefined;

        const schema = await context.getSchema(key, SchemaMatchType.Latest);
        return schema;
      } else {
        // Use getSchemaSync() for odd indices
        if (!key)
          return undefined;

        const schema = context.getSchemaSync(key, SchemaMatchType.Latest);
        return schema;
      }
    });
    const schemas = await Promise.all(schemaPromises);

    for (let i = 0; i < schemaKeys.length; i++) {
      const syncSchema = syncSchemas[i];
      expect(syncSchema).not.to.be.undefined;
      const syncJSON = syncSchema!.toJSON();

      const schema = schemas[i];
      expect(schema).not.to.be.undefined;
      const schemaJSON = schema!.toJSON();
      expect(schemaJSON).to.deep.equal(syncJSON);
    }
  });

  /* Run these tests below one at a time. Running them together doesn't get accurate performance likely bc of disk access caching */
  it.skip("should measure regular deserialization performance", async () => {
    const schemaPromises = schemaKeys.map(async (key): Promise<Schema | undefined> => {
      if (!key)
        return undefined;

      const schema = await context.getSchema(key, SchemaMatchType.Latest);
      return schema;
    });

    for (const promise of schemaPromises) {
      await promise;
    }

    expect(schemaPromises.length).to.equal(schemaKeys.length);
  });

  it.skip("should measure concurrent deserialization performance", async () => {
    const schemaPromises = schemaKeys.map(async (key): Promise<Schema | undefined> => {
      if (!key)
        return undefined;

      const schema = await context.getSchema(key, SchemaMatchType.Latest);
      return schema;
    });
    const asyncSchemas = await Promise.all(schemaPromises);

    expect(asyncSchemas.length).to.equal(schemaKeys.length);
  });

  it("Concurrently get BisCore with SchemaJsonFileLocater", async () => {
    const schemaContext = new SchemaContext();
    const jsonFileLocater = new SchemaJsonFileLocater();
    jsonFileLocater.addSchemaSearchPath(schemaFolder);
    schemaContext.addLocater(jsonFileLocater);

    const schemas = await Promise.all(
      [...Array(100).keys()].map(async () => {
        return schemaContext.getSchema(new SchemaKey("BisCore"));
      }),
    );
    expect(schemas.length).to.equal(100);
    schemas.forEach((schema) => {
      assert(schema !== undefined);
      expect(schema.fullName).to.equal("BisCore");
    });
  });

  it("Concurrently get a schema and it's referenced schema with SchemaJsonFileLocater", async () => {
    const schemaContext = new SchemaContext();
    const jsonFileLocater = new SchemaJsonFileLocater();
    jsonFileLocater.addSchemaSearchPath(schemaFolder);
    schemaContext.addLocater(jsonFileLocater);

    let getBisCoreFirst = 0;
    const schemas = await Promise.all(
      [...Array(2).keys()].map(async () => {
        if (getBisCoreFirst === 0) {
          getBisCoreFirst = 1;
          return schemaContext.getSchema(new SchemaKey("BisCore"));
        }
        return schemaContext.getSchema(new SchemaKey("CoreCustomAttributes"));
      }),
    );
    expect(schemas.length).to.equal(2);
    schemas.forEach((schema) => {
      expect(schema).to.not.be.undefined;
    });
  });

  const getSchemaProps = (schemaName: string) => {
    if (schemaName === "BisCore") {
      return {
        $schema: "https://dev.szewec.com/json_schemas/dm/32/dmschema",
        alias: "bis",
        description: "The BIS core schema contains classes that all other domain schemas extend.",
        label: "BIS Core",
        name: "BisCore",
        version: "01.00.15",
        references:[{name:"CoreCustomAttributes", version:"01.00.04"},{name:"DMDbMap", version:"02.00.00"},{name:"DMDbSchemaPolicies", version:"01.00.00"}],
      };
    }
    if (schemaName === "CoreCustomAttributes") {
      return {
        $schema: "https://dev.szewec.com/json_schemas/dm/32/dmschema",
        alias: "CoreCA",
        description: "Custom attributes to indicate core DM concepts, may include struct classes intended for use in core custom attributes.",
        label: "Core Custom Attributes",
        name: "CoreCustomAttributes",
        version: "01.00.04",
      };
    }
    if (schemaName === "DMDbMap") {
      return {
        $schema: "https://dev.szewec.com/json_schemas/dm/32/dmschema",
        alias: "DMDbMap",
        description: "DMDbMap Desc",
        label: "DMDbMap",
        name: "DMDbMap",
        version: "02.00.00",
      };
    }
    if (schemaName === "DMDbSchemaPolicies") {
      return {
        $schema: "https://dev.szewec.com/json_schemas/dm/32/dmschema",
        alias: "DMDbSchemaPolicies",
        description: "DMDbSchemaPolicies Desc",
        label: "DMDbSchemaPolicies",
        name: "DMDbSchemaPolicies",
        version: "01.00.00",
      };
    }

    return undefined;
  };

  it("Concurrently get BisCore with SchemaJsonLocater", async () => {
    const schemaContext = new SchemaContext();
    const jsonLocater = new SchemaJsonLocater(getSchemaProps);
    schemaContext.addLocater(jsonLocater);

    const schemaCount = 1000;
    const schemas = await Promise.all(
      [...Array(schemaCount).keys()].map(async () => {
        return schemaContext.getSchema(new SchemaKey("BisCore"));
      }),
    );
    expect(schemas.length).to.equal(schemaCount);
    schemas.forEach((schema) => {
      assert(schema !== undefined);
      expect(schema.fullName).to.equal("BisCore");
    });
  });

  it("Concurrently get a schema and it's referenced schema with SchemaJsonLocater", async () => {
    const schemaContext = new SchemaContext();
    const jsonLocater = new SchemaJsonLocater(getSchemaProps);
    schemaContext.addLocater(jsonLocater);

    let getBisCoreFirst = 0;
    const schemaCount = 1000;
    const schemas = await Promise.all(
      [...Array(schemaCount).keys()].map(async () => {
        if (getBisCoreFirst === 0) {
          getBisCoreFirst = 1;
          return schemaContext.getSchema(new SchemaKey("BisCore"));
        }
        return schemaContext.getSchema(new SchemaKey("CoreCustomAttributes"));
      }),
    );
    expect(schemas.length).to.equal(schemaCount);
    schemas.forEach((schema) => {
      expect(schema).to.not.be.undefined;
    });
  });
});
