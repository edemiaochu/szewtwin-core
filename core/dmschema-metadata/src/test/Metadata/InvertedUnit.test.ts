/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from "vitest";
import { SchemaContext } from "../../Context";
import { SchemaItemType } from "../../DMObjects";
import { DMSchemaError } from "../../Exception";
import { InvertedUnit } from "../../Metadata/InvertedUnit";
import { Schema } from "../../Metadata/Schema";
import { Unit } from "../../Metadata/Unit";
import { UnitSystem } from "../../Metadata/UnitSystem";
import { expectAsyncToThrow } from "../TestUtils/AssertionHelpers";
import { createEmptyXmlDocument } from "../TestUtils/SerializationHelper";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";
import { DMSchemaNamespaceUris } from "../../Constants";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Inverted Unit tests", () => {
  let testUnit: InvertedUnit;

  describe("type safety checks", () => {
    const typeCheckJson = createSchemaJsonWithItems({
      TestInvertedUnit: {
        schemaItemType: "InvertedUnit",
        label: "Test Inverted Unit",
        unitSystem: "TestSchema.TestUnitSystem",
        invertsUnit: "TestSchema.TestUnit",
      },
      TestPhenomenon: {
        schemaItemType: "Phenomenon",
        definition: "LENGTH(1)",
      },
      TestUnitSystem: {
        schemaItemType: "UnitSystem",
        label: "Imperial",
        description: "Units of measure from the british imperial empire",
      },
      TestUnit: {
        schemaItemType: "Unit",
        phenomenon: "TestSchema.TestPhenomenon",
        unitSystem: "TestSchema.TestUnitSystem",
        definition: "Vert/Horizontal",
      },
    });

    let dmSchema: Schema;

    beforeEach(async () => {
      dmSchema = await Schema.fromJson(typeCheckJson, new SchemaContext());
      expect(dmSchema).toBeDefined();
    });

    it("typeguard and type assertion should work on InvertedUnit", async () => {
      const testInvertedUnit = await dmSchema.getItem("TestInvertedUnit");
      expect(testInvertedUnit);
      expect(InvertedUnit.isInvertedUnit(testInvertedUnit)).toBe(true);
      expect(() => InvertedUnit.assertIsInvertedUnit(testInvertedUnit)).not.toThrow();
      // verify against other schema item type
      const testPhenomenon = await dmSchema.getItem("TestPhenomenon");
      expect(testPhenomenon);
      expect(InvertedUnit.isInvertedUnit(testPhenomenon)).toBe(false);
      expect(() => InvertedUnit.assertIsInvertedUnit(testPhenomenon)).toThrow();
    });

    it("InvertedUnit type should work with getItem/Sync", async () => {
      expect(await dmSchema.getItem("TestInvertedUnit", InvertedUnit)).toBeInstanceOf(InvertedUnit);
      expect(dmSchema.getItemSync("TestInvertedUnit", InvertedUnit)).toBeInstanceOf(InvertedUnit);
    });

    it("InvertedUnit type should reject for other item types on getItem/Sync", async () => {
      expect(await dmSchema.getItem("TestPhenomenon", InvertedUnit)).toBeUndefined();
      expect(dmSchema.getItemSync("TestPhenomenon", InvertedUnit)).toBeUndefined();
    });
  });

  describe("SchemaItemType", () => {
    const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
    testUnit = new InvertedUnit(schema, "Test");
    it("should return correct item type and string", () => {
      expect(testUnit.schemaItemType, SchemaItemType.InvertedUnit);
      expect(testUnit.schemaItemType, "InvertedUnit");
    });
  });

  describe("Async fromJson", () => {
    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "HORIZONTAL_PER_VERTICAL");
    });

    it("Basic test for label", async () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const dmSchema = await Schema.fromJson(json, new SchemaContext());
      expect(dmSchema);
      const testItem = await dmSchema.getItem("HORIZONTAL_PER_VERTICAL");
      expect(testItem);
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      expect(testInvertedUnit.label, "Horizontal/Vertical");
    });
    it("Label and description are optional", async () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const dmSchema = await Schema.fromJson(json, new SchemaContext());
      expect(dmSchema);
      const testItem = await dmSchema.getItem("HORIZONTAL_PER_VERTICAL");
      expect(testItem);
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      expect(testInvertedUnit.unitSystem!.fullName, "TestSchema.INTERNATIONAL");
      expect(testInvertedUnit.invertsUnit!.fullName, "TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("unitSystem is required", async () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      await expectAsyncToThrow(async () => Schema.fromJson(json, new SchemaContext()), DMSchemaError, `The InvertedUnit TestSchema.HORIZONTAL_PER_VERTICAL does not have the required 'unitSystem' attribute.`);
    });
    it("Resolve all dependencies for inverts unit and unit system", async () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const dmSchema = await Schema.fromJson(json, new SchemaContext());
      expect(dmSchema);
      const testItem = await dmSchema.getItem("HORIZONTAL_PER_VERTICAL");
      expect(testItem);
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);

      const unitSysFromInvertedUnit = await testInvertedUnit.unitSystem;
      const invertsUnitFromInvertedUnit = await testInvertedUnit.invertsUnit;

      const testUnitSys = await dmSchema.getItem("INTERNATIONAL");
      expect(testUnitSys);
      expect(testUnitSys?.schemaItemType === SchemaItemType.UnitSystem);
      const testUnitSysItem: UnitSystem = testUnitSys as UnitSystem;
      expect(unitSysFromInvertedUnit!.description, testUnitSysItem.description);

      const testInvertsUnit = await dmSchema.getItem("VERTICAL_PER_HORIZONTAL");
      expect(testInvertsUnit);
      expect(testInvertsUnit?.schemaItemType === SchemaItemType.Unit);
      const testInvertsUnitItem: Unit = testInvertsUnit as Unit;
      expect(invertsUnitFromInvertedUnit!.definition, testInvertsUnitItem.definition);
    });
  });
  describe("Sync fromJson", () => {
    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "HORIZONTAL_PER_VERTICAL");
    });

    it("Basic test for label", () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const dmSchema = Schema.fromJsonSync(json, new SchemaContext());
      expect(dmSchema);
      const testItem = dmSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      expect(testItem);
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      expect(testInvertedUnit.label, "Horizontal/Vertical");
    });
    it("Label and description are optional", () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
            label: "Horizontal/Vertical",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const dmSchema = Schema.fromJsonSync(json, new SchemaContext());
      expect(dmSchema);
      const testItem = dmSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      expect(testItem);
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      expect(testInvertedUnit.unitSystem!.fullName, "TestSchema.INTERNATIONAL");
      expect(testInvertedUnit.invertsUnit!.fullName, "TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("Resolve all dependencies for inverts unit and unit system", async () => {
      const json = {
        $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
        version: "1.0.0",
        name: "TestSchema",
        alias: "ts",
        items: {
          HORIZONTAL_PER_VERTICAL: {
            schemaItemType: "InvertedUnit",
            unitSystem: "TestSchema.INTERNATIONAL",
            invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
          },
          INTERNATIONAL: {
            schemaItemType: "UnitSystem",
            label: "Imperial",
            description: "Units of measure from the british imperial empire",
          },
          VERTICAL_PER_HORIZONTAL: {
            schemaItemType: "Unit",
            phenomenon: "TestSchema.Length",
            unitSystem: "TestSchema.INTERNATIONAL",
            definition: "Vert/Horizontal",
          },
          Length: {
            schemaItemType: "Phenomenon",
            definition: "TestSchema.Length",
          },
        },
      };
      const dmSchema = Schema.fromJsonSync(json, new SchemaContext());
      expect(dmSchema);
      const testItem = dmSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      expect(testItem);
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);

      const unitSysFromInvertedUnit = await testInvertedUnit.unitSystem;
      const invertsUnitFromInvertedUnit = await testInvertedUnit.invertsUnit;

      const testUnitSys = dmSchema.getItemSync("INTERNATIONAL");
      expect(testUnitSys);
      expect(testUnitSys?.schemaItemType === SchemaItemType.UnitSystem);
      const testUnitSysItem: UnitSystem = testUnitSys as UnitSystem;
      expect(unitSysFromInvertedUnit!.description, testUnitSysItem.description);

      const testInvertsUnit = await dmSchema.getItem("VERTICAL_PER_HORIZONTAL");
      expect(testInvertsUnit);
      expect(testInvertsUnit?.schemaItemType === SchemaItemType.Unit);
      const testInvertsUnitItem: Unit = testInvertsUnit as Unit;
      expect(invertsUnitFromInvertedUnit!.definition, testInvertsUnitItem.definition);
    });
  });

  describe("toJSON", () => {
    beforeEach(() => {
      const schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      testUnit = new InvertedUnit(schema, "HORIZONTAL_PER_VERTICAL");
    });

    const jsonOne = {
      $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
      version: "1.0.0",
      name: "TestSchema",
      alias: "ts",
      items: {
        HORIZONTAL_PER_VERTICAL: {
          schemaItemType: "InvertedUnit",
          unitSystem: "TestSchema.INTERNATIONAL",
          invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
        },
        INTERNATIONAL: {
          schemaItemType: "UnitSystem",
          label: "Imperial",
          description: "Units of measure from the british imperial empire",
        },
        VERTICAL_PER_HORIZONTAL: {
          schemaItemType: "Unit",
          phenomenon: "TestSchema.Length",
          unitSystem: "TestSchema.INTERNATIONAL",
          definition: "Vert/Horizontal",
        },
        Length: {
          schemaItemType: "Phenomenon",
          definition: "TestSchema.Length",
        },
      },
    };
    it("async- Serialization of fully defined inverted unit", async () => {
      const dmSchema = await Schema.fromJson(jsonOne, new SchemaContext());
      expect(dmSchema);
      const testItem = await dmSchema.getItem("HORIZONTAL_PER_VERTICAL");
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      const invertedUnitSerialization = testInvertedUnit.toJSON(true, true);
      expect(invertedUnitSerialization.unitSystem).toEqual("TestSchema.INTERNATIONAL");
      expect(invertedUnitSerialization.invertsUnit).toEqual("TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("sync- Serialization of fully defined inverted unit", () => {
      const dmSchema = Schema.fromJsonSync(jsonOne, new SchemaContext());
      expect(dmSchema);
      const testItem = dmSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      const invertedUnitSerialization = testInvertedUnit.toJSON(true, true);
      expect(invertedUnitSerialization.unitSystem).toEqual("TestSchema.INTERNATIONAL");
      expect(invertedUnitSerialization.invertsUnit).toEqual("TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("async- JSON stringify serialization of fully defined inverted unit", async () => {
      const dmSchema = await Schema.fromJson(jsonOne, new SchemaContext());
      expect(dmSchema);
      const testItem = await dmSchema.getItem("HORIZONTAL_PER_VERTICAL");
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      const json = JSON.stringify(testInvertedUnit);
      const invertedUnitSerialization = JSON.parse(json);
      expect(invertedUnitSerialization.unitSystem).toEqual("TestSchema.INTERNATIONAL");
      expect(invertedUnitSerialization.invertsUnit).toEqual("TestSchema.VERTICAL_PER_HORIZONTAL");
    });
    it("sync- JSON stringify serialization of fully defined inverted unit", () => {
      const dmSchema = Schema.fromJsonSync(jsonOne, new SchemaContext());
      expect(dmSchema);
      const testItem = dmSchema.getItemSync("HORIZONTAL_PER_VERTICAL");
      expect(testItem?.schemaItemType === SchemaItemType.InvertedUnit);
      const testInvertedUnit: InvertedUnit = testItem as InvertedUnit;
      expect(testInvertedUnit);
      const json = JSON.stringify(testInvertedUnit);
      const invertedUnitSerialization = JSON.parse(json);
      expect(invertedUnitSerialization.unitSystem).toEqual("TestSchema.INTERNATIONAL");
      expect(invertedUnitSerialization.invertsUnit).toEqual("TestSchema.VERTICAL_PER_HORIZONTAL");
    });
  });

  describe("toXml", () => {
    const newDom = createEmptyXmlDocument();
    const schemaJson = {
      $schema: DMSchemaNamespaceUris.SCHEMAURL3_2_JSON,
      version: "1.0.0",
      name: "TestSchema",
      alias: "ts",
      items: {
        HORIZONTAL_PER_VERTICAL: {
          schemaItemType: "InvertedUnit",
          unitSystem: "TestSchema.INTERNATIONAL",
          invertsUnit: "TestSchema.VERTICAL_PER_HORIZONTAL",
        },
        INTERNATIONAL: {
          schemaItemType: "UnitSystem",
          label: "Imperial",
          description: "Units of measure from the british imperial empire",
        },
        VERTICAL_PER_HORIZONTAL: {
          schemaItemType: "Unit",
          phenomenon: "TestSchema.Length",
          unitSystem: "TestSchema.INTERNATIONAL",
          definition: "Vert/Horizontal",
        },
        Length: {
          schemaItemType: "Phenomenon",
          definition: "TestSchema.Length",
        },
      },
    };

    it("should properly serialize", async () => {
      const dmschema = await Schema.fromJson(schemaJson, new SchemaContext());
      expect(dmschema);
      const testInvUnit = await dmschema.getItem("HORIZONTAL_PER_VERTICAL", InvertedUnit);
      expect(testInvUnit);

      const serialized = await testInvUnit!.toXml(newDom);
      expect(serialized.nodeName).toEqual("InvertedUnit");
      expect(serialized.getAttribute("typeName")).toEqual("HORIZONTAL_PER_VERTICAL");
      expect(serialized.getAttribute("unitSystem")).toEqual("INTERNATIONAL");
      expect(serialized.getAttribute("invertsUnit")).toEqual("VERTICAL_PER_HORIZONTAL");
    });
  });
});
