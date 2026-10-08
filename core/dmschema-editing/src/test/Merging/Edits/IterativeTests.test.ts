import { EntityClass, PrimitiveType, Schema } from "@szewtwin/dmschema-metadata";
import { AnySchemaDifferenceConflict, ConflictCode, getSchemaDifferences, SchemaDifferenceResult, SchemaEdits, SchemaMerger } from "../../../dmschema-editing";
import { BisTestHelper } from "../../TestUtils/BisTestHelper";
import { deserializeXml } from "../../TestUtils/DeserializationHelpers";
import { expect } from "chai";

describe("Iterative Tests", () => {

  it("shall correctly deal with saved edits", async () => {

    async function combineIVaultSchemas(handler: (differenceResult: SchemaDifferenceResult) => Promise<void>): Promise<Schema> {
      // Get differences between the two schemas
      const differenceResult = await getSchemaDifferences(targetSchema, sourceSchema, schemaEdits);
      await handler(differenceResult);

      // Merge the differences into the target schema
      const merger = new SchemaMerger(targetSchema.context);
      return merger.merge(differenceResult, schemaEdits);
    }

    const schemaEdits = new SchemaEdits();

    let targetSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestEntity" modifier="Sealed">
          <DMProperty propertyName="TestProperty" typeName="string" />
        </DMEntityClass>
      </DMSchema>`);

    // First iteration: A new property is added to the entity class with the same name as the
    // existing property but with a different type. The source property will be renamed.
    let sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestEntity" modifier="Sealed">
          <DMProperty propertyName="TestProperty" typeName="double" />
        </DMEntityClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.satisfy(([conflict]: AnySchemaDifferenceConflict[]) => {
        expect(conflict).to.exist;
        expect(conflict).to.have.a.property("code", ConflictCode.ConflictingPropertyName);
        expect(conflict).to.have.a.property("source", "double");
        expect(conflict).to.have.a.property("target", "string");
        return true;
      });

      // Solution to resolve the conflict is to rename the source property.
      const propertyItem = await sourceSchema.getItem("TestEntity") as EntityClass;
      schemaEdits.properties.rename(propertyItem,"TestProperty" , "TestProperty_double");
    });

    await expect(targetSchema.getItem("TestEntity")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      await expect(dmClass.getProperty("TestProperty")).to.be.eventually.fulfilled.then((property) => {
        expect(property).to.exist;
        expect(property).has.property("primitiveType").equals(PrimitiveType.String);
      });
      await expect(dmClass.getProperty("TestProperty_double")).to.be.eventually.fulfilled.then((property) => {
        expect(property).to.exist;
        expect(property).has.property("primitiveType").equals(PrimitiveType.Double);
      });
    });

    // Second iteration: The existing property, the label of the renamed property is changed.
    // This means the change needs to figure out that the source property has to be renamed
    // in a previous iteration.
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestEntity" modifier="Sealed">
          <DMProperty propertyName="TestProperty" typeName="double" displayLabel="This is a double property" category="Category" />
        </DMEntityClass>
        <PropertyCategory typeName="Category" displayLabel="My Property Category" priority="100000" />
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.be.undefined;
    });

    await expect(targetSchema.getItem("TestEntity")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      await expect(dmClass.getProperty("TestProperty_double")).to.be.eventually.fulfilled.then((property) => {
        expect(property).to.exist;
        expect(property).to.have.a.property("label", "This is a double property");
      });
    });

    // Second and a half iteration: Merge the schema again, but with a different Property Category label.
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestEntity" modifier="Sealed">
          <DMProperty propertyName="TestProperty" typeName="double" displayLabel="This is a double property" category="Category" />
        </DMEntityClass>
        <PropertyCategory typeName="Category" displayLabel="My changed Property Category label" priority="100000" />
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.be.undefined;
    });

    await expect(targetSchema.getItem("TestEntity")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      await expect(dmClass.getProperty("TestProperty_double")).to.be.eventually.fulfilled.then(async (property) => {
        expect(property).to.exist;
        expect(await property.category).to.have.a.nested.property("label", "My changed Property Category label");
      });
    });

    // Third Iteration: The source schema now adds a structClass called Category which shall conflict with the
    // existing PropertyCategory. Additionally this struct is referenced by an added property to the TestEntity.
    // The struct will be renamed.
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="TestEntity" modifier="Sealed">
          <DMStructProperty propertyName="CategoryProperty" typeName="Category" />
        </DMEntityClass>
        <DMStructClass typeName="Category">
          <DMProperty propertyName="Name" typeName="string" />
          <DMProperty propertyName="Priority" typeName="int" />
        </DMStructClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.satisfy(([conflict]: AnySchemaDifferenceConflict[]) => {
        expect(conflict).to.exist;
        expect(conflict).to.have.a.property("code", ConflictCode.ConflictingItemName);
        expect(conflict).to.have.a.property("source", "StructClass");
        expect(conflict).to.have.a.property("target", "PropertyCategory");
        return true;
      });

      // Solution to resolve the conflict is to rename the source struct.
      const categoryItem = await sourceSchema.getItem("Category");
      schemaEdits.items.rename(categoryItem!, "CategoryStruct");
    });

    await expect(targetSchema.getItem("TestEntity")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      await expect(dmClass.getProperty("CategoryProperty")).to.be.eventually.fulfilled.then((property) => {
        expect(property).to.exist;
        expect(property).to.have.a.nested.property("structClass.name", "CategoryStruct");
      });
    });

    // Forth Iteration: A new entity gets added with the also added AbstractBaseClass as a baseClass.
    // This should not raise any conflicts. Additionally AbstractBaseClass is renamed to CommonBaseClass.
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="AbstractBaseClass" modifier="Abstract">
          <DMProperty propertyName="Tag" typeName="string" />
        </DMEntityClass>
        <DMEntityClass typeName="Building">
          <BaseClass>AbstractBaseClass</BaseClass>
          <DMProperty propertyName="Address" typeName="string" />
          <DMProperty propertyName="Height" typeName="double" />
        </DMEntityClass>
        <!-- <PropertyCategory typeName="Category" displayLabel="I changed the Property Category label again" priority="100000" /> -->
        <DMStructClass typeName="CategoryStruct" displayLabel="I changed the StructClass label as well :P" />
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.be.undefined;

      // Rename AbstractBaseClass to CommonBaseClass
      const abstractBaseClassItem = await sourceSchema.getItem("AbstractBaseClass");
      schemaEdits.items.rename(abstractBaseClassItem!, "CommonBaseClass");
    });

    await expect(targetSchema.getItem("Building")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass).to.have.a.nested.property("baseClass.name", "CommonBaseClass");
      await expect(dmClass.getProperty("Address")).to.be.eventually.not.undefined;
      await expect(dmClass.getProperty("Height")).to.be.eventually.not.undefined;
      await expect(dmClass.getProperty("Tag")).to.be.eventually.not.undefined;
    });

    await expect(targetSchema.getItem("Category")).to.be.eventually.fulfilled.then(async (category) => {
      expect(category).to.exist;
      // the issue will be resolved when we add the type of remapped item into schemaEdits
      // expect(category).to.have.a.property("label", "I changed the Property Category label again");
    });

    await expect(targetSchema.getItem("CategoryStruct")).to.be.eventually.fulfilled.then(async (categoryStruct) => {
      expect(categoryStruct).to.exist;
      expect(categoryStruct).to.have.a.property("label", "I changed the StructClass label as well :P");
    });

    // Fifth Iteration: Add a mixin to the schema and apply it to the Building schema. Rename the mixin to ensure references
    // are updated correctly.
    sourceSchema = await loadSchemaXml(`
      <DMSchema schemaName="TestSchema" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="01.00.01" alias="CoreCA"/>
        <DMCustomAttributes>
          <DynamicSchema xmlns="CoreCustomAttributes.01.00.03"/>
        </DMCustomAttributes>
        <DMEntityClass typeName="CommonBaseClass" modifier="Abstract">
          <DMProperty propertyName="Tag" typeName="string" />
        </DMEntityClass>
        <DMEntityClass typeName="AuxBuilding">
          <DMCustomAttributes>
            <IsMixin xmlns="CoreCustomAttributes.01.00.00">
              <AppliesToEntityClass>Building</AppliesToEntityClass>
            </IsMixin>
          </DMCustomAttributes>
          <DMProperty propertyName="Kind" typeName="int" />
        </DMEntityClass>
        <DMEntityClass typeName="Building">
          <BaseClass>CommonBaseClass</BaseClass>
          <BaseClass>AuxBuilding</BaseClass>
          <DMProperty propertyName="Address" typeName="string" />
          <DMProperty propertyName="Height" typeName="double" />
        </DMEntityClass>
      </DMSchema>`);

    targetSchema = await combineIVaultSchemas(async (result) => {
      expect(result.conflicts).to.be.undefined;

      // Rename AbstractBaseClass to CommonBaseClass
      const auxBuildingItem = await sourceSchema.getItem("AuxBuilding");
      schemaEdits.items.rename(auxBuildingItem!, "AdditionalBuilding");
    });

    await expect(targetSchema.getItem("Building")).to.be.eventually.fulfilled.then(async (dmClass) => {
      expect(dmClass).to.exist;
      expect(dmClass.mixins).to.satisfy((mixins: any) => {
        expect(mixins).to.have.lengthOf(1);
        expect(mixins[0]).to.have.a.property("name", "AdditionalBuilding");
        return true;
      });
    });

    expect(true).is.true;
  });
});

async function loadSchemaXml(schemaXml: string): Promise<Schema> {
  const schemaContext = await BisTestHelper.getNewContext();
  return deserializeXml(schemaXml, schemaContext);
}
