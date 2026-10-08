/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SchemaContext } from "../../Context";
import { SchemaItemType } from "../../DMObjects";
import { Schema } from "../../Metadata/Schema";
import { UnitSystem } from "../../Metadata/UnitSystem";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";
import { DMSchemaNamespaceUris } from "../../Constants";

/* eslint-disable @typescript-eslint/naming-convention */

describe("UnitSystem tests", () => {
  let testUnitSystem: UnitSystem;

  describe("SchemaItemType", () => {
    const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
    testUnitSystem = new UnitSystem(schema, "Test");
    it("should return correct item type and string", () => {
      expect(testUnitSystem.schemaItemType).toEqual(SchemaItemType.UnitSystem);
      expect(testUnitSystem.schemaItemType).toEqual("UnitSystem");
    });
  });

  it("should get fullName", async () => {
    const schemaJson = {
      $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
      name: "TestSchema",
      version: "1.2.3",
      alias: "ts",
      items: {
        testUnitSystem: {
          schemaItemType: "UnitSystem",
          name: "IMPERIAL",
          label: "Imperial",
        },
      },
    };

    const schema = await Schema.fromJson(schemaJson, new SchemaContext());
    assert.isDefined(schema);
    const unitSystem = await schema.getItem("testUnitSystem", UnitSystem);
    assert.isDefined(unitSystem);
    expect(unitSystem!.fullName).eq("TestSchema.testUnitSystem");
  });

  describe("type safety checks", () => {
    const typeCheckJson = createSchemaJsonWithItems({
      TestUnitSystem: {
        schemaItemType: "UnitSystem",
        label: "Test Unit System",
        description: "Used for testing",
      },
      TestPhenomenon: {
        schemaItemType: "Phenomenon",
        definition: "LENGTH(1)",
      },
    });

    let dmSchema: Schema;

    beforeAll(async () => {
      dmSchema = await Schema.fromJson(typeCheckJson, new SchemaContext());
      assert.isDefined(dmSchema);
    });

    it("typeguard and type assertion should work on UnitSystem", async () => {
      const item = await dmSchema.getItem("TestUnitSystem");
      assert.isDefined(item);
      expect(UnitSystem.isUnitSystem(item)).to.be.true;
      expect(() => UnitSystem.assertIsUnitSystem(item)).not.to.throw();
      // verify against other schema item type
      const testPhenomenon = await dmSchema.getItem("TestPhenomenon");
      assert.isDefined(testPhenomenon);
      expect(UnitSystem.isUnitSystem(testPhenomenon)).to.be.false;
      expect(() => UnitSystem.assertIsUnitSystem(testPhenomenon)).to.throw();
    });

    it("UnitSystem type should work with getItem/Sync", async () => {
      expect(await dmSchema.getItem("TestUnitSystem", UnitSystem)).to.be.instanceof(UnitSystem);
      expect(dmSchema.getItemSync("TestUnitSystem", UnitSystem)).to.be.instanceof(UnitSystem);
    });

    it("UnitSystem type should reject for other item types on getItem/Sync", async () => {
      expect(await dmSchema.getItem("TestPhenomenon", UnitSystem)).to.be.undefined;
      expect(dmSchema.getItemSync("TestPhenomenon", UnitSystem)).to.be.undefined;
    });
  });

  describe("Async fromJson", () => {
    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "ExampleSchema", "es", 1, 0, 0);
      testUnitSystem = new UnitSystem(schema, "IMPERIAL");
    });
    it("Basic test", async () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAITEMURL3_2,
        schemaItemType: "UnitSystem",
        name: "IMPERIAL",
        label: "Imperial",
      };
      await testUnitSystem.fromJSON(json);
      expect(testUnitSystem.label).toEqual("Imperial");
      expect(testUnitSystem.description).toBeUndefined();
    });

    describe("Sync fromJson", () => {
      beforeEach(() => {
        const schema = new Schema(new SchemaContext(), "ExampleSchema", "es", 1, 0, 0);
        testUnitSystem = new UnitSystem(schema, "IMPERIAL");
      });
      it("Basic test", () => {
        const json = {
          $schema: DMSchemaNamespaceUris.SCHEMAITEMURL3_2,
          schemaItemType: "UnitSystem",
          name: "IMPERIAL",
          label: "Imperial",
        };
        testUnitSystem.fromJSONSync(json);
        expect(testUnitSystem.label).toEqual("Imperial");
        expect(testUnitSystem.description).toBeUndefined();
      });
    });
  });
});
