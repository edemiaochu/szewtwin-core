/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DMSchemaToTs } from "../ecschema2ts";
import { assert } from "chai";
import * as utils from "./utilities/utils";
import { SchemaContext } from "@szewtwin/dmschema-metadata";
import { SchemaXmlFileLocater } from "@szewtwin/dmschema-locaters";

describe("Convert schema xml string to typescript string", () => {
  let ecschema2ts: DMSchemaToTs;
  let context: SchemaContext;
  beforeEach(() => {
    const locator = new SchemaXmlFileLocater();
    locator.addSchemaSearchPath(`${utils.getAssetsDir()}schema3.2`);
    context = new SchemaContext();
    context.addLocater(locator);

    ecschema2ts = new DMSchemaToTs();
  });

  it("Get SchemaName from valid xml", () => {
    const schemaXml = `
      <?xml version="1.0" encoding="utf-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
      </DMSchema>`;

    const expectedSchemaTsString = utils.dedent`import { ClassRegistry, Schema, Schemas } from "@szewtwin/core-backend";
      import * as elementsModule from "./TestSchemaElements";

      export class TestSchema extends Schema {
        public static get schemaName(): string { return "TestSchema"; }

        public static registerSchema() {
          if (!Schemas.getRegisteredSchema(TestSchema.name))
            Schemas.registerSchema(TestSchema);
        }

        protected constructor() {
          super();
          ClassRegistry.registerModule(elementsModule, TestSchema);
        }
      }\n\n`;

    const schema = utils.deserializeXml(context, schemaXml);
    const { schemaTsString, elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);
    assert.equal(schemaTsString, expectedSchemaTsString);
    assert.equal(elemTsString, `\n`);
    assert.equal(propsTsString, `\n`);
  });

  it("Does not crash with full schema", () => {
    const schemaXml = `
      <?xml version="1.0" encoding="utf-8"?>
      <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
        <DMEntityClass typeName="TestEntity">
          <DMProperty propertyName="primPropString" typeName="string" />
          <DMProperty propertyName="primPropInt" typeName="int" />
          <DMProperty propertyName="primPropBool" typeName="bool" />
          <DMProperty propertyName="primPropPoint2d" typeName="point2d" />
          <DMProperty propertyName="primPropPoint3d" typeName="point3d" />
        </DMEntityClass>
        <DMEntityClass typeName="TestMixin">
          <DMCustomAttributes>
            <IsMixin xmlns="CoreCustomAttributes.1.0">
              <AppliesToEntityClass>TestEntity</AppliesToEntityClass>
            </IsMixin>
          </DMCustomAttributes>
        </DMEntityClass>
        <DMStructClass typeName="TestStruct">
        </DMStructClass>
      </DMSchema>`;

    const expectedSchemaTsString = utils.dedent`import { ClassRegistry, Schema, Schemas } from "@szewtwin/core-backend";
      import * as elementsModule from "./TestSchemaElements";

      export class TestSchema extends Schema {
        public static get schemaName(): string { return "TestSchema"; }

        public static registerSchema() {
          if (!Schemas.getRegisteredSchema(TestSchema.name))
            Schemas.registerSchema(TestSchema);
        }

        protected constructor() {
          super();
          ClassRegistry.registerModule(elementsModule, TestSchema);
        }
      }\n\n`;

    const expectedElementTsString = utils.dedent`import { Entity, IVaultDb } from "@szewtwin/core-backend";
      import { TestEntityProps } from "./TestSchemaElementProps";

      export class TestEntity extends Entity implements TestEntityProps {
        public static get className(): string { return "TestEntity"; }

        public constructor (props: TestEntityProps, iVault: IVaultDb) {
          super(props, iVault);
        }
      }\n\n`;

    const expectedPropTsString = utils.dedent`import { EntityProps } from "@szewtwin/core-common";
      import { Point2d, Point3d } from "@szewtwin/core-geometry";

      export interface TestEntityProps extends EntityProps {
        primPropString?: string;
        primPropInt?: number;
        primPropBool?: boolean;
        primPropPoint2d?: Point2d;
        primPropPoint3d?: Point3d;
      }

      export interface TestMixin {
      }

      export interface TestStruct {
      }\n\n`;

    const schema = utils.deserializeXml(context, schemaXml);
    const { schemaTsString, elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);
    assert.equal(schemaTsString, expectedSchemaTsString);
    assert.equal(elemTsString, expectedElementTsString);
    assert.equal(propsTsString, expectedPropTsString);
  });
});

