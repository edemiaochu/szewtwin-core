import { Schema, SchemaItemType } from "@szewtwin/dmschema-metadata";
import { AnySchemaDifferenceConflict, ConflictCode, getSchemaDifferences, SchemaDifferenceResult, SchemaEdits, SchemaMerger } from "../../../dmschema-editing";
import { BisTestHelper } from "../../TestUtils/BisTestHelper";
import { deserializeXml } from "../../TestUtils/DeserializationHelpers";
import { expect } from "chai";

describe("Failing Iterative Tests", () => {
  let sourceSchema: Schema;
  let targetSchema: Schema;
  let schemaEdits: SchemaEdits;

  beforeEach(() => {
    schemaEdits = new SchemaEdits();
  });

  async function loadSchemaXml(schemaXml: string): Promise<Schema> {
    const schemaContext = await BisTestHelper.getNewContext();
    return deserializeXml(schemaXml, schemaContext);
  }

  async function combineIVaultSchemas(handler: (differenceResult: SchemaDifferenceResult) => Promise<void>): Promise<Schema> {
    // Get differences between the two schemas
    const differenceResult = await getSchemaDifferences(targetSchema, sourceSchema, schemaEdits.toJSON());
    await handler(differenceResult);

    // Merge the differences into the target schema
    const merger = new SchemaMerger(targetSchema.context);
    return merger.merge(differenceResult, schemaEdits);
  }

  /**
  *  {
    changeType: "add",
    schemaType: "EntityClass",
    itemName: "TestClass",
    difference: {
      schemaItemType: "EntityClass",
      baseClass: "TestSchema.TestBaseClass",
    },
  },
  */
  it("shall re-apply stored conflict resolutions for setting baseClass", async () => {
    targetSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMStructClass typeName="TestBaseClass" modifier="Sealed">
        </DMStructClass>
      </DMSchema>`);

    // First iteration
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestBaseClass" modifier="Sealed">
        </DMEntityClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.satisfy(([conflict]: AnySchemaDifferenceConflict[]) => {
        expect(conflict).to.exist;
        expect(conflict).to.have.a.property("code", ConflictCode.ConflictingItemName);
        expect(conflict).to.have.a.property("source", "EntityClass");
        expect(conflict).to.have.a.property("target", "StructClass");
        return true;
      });

      const testBaseClassItem = await sourceSchema.getItem("TestBaseClass");
      schemaEdits.items.rename(testBaseClassItem!, "Merged_BaseEntityClass");
    });

    await expect(targetSchema.getItem("TestBaseClass")).to.be.eventually.fulfilled.then((dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass).to.have.a.property("schemaItemType", SchemaItemType.StructClass);
    });
    await expect(targetSchema.getItem("Merged_BaseEntityClass")).to.be.eventually.fulfilled.then((dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass).to.have.a.property("schemaItemType", SchemaItemType.EntityClass);
    });

    // Second iteration
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestClass" modifier="None">
          <BaseClass>TestBaseClass</BaseClass>
        </DMEntityClass>
        <DMEntityClass typeName="TestBaseClass" modifier="Sealed">
        </DMEntityClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.be.undefined;
    });

    await expect(targetSchema.getItem("TestClass")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass).to.have.a.nested.property("baseClass.name", "Merged_BaseEntityClass");
    });
  });

  /**
   * {
    changeType: "modify",
    schemaType: "Property",
    itemName: "TestClass",
    path: "Height",
    difference: {
      label: "Test",
      category: "TestSchema.TestSystem",
    },
  },
   */
  it("shall re-apply stored conflict resolutions for setting category", async () => {
    targetSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <UnitSystem typeName="TestSystem">
        </UnitSystem>
        <DMEntityClass typeName="TestClass" modifier="Sealed">
        </DMEntityClass>
      </DMSchema>`);

    // First iteration
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <PropertyCategory typeName="TestSystem" priority="10000">
        </PropertyCategory>
        <DMEntityClass typeName="TestClass" modifier="Sealed">
          <DMProperty propertyName="Height" typeName="double" category="TestSystem" />
        </DMEntityClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.satisfy(([conflict]: AnySchemaDifferenceConflict[]) => {
        expect(conflict).to.exist;
        expect(conflict).to.have.a.property("code", ConflictCode.ConflictingItemName);
        expect(conflict).to.have.a.property("source", "PropertyCategory");
        expect(conflict).to.have.a.property("target", "UnitSystem");
        return true;
      });

      const testSystemItem = await sourceSchema.getItem("TestSystem");
      schemaEdits.items.rename(testSystemItem!, "Merged_PropertyCategory");
    });

    await expect(targetSchema.getItem("TestSystem")).to.be.eventually.fulfilled.then((dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass).to.have.a.property("schemaItemType", SchemaItemType.UnitSystem);
    });
    await expect(targetSchema.getItem("Merged_PropertyCategory")).to.be.eventually.fulfilled.then((dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass).to.have.a.property("schemaItemType", SchemaItemType.PropertyCategory);
    });

    // Second iteration
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <PropertyCategory typeName="TestSystem" priority="10000">
        </PropertyCategory>
        <DMEntityClass typeName="TestClass" modifier="Sealed">
          <DMProperty propertyName="Height" typeName="double" category="TestSystem" displayLabel="Test" />
        </DMEntityClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.be.undefined;
    });

    await expect(targetSchema.getItem("TestClass")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      await expect(dmClass.getProperty("Height")).to.be.eventually.fulfilled.then((property) => {
        expect(property).to.exist;
        expect(property).to.have.a.nested.property("category.name", "Merged_PropertyCategory");
      });
    });
  });
});