describe("dmxml to typescript string", () => {
  describe("for entity classes", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Basic Entity
      {
        testName:
          `Basic entity`,
        referenceXmls: [],
        schemaXml:
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="EntityTest" modified="None">
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          export class EntityTest extends Entity {
            public static get className(): string { return "EntityTest"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Entity with description
      {
        testName: `Basic entity with description`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="EntityTest" description="Test Description" modified="None">
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          /**
           * Test Description
           */
          export class EntityTest extends Entity {
            public static get className(): string { return "EntityTest"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Entity with abstract modifier
      {
        testName: `Entity with abstract modifier`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="EntityTest" modifier="abstract">
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          export abstract class EntityTest extends Entity {
            public static get className(): string { return "EntityTest"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Entity with base class
      {
        testName: `Entity with base class`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="BaseEntityTest" modified="None">
            </DMEntityClass>
            <DMEntityClass typeName="EntityTest" modified="None">
              <BaseClass>BaseEntityTest</BaseClass>
              <DMProperty propertyName="TestProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface EntityTestProps extends EntityProps {
            testProp?: number;
          }`,
        ],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
          new RegExp(`import { EntityTestProps } from "./TestSchemaElementProps";`),
        ],
        expectedElemTs: [utils.dedent`
          export class BaseEntityTest extends Entity {
            public static get className(): string { return "BaseEntityTest"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }

          export class EntityTest extends BaseEntityTest implements EntityTestProps {
            public static get className(): string { return "EntityTest"; }

            public constructor (props: EntityTestProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Entity with multiple base classes should assume the second is a mixin
      {
        testName: `Entity with multiple base classes should assume the second is a mixin`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMEntityClass typeName="EntityTest" modified="None">
              <BaseClass>BaseEntityTest</BaseClass>
              <BaseClass>IMixin</BaseClass>
              <DMProperty propertyName="TestEntityIntProp" typeName="int"/>
            </DMEntityClass>
            <DMEntityClass typeName="IMixin">
              <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.1.0.0">
                  <AppliesToEntityClass>BaseEntityTest</AppliesToEntityClass>
                </IsMixin>
              </DMCustomAttributes>
              <DMProperty propertyName="IMixinIntProp" typeName="int"/>
            </DMEntityClass>
            <DMEntityClass typeName="BaseEntityTest" modified="None">
              <DMProperty propertyName="BaseEntityTestIntProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface IMixin {
            iMixinIntProp?: number;
          }

          export interface BaseEntityTestProps extends EntityProps {
            baseEntityTestIntProp?: number;
          }

          export interface EntityTestProps extends BaseEntityTestProps, IMixin {
            testEntityIntProp?: number;
          }`,
        ],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { (?=.*\\b(EntityTestProps)\\b)(?=.*\\b(BaseEntityTestProps)\\b).* } from "./TestSchemaElementProps";`),
        ],
        expectedElemTs: [utils.dedent`
          export class BaseEntityTest extends Entity implements BaseEntityTestProps {
            public static get className(): string { return "BaseEntityTest"; }

            public constructor (props: BaseEntityTestProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }

          export class EntityTest extends BaseEntityTest implements EntityTestProps {
            public static get className(): string { return "EntityTest"; }

            public constructor (props: EntityTestProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Entity with base class in a reference schema
      {
        testName: `Entity with multiple base classes should assume the second is a mixin`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="ReferenceSchema" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="BaseEntityTest" modified="None">
              <DMProperty propertyName="BaseEntityTestIntProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="ReferenceSchema" version="1.0.0" alias="ref"/>
            <DMEntityClass typeName="EntityTest" modified="None">
              <BaseClass>ref:BaseEntityTest</BaseClass>
              <DMProperty propertyName="TestEntityIntProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { BaseEntityTestProps } from "./ReferenceSchemaElementProps";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface EntityTestProps extends BaseEntityTestProps {
            testEntityIntProp?: number;
          }`,
        ],
        expectedElemImportTs: [
          new RegExp(`import { IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityTestProps } from "./TestSchemaElementProps";`),
          new RegExp(`import { BaseEntityTest } from "./ReferenceSchemaElements";`),
        ],
        expectedElemTs: [utils.dedent`
          export class EntityTest extends BaseEntityTest implements EntityTestProps {
            public static get className(): string { return "EntityTest"; }

            public constructor (props: EntityTestProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  describe("Mixins classes", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Basic mixin
      {
        testName: `Basic mixin`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMEntityClass typeName="MixinTest" modified="None">
              <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.1.0.0">
                  <AppliesToEntityClass>bis:Element</AppliesToEntityClass>
                </IsMixin>
              </DMCustomAttributes>
              <DMProperty propertyName="MixinIntProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [utils.dedent`
          export interface MixinTest {
            mixinIntProp?: number;
          }`,
        ],
        expectedElemImportTs: [],
        expectedElemTs: [],
      },

      // Test Case: Mixin has base class
      {
        testName: `Mixin has base class`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMEntityClass typeName="BaseMixinTest" modified="None">
              <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.1.0.0">
                  <AppliesToEntityClass>bis:Element</AppliesToEntityClass>
                </IsMixin>
              </DMCustomAttributes>
              <DMProperty propertyName="BaseMixinIntProp" typeName="int"/>
            </DMEntityClass>
            <DMEntityClass typeName="MixinTest" modified="None">
              <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.1.0.0">
                  <AppliesToEntityClass>bis:Element</AppliesToEntityClass>
                </IsMixin>
              </DMCustomAttributes>
              <BaseClass>BaseMixinTest</BaseClass>
              <DMProperty propertyName="MixinIntProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [utils.dedent`
          export interface BaseMixinTest {
            baseMixinIntProp?: number;
          }

          export interface MixinTest extends BaseMixinTest {
            mixinIntProp?: number;
          }`,
        ],
        expectedElemImportTs: [],
        expectedElemTs: [],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  describe("Struct classes", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Basic struct with no description
      {
        testName: `Basic struct with no description`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMStructClass typeName="StructTest">
              <DMProperty propertyName="PrimitiveProp" typeName="string" readOnly="false"/>
              <DMProperty propertyName="EnumProp" typeName="IntEnumeration"/>
            </DMStructClass>
            <DMEnumeration typeName="IntEnumeration" backingTypeName="int" description="Int Enumeration" displayLabel="This is a display label." isStrict="true">
              <DMEnumerator name="IntEnumeration1" value="1" displayLabel="First"/>
              <DMEnumerator name="IntEnumeration2" value="2" displayLabel="Second"/>
              <DMEnumerator name="IntEnumeration3" value="3" displayLabel="Third"/>
            </DMEnumeration>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { IntEnumeration } from "./TestSchemaElements";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface StructTest {
            primitiveProp?: string;
            enumProp?: IntEnumeration;
          }`,
        ],
        expectedElemImportTs: [],
        expectedElemTs: [utils.dedent`
          /**
           * Int Enumeration
           */
          export const enum IntEnumeration {
            First = 1,
            Second = 2,
            Third = 3,
          }`,
        ],
      },

      // Test Case: Basic struct with description
      {
        testName: `Basic struct with description`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMStructClass typeName="StructTest" description="Test Description">
              <DMProperty propertyName="PrimitiveProp" typeName="string" readOnly="false"/>
              <DMProperty propertyName="EnumProp" typeName="IntEnumeration"/>
            </DMStructClass>
            <DMEnumeration typeName="IntEnumeration" backingTypeName="int" description="Int Enumeration" displayLabel="This is a display label." isStrict="true">
              <DMEnumerator name="IntEnumeration1" value="1" displayLabel="First"/>
              <DMEnumerator name="IntEnumeration2" value="2" displayLabel="Second"/>
              <DMEnumerator name="IntEnumeration3" value="3" displayLabel="Third"/>
            </DMEnumeration>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { IntEnumeration } from "./TestSchemaElements";`),
        ],
        expectedPropsTs: [utils.dedent`
          /**
           * Test Description
           */
          export interface StructTest {
            primitiveProp?: string;
            enumProp?: IntEnumeration;
          }`,
        ],
        expectedElemImportTs: [],
        expectedElemTs: [utils.dedent`
          /**
           * Int Enumeration
           */
          export const enum IntEnumeration {
            First = 1,
            Second = 2,
            Third = 3,
          }`,
        ],
      },

      // Test Case: Struct has base class
      {
        testName: "Struct has base class",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMStructClass typeName="StructTest">
              <BaseClass>BaseStructTest</BaseClass>
              <DMProperty propertyName="PrimitiveProp" typeName="string" readOnly="false"/>
            </DMStructClass>
            <DMStructClass typeName="BaseStructTest">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMStructClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [utils.dedent`
          export interface BaseStructTest {
            basePrimitiveProp?: string;
          }

          export interface StructTest extends BaseStructTest {
            primitiveProp?: string;
          }`,
        ],
        expectedElemImportTs: [],
        expectedElemTs: [],
      },

      // Test Case: Struct has base class in reference schema
      {
        testName: `Struct has base class`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="ReferenceSchema" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMStructClass typeName="BaseStructTest">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMStructClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="1.0.0" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="1.0.0" alias="bis"/>
            <DMSchemaReference name="ReferenceSchema" version="1.0.0" alias="ref"/>
            <DMStructClass typeName="StructTest">
              <BaseClass>ref:BaseStructTest</BaseClass>
              <DMProperty propertyName="PrimitiveProp" typeName="string" readOnly="false"/>
            </DMStructClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { BaseStructTest } from "./ReferenceSchemaElementProps";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface StructTest extends BaseStructTest {
            primitiveProp?: string;
          }`,
        ],
        expectedElemImportTs: [],
        expectedElemTs: [],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  // TODO: fix naming conflict
  describe("Schema references", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Reference with a single class to import
      {
        testName: "Reference with a single class to import",
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="RefSchema" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestBase">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMEntityClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="RefSchema" alias="ref" version="1.0.0"/>
          <DMEntityClass typeName="TestClass">
            <BaseClass>ref:TestBase</BaseClass>
          </DMEntityClass>
        </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { TestBase } from "./RefSchemaElements";`),
          new RegExp(`import { TestBaseProps } from "./RefSchemaElementProps";`),
        ],
        expectedElemTs: [utils.dedent`
          export class TestClass extends TestBase {
            public static get className(): string { return "TestClass"; }

            public constructor (props: TestBaseProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: 2 References with 2 classes to import
      {
        testName: `2 References with 2 classes to import`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="RefSchema" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestBase">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMEntityClass>
          </DMSchema>`,
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="SecondRefSchema" alias="ref2" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestBase">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMEntityClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="RefSchema" alias="ref" version="1.0.0"/>
          <DMSchemaReference name="SecondRefSchema" alias="ref2" version="1.0.0"/>
          <DMEntityClass typeName="TestClass">
            <BaseClass>ref:TestBase</BaseClass>
          </DMEntityClass>
          <DMEntityClass typeName="TestClass2">
            <BaseClass>ref2:TestBase</BaseClass>
          </DMEntityClass>
        </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { TestBase } from "./RefSchemaElements";`),
          new RegExp(`import { TestBase as SecondRefSchemaElementsTestBase } from "./SecondRefSchemaElements";`),
          new RegExp(`import { TestBaseProps } from "./RefSchemaElementProps";`),
          new RegExp(`import { TestBaseProps as SecondRefSchemaElementPropsTestBaseProps } from "./SecondRefSchemaElementProps";`),
        ],
        expectedElemTs: [utils.dedent`
          export class TestClass extends TestBase {
            public static get className(): string { return "TestClass"; }

            public constructor (props: TestBaseProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`, utils.dedent`
          export class TestClass2 extends SecondRefSchemaElementsTestBase {
            public static get className(): string { return "TestClass2"; }

            public constructor (props: SecondRefSchemaElementPropsTestBaseProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: 2 References with 3 classes to import
      {
        testName: `2 References with 3 classes to import`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="RefSchema" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestBase">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMEntityClass>
            <DMEntityClass typeName="TestBase2">
              <DMProperty propertyName="Base2PrimitiveProp" typeName="string" readOnly="false"/>
            </DMEntityClass>
          </DMSchema>`,

          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="SecondRefSchema" alias="ref2" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestBase">
              <DMProperty propertyName="BasePrimitiveProp" typeName="string" readOnly="false"/>
            </DMEntityClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="RefSchema" alias="ref" version="1.0.0"/>
          <DMSchemaReference name="SecondRefSchema" alias="ref2" version="1.0.0"/>
          <DMEntityClass typeName="TestClass">
            <BaseClass>ref:TestBase</BaseClass>
          </DMEntityClass>
          <DMEntityClass typeName="TestClass2">
            <BaseClass>ref:TestBase2</BaseClass>
          </DMEntityClass>
          <DMEntityClass typeName="TestClass3">
            <BaseClass>ref2:TestBase</BaseClass>
          </DMEntityClass>
        </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { (?=.*\\b(TestBase)\\b)(?=.*\\b(TestBase2)\\b).* } from "./RefSchemaElements";`),
          new RegExp(`import { TestBase as SecondRefSchemaElementsTestBase } from "./SecondRefSchemaElements";`),
          new RegExp(`import { (?=.*\\b(TestBaseProps)\\b)(?=.*\\b(TestBase2Props)\\b).* } from "./RefSchemaElementProps";`),
          new RegExp(`import { TestBaseProps as SecondRefSchemaElementPropsTestBaseProps } from "./SecondRefSchemaElementProps";`),
        ],
        expectedElemTs: [utils.dedent`
          export class TestClass extends TestBase {
            public static get className(): string { return "TestClass"; }

            public constructor (props: TestBaseProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`, utils.dedent`
          export class TestClass2 extends TestBase2 {
            public static get className(): string { return "TestClass2"; }

            public constructor (props: TestBase2Props, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`, utils.dedent`
          export class TestClass3 extends SecondRefSchemaElementsTestBase {
            public static get className(): string { return "TestClass3"; }

            public constructor (props: SecondRefSchemaElementPropsTestBaseProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: property in reference
      {
        testName: `Property in reference schema`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="RefSchema" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMStructClass typeName="StructClass">
              <DMProperty propertyName="PrimitiveProp" typeName="string" readOnly="false"/>
            </DMStructClass>
            <DMEnumeration typeName="PropEnum" backingTypeName="int" description="Int Enumeration" displayLabel="This is a display label." isStrict="true">
              <DMEnumerator name="IntEnumeration1" value="1" displayLabel="First"/>
              <DMEnumerator name="IntEnumeration2" value="2" displayLabel="Second"/>
              <DMEnumerator name="IntEnumeration3" value="3" displayLabel="Third"/>
            </DMEnumeration>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="RefSchema" alias="ref" version="1.0.0"/>
            <DMEntityClass typeName="TestClass">
              <DMProperty propertyName="testProp" typeName="ref:PropEnum"/>
              <DMProperty propertyName="point2dProp" typeName="point2d"/>
              <DMProperty propertyName="point3dProp" typeName="point3d"/>
              <DMProperty propertyName="testProp2" typeName="string" extendedTypeName="BeGuid"/>
              <DMStructProperty propertyName="testStructProp" typeName="ref:StructClass"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [
          new RegExp(`import { GuidString } from "@szewtwin/core-szewec";`),
          new RegExp(`import { (?=.*\\b(Point2d)\\b)(?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`),
          new RegExp(`import { StructClass } from "./RefSchemaElementProps";`),
          new RegExp(`import { PropEnum } from "./RefSchemaElements";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            testProp?: PropEnum;
            point2dProp?: Point2d;
            point3dProp?: Point3d;
            testProp2?: GuidString;
            testStructProp?: StructClass;
          }`,
        ],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(IVaultDb)\\b)(?=.*\\b(Entity)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { TestClassProps } from "./TestSchemaElementProps";`),
        ],
        expectedElemTs: [utils.dedent`
          export class TestClass extends Entity implements TestClassProps {
            public static get className(): string { return "TestClass"; }

            public constructor (props: TestClassProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Duplicate classes are not imported
      {
        testName: `Duplicate classes are not imported`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass"/>
            <DMEntityClass typeName="TestClass2"/>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { (?=.*\\b(IVaultDb)\\b)(?=.*\\b(Entity)\\b).* } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          export class TestClass extends Entity {
            public static get className(): string { return "TestClass"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`, utils.dedent`
          export class TestClass2 extends Entity {
            public static get className(): string { return "TestClass2"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  describe("enumeration", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Schema with enum
      {
        testName: "Schema with enum",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEnumeration typeName="TestEnum" backingTypeName="int" isStrict="true">
            <DMEnumerator name="Enumerator1" value="1" displayLabel="TestEnumerator1"/>
            <DMEnumerator name="Enumerator2" value="2" displayLabel="TestEnumerator2"/>
          </DMEnumeration>
          <DMEnumeration typeName="TestEnum2" backingTypeName="string" isStrict="false">
            <DMEnumerator name="Enumerator1" value="testing" displayLabel="TestEnumerator1"/>
            <DMEnumerator name="Enumerator2" value="testing2" displayLabel="TestEnumerator2"/>
          </DMEnumeration>
        </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [],
        expectedElemTs: [utils.dedent`
          export const enum TestEnum {
            TestEnumerator1 = 1,
            TestEnumerator2 = 2,
          }`, utils.dedent`
          export const enum TestEnum2 {
            TestEnumerator1 = "testing",
            TestEnumerator2 = "testing2",
          }`,
        ],
      },

      // Test Case: Schema with empty enum
      {
        testName: "Schema with empty enum",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEnumeration typeName="TestEnum" backingTypeName="int" isStrict="true"/>
        </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [],
        expectedElemTs: [utils.dedent`
          export const enum TestEnum {
          }`,
        ],
      },

      // Test Case: Schema with enum description
      {
        testName: "Schema with enum description",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEnumeration typeName="TestEnum" description="This is a test enum description" backingTypeName="int" isStrict="true">
              <DMEnumerator name="Enumerator1" value="1" displayLabel="TestEnumerator1"/>
              <DMEnumerator name="Enumerator2" value="2" displayLabel="TestEnumerator2"/>
            </DMEnumeration>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [],
        expectedElemTs: [utils.dedent`
          /**
           * This is a test enum description
           */
          export const enum TestEnum {
            TestEnumerator1 = 1,
            TestEnumerator2 = 2,
          }`,
        ],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  describe("split description", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Schema with long description
      {
        testName: "Schema with enum description",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestEntity"
                description="This is a long description. This is a long boring description. This is a long long long long boring description. This is a long long long long boring description"
                modifier="None" />
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [],
        expectedElemTs: [utils.dedent`
          /**
           * This is a long description. This is a long boring description. This is a long long long long boring description.
           * This is a long long long long boring description
           */
          export class TestEntity extends Entity {
            public static get className(): string { return "TestEntity"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  describe("Package references no longer look in the lib directory", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Package references no longer look in the lib directory
      {
        testName: "Package references no longer look in the lib directory",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="MyDomain" alias="mydomain" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
            <DMSchemaReference name="DMDbMap" version="02.00.00" alias="dmdbmap"/>
            <DMEntityClass typeName="Building" modifier="Sealed"/>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("MyDomain"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("MyDomain"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { Entity, IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          export class Building extends Entity {
            public static get className(): string { return "Building"; }

            public constructor (props: EntityProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },

      // Test Case: Package references no longer look in the lib directory
      {
        testName: "DMEntity with base class",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="MyDomain" alias="mydomain" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
            <DMSchemaReference name="DMDbMap" version="02.00.00" alias="dmdbmap"/>
            <DMEntityClass typeName="Building" modifier="Sealed">
              <BaseClass>bis:SpatialLocationElement</BaseClass>
              <BaseClass>bis:IParentElement</BaseClass>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("MyDomain"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("MyDomain"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { SpatialLocationElement, IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { GeometricElement3dProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          export class Building extends SpatialLocationElement {
            public static get className(): string { return "Building"; }

            public constructor (props: GeometricElement3dProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });

  describe("Handling DMSchemas which extend BisCore", () => {
    const testCases: utils.SchemaTestCase[] = [
      // Test Case: Handling DMSchemas which extend BisCore
      {
        testName: "Handling DMSchemas which extend BisCore",
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="MyDomain" alias="mydomain" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
            <DMSchemaReference name="DMDbMap" version="02.00.00" alias="dmdbmap"/>
            <DMEntityClass typeName="Building" modifier="Sealed">
              <BaseClass>bis:Sheet</BaseClass>
            </DMEntityClass>
          </DMSchema>`,
        expectedSchemaImportTs: utils.createExpectedSchemaImportTs("MyDomain"),
        expectedSchemaTs: utils.createExpectedSchemaTsString("MyDomain"),
        expectedPropsImportTs: [],
        expectedPropsTs: [],
        expectedElemImportTs: [
          new RegExp(`import { Sheet, IVaultDb } from "@szewtwin/core-backend";`),
          new RegExp(`import { SheetProps } from "@szewtwin/core-common";`),
        ],
        expectedElemTs: [utils.dedent`
          export class Building extends Sheet {
            public static get className(): string { return "Building"; }

            public constructor (props: SheetProps, iVault: IVaultDb) {
              super(props, iVault);
            }
          }`,
        ],
      },
    ];

    utils.testGeneratedSchemaTypescript(testCases);
  });
});
