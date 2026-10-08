/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as utils from "./utilities/utils";

describe("convert schema xml string to ts", () => {
  const testCases: utils.SchemaTestCase[] = [
    // Test Case: Class with long description
    {
      testName: `Class with long description`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="EntityTest"
                        description="This is a long description for a class. This is a long description for a class. This is a long description for a class. This is a long description for a class."
                        modifier="None">
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [ new RegExp(`import { EntityProps } from "@szewtwin/core-common";`) ],
      expectedPropsTs: [utils.dedent`
        export interface EntityTestProps extends EntityProps {
          booleanProps?: boolean;
          stringProps?: string;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { EntityTestProps } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        /**
         * This is a long description for a class. This is a long description for a class. This is a long
         * description for a class. This is a long description for a class.
         */
        export class EntityTest extends Entity implements EntityTestProps {
          public static get className(): string { return "EntityTest"; }

          public constructor (props: EntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Entity class with only primitive properties
    {
      testName: `Entity class with only primitive properties`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="EntityTest" description="Instantiable" modifier="None">
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="intProps" typeName="int"/>
            <DMProperty propertyName="doubleProps" typeName="double"/>
            <DMProperty propertyName="longProps" typeName="long"/>
            <DMProperty propertyName="point2DProps" typeName="point2d"/>
            <DMProperty propertyName="point3DProps" typeName="point3d"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        new RegExp(`import { (?=.*\\b(Point2d)\\b)(?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface EntityTestProps extends EntityProps {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          intProps?: number;
          doubleProps?: number;
          longProps?: any;
          point2DProps?: Point2d;
          point3DProps?: Point3d;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { EntityTestProps } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export class EntityTest extends Entity implements EntityTestProps {
          public static get className(): string { return "EntityTest"; }

          public constructor (props: EntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Struct class with only primitive properties
    {
      testName: `struct class with only primitive properties`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMStructClass typeName="StructTest" description="struct" modifier="None">
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="point2DProps" typeName="point2d"/>
            <DMProperty propertyName="point3DProps" typeName="point3d"/>
          </DMStructClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [ new RegExp(`import { (?=.*\\b(Point2d)\\b)(?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`) ],
      expectedPropsTs: [utils.dedent`
        export interface StructTest {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          point2DProps?: Point2d;
          point3DProps?: Point3d;
        }`,
      ],
      expectedElemImportTs: [],
      expectedElemTs: [],
    },

    // Test Case: Mixin with only primitive properties
    {
      testName: `Mixin class with only primitive properties`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="CoreCustomAttributes" version="01.00.00" alias="CoreCA"/>
          <DMEntityClass typeName="MixinTest" description="mixin" modifier="None">
            <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.01.00.00">
                    <AppliesToEntityClass>BaseEntity</AppliesToEntityClass>
                </IsMixin>
            </DMCustomAttributes>
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="doubleProps" typeName="double"/>
          </DMEntityClass>
          <DMEntityClass typeName="BaseEntity" modifier="None">
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [],
      expectedPropsTs: [utils.dedent`
        export interface MixinTest {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          doubleProps?: number;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
      ],
      expectedElemTs: [utils.dedent`
        export class BaseEntity extends Entity {
          public static get className(): string { return "BaseEntity"; }

          public constructor (props: EntityProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Enumeration
    {
      testName: `convert Enumeration to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEnumeration typeName="IntEnumeration" backingTypeName="int" description="Int Enumeration" displayLabel="This is a display label." isStrict="true">
              <DMEnumerator name="IntEnumeration1" value="1" displayLabel="First"/>
              <DMEnumerator name="IntEnumeration2" value="2" displayLabel="Second"/>
              <DMEnumerator name="IntEnumeration3" value="3" displayLabel="Third"/>
          </DMEnumeration>
          <DMEnumeration typeName="StringEnumeration" backingTypeName="string" description="String Enumeration" isStrict="true">
              <DMEnumerator name="spring" value="spring" displayLabel="FirstSeason"/>
              <DMEnumerator name="summer" value="summer" displayLabel="SecondSeason"/>
              <DMEnumerator name="fall" value="fall" displayLabel="ThirdSeason"/>
              <DMEnumerator name="winter" value="winter" displayLabel="FourthSeason"/>
          </DMEnumeration>
          <DMEntityClass typeName="BaseEntity" modifier="None">
            <DMProperty propertyName="intEnumProps" typeName="IntEnumeration"/>
            <DMProperty propertyName="stringEnumProps" typeName="StringEnumeration"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { (?=.*\\b(IntEnumeration)\\b)(?=.*\\b(StringEnumeration)\\b).* } from "./TestSchemaElements";`),
        new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface BaseEntityProps extends EntityProps {
          intEnumProps?: IntEnumeration;
          stringEnumProps?: StringEnumeration;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { BaseEntityProps } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export const enum IntEnumeration {
          First = 1,
          Second = 2,
          Third = 3,
        }`, utils.dedent`
        export const enum StringEnumeration {
          FirstSeason = "spring",
          SecondSeason = "summer",
          ThirdSeason = "fall",
          FourthSeason = "winter",
        }`, utils.dedent`
        export class BaseEntity extends Entity implements BaseEntityProps {
          public static get className(): string { return "BaseEntity"; }

          public constructor (props: BaseEntityProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Entity class with struct, enumeration, primitive and struct array properties
    {
      testName: `convert Entity class derived from another entity class to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="EntityTest" modifier="None">
              <DMStructProperty propertyName="structProps" typeName="StructTest"/>
              <DMProperty propertyName="intEnumProps" typeName="IntEnumeration"/>
              <DMProperty propertyName="stringEnumProps" typeName="StringEnumeration"/>
              <DMArrayProperty propertyName="stringArrayProps" typeName="string" minOccurs="0" maxOccurs="unbounded"/>
              <DMStructArrayProperty propertyName="structArrayProps" typeName="StructTest" minOccurs="0" maxOccurs="unbounded"/>
          </DMEntityClass>
          <DMStructClass typeName="StructTest" description="struct" modifier="None">
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="point2DProps" typeName="point2d"/>
            <DMProperty propertyName="point3DProps" typeName="point3d"/>
          </DMStructClass>
          <DMEnumeration typeName="IntEnumeration" backingTypeName="int" description="Int Enumeration" displayLabel="This is a display label." isStrict="true">
              <DMEnumerator name="IntEnumeration1" value="1" displayLabel="First"/>
              <DMEnumerator name="IntEnumeration2" value="2" displayLabel="Second"/>
              <DMEnumerator name="IntEnumeration3" value="3" displayLabel="Third"/>
          </DMEnumeration>
          <DMEnumeration typeName="StringEnumeration" backingTypeName="string" description="String Enumeration" isStrict="true">
              <DMEnumerator name="spring" value="spring" displayLabel="FirstSeason"/>
              <DMEnumerator name="summer" value="summer" displayLabel="SecondSeason"/>
              <DMEnumerator name="fall" value="fall" displayLabel="ThirdSeason"/>
              <DMEnumerator name="winter" value="winter" displayLabel="FourthSeason"/>
          </DMEnumeration>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { (?=.*\\b(EntityProps)\\b).* } from "@szewtwin/core-common";`),
        new RegExp(`import { (?=.*\\b(Point2d)\\b)(?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`),
        new RegExp(`import { (?=.*\\b(IntEnumeration)\\b)(?=.*\\b(StringEnumeration)\\b).* } from "./TestSchemaElements";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface StructTest {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          point2DProps?: Point2d;
          point3DProps?: Point3d;
        }`, utils.dedent`
        export interface EntityTestProps extends EntityProps {
          structProps?: StructTest;
          intEnumProps?: IntEnumeration;
          stringEnumProps?: StringEnumeration;
          stringArrayProps?: string[];
          structArrayProps?: StructTest[];
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { (?=.*\\b(EntityTestProps)\\b).* } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export const enum IntEnumeration {
          First = 1,
          Second = 2,
          Third = 3,
        }`, utils.dedent`
        export const enum StringEnumeration {
          FirstSeason = "spring",
          SecondSeason = "summer",
          ThirdSeason = "fall",
          FourthSeason = "winter",
        }`, utils.dedent`
        export class EntityTest extends Entity implements EntityTestProps {
          public static get className(): string { return "EntityTest"; }

          public constructor (props: EntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Entity class derived from another entity class (only one inheritance)
    {
      testName: `convert Entity class derived from another entity class to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="DerivedEntityTest" modifier="None">
              <BaseClass>BaseEntityTest</BaseClass>
              <DMProperty propertyName="derivedIntProps" typeName="int"/>
          </DMEntityClass>
          <DMEntityClass typeName="BaseEntityTest" modifier="None">
              <DMProperty propertyName="intProps" typeName="int"/>
              <DMProperty propertyName="stringProps" typeName="string"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface BaseEntityTestProps extends EntityProps {
          intProps?: number;
          stringProps?: string;
        }`, utils.dedent`
        export interface DerivedEntityTestProps extends BaseEntityTestProps {
          derivedIntProps?: number;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { (?=.*\\b(DerivedEntityTestProps)\\b)(?=.*\\b(BaseEntityTestProps)\\b).* } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export class BaseEntityTest extends Entity implements BaseEntityTestProps {
          public static get className(): string { return "BaseEntityTest"; }

          public constructor (props: BaseEntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`, utils.dedent`
        export class DerivedEntityTest extends BaseEntityTest implements DerivedEntityTestProps {
          public static get className(): string { return "DerivedEntityTest"; }

          public constructor (props: DerivedEntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: convert Entity class derived from another entity and mixin to ts
    {
      testName: `convert Entity class derived from another entity class and mixin to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMEntityClass typeName="DerivedEntityTest" modifier="None">
              <BaseClass>BaseEntityTest</BaseClass>
              <BaseClass>MixinTest</BaseClass>
              <BaseClass>DerivedMixinTest</BaseClass>
              <DMProperty propertyName="derivedIntProps" typeName="int"/>
          </DMEntityClass>
          <DMEntityClass typeName="BaseEntityTest" modifier="None">
              <DMProperty propertyName="intProps" typeName="int"/>
              <DMProperty propertyName="stringProps" typeName="string"/>
          </DMEntityClass>
          <DMEntityClass typeName="DerivedMixinTest" description="derived mixin" modifier="None">
            <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.01.00.00">
                    <AppliesToEntityClass>DerivedEntityTest</AppliesToEntityClass>
                </IsMixin>
            </DMCustomAttributes>
            <BaseClass>MixinTest</BaseClass>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="doubleProps" typeName="double"/>
          </DMEntityClass>
          <DMEntityClass typeName="MixinTest" description="mixin" modifier="None">
            <DMCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.01.00.00">
                    <AppliesToEntityClass>DerivedEntityTest</AppliesToEntityClass>
                </IsMixin>
            </DMCustomAttributes>
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="doubleProps" typeName="double"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface MixinTest {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          doubleProps?: number;
        }`, utils.dedent`
        export interface DerivedMixinTest extends MixinTest {
          binaryProps?: any;
          doubleProps?: number;
        }`, utils.dedent`
        export interface BaseEntityTestProps extends EntityProps {
          intProps?: number;
          stringProps?: string;
        }`, utils.dedent`
        export interface DerivedEntityTestProps extends BaseEntityTestProps, MixinTest, DerivedMixinTest {
          derivedIntProps?: number;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { (?=.*\\b(DerivedEntityTestProps)\\b)(?=.*\\b(BaseEntityTestProps)\\b).* } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export class BaseEntityTest extends Entity implements BaseEntityTestProps {
          public static get className(): string { return "BaseEntityTest"; }

          public constructor (props: BaseEntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`, utils.dedent`
        export class DerivedEntityTest extends BaseEntityTest implements DerivedEntityTestProps {
          public static get className(): string { return "DerivedEntityTest"; }

          public constructor (props: DerivedEntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: convert Struct class derived from another struct to Ts
    {
      testName: `convert struct class derived from another struct class to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMStructClass typeName="DerivedStructTest" description="derived struct" modifier="None">
            <BaseClass>StructTest</BaseClass>
            <DMProperty propertyName="derivedIntProps" typeName="int"/>
          </DMStructClass>
          <DMStructClass typeName="StructTest" description="struct" modifier="None">
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="point2DProps" typeName="point2d"/>
            <DMProperty propertyName="point3DProps" typeName="point3d"/>
          </DMStructClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { (?=.*\\b(Point2d)\\b)(?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface StructTest {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          point2DProps?: Point2d;
          point3DProps?: Point3d;
        }`, utils.dedent`
        export interface DerivedStructTest extends StructTest {
          derivedIntProps?: number;
        }`,
      ],
      expectedElemImportTs: [],
      expectedElemTs: [],
    },

    // Test Case: Entity class derived from one of the class in the BisCore
    {
      testName: `convert entity class derived from one of the class in BisCore to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="CoreCustomAttributes" version="01.00.00" alias="CoreCA"/>
          <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
          <DMEntityClass typeName="DerivedGeometricElement2d" modifier="None">
            <BaseClass>bis:GeometricElement2d</BaseClass>
            <DMProperty propertyName="intProps" typeName="int"/>
            <DMProperty propertyName="doubleProps" typeName="double"/>
          </DMEntityClass>
          <DMEntityClass typeName="DerivedElement" modifier="None">
            <BaseClass>bis:Element</BaseClass>
            <DMProperty propertyName="intProps" typeName="int"/>
          </DMEntityClass>
          <DMEntityClass typeName="DerivedAnnotationElement2d" modifier="None">
            <BaseClass>bis:AnnotationElement2d</BaseClass>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { (?=.*\\b(GeometricElement2dProps)\\b)(?=.*\\b(ElementProps)\\b).* } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface DerivedGeometricElement2dProps extends GeometricElement2dProps {
          intProps?: number;
          doubleProps?: number;
        }`, utils.dedent`
        export interface DerivedElementProps extends ElementProps {
          intProps?: number;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(IVaultDb)\\b)(?=.*\\b(Element)\\b)(?=.*\\b(AnnotationElement2d)\\b)(?=.*\\b(GeometricElement2d)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { (?=.*\\b(GeometricElement2dProps)\\b).* } from "@szewtwin/core-common";`),
        new RegExp(`import { (?=.*\\b(DerivedGeometricElement2dProps)\\b)(?=.*\\b(DerivedElementProps)\\b).* } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export class DerivedGeometricElement2d extends GeometricElement2d implements DerivedGeometricElement2dProps {
          public static get className(): string { return "DerivedGeometricElement2d"; }

          public constructor (props: DerivedGeometricElement2dProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`, utils.dedent`
        export class DerivedElement extends Element implements DerivedElementProps {
          public static get className(): string { return "DerivedElement"; }

          public constructor (props: DerivedElementProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`, utils.dedent`
        export class DerivedAnnotationElement2d extends AnnotationElement2d {
          public static get className(): string { return "DerivedAnnotationElement2d"; }

          public constructor (props: GeometricElement2dProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Entity class has no properties
    {
      testName: `convert entity class has no properties to Ts`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="CoreCustomAttributes" version="01.00.00" alias="CoreCA"/>
          <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
          <DMEntityClass typeName="DerivedElementTest" description="Derived Element Test class" modifier="None">
            <BaseClass>bis:Element</BaseClass>
          </DMEntityClass>
          <DMEntityClass typeName="DerivedEntityTest" description="Derived Entity Test class" modifier="None">
              <BaseClass>BaseEntityTest</BaseClass>
          </DMEntityClass>
          <DMEntityClass typeName="BaseEntityTest" description="Base Entity Test class" modifier="None">
            <DMProperty propertyName="intProps" typeName="int"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { (?=.*\\b(EntityProps)\\b).* } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface BaseEntityTestProps extends EntityProps {
          intProps?: number;
          stringProps?: string;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b)(?=.*\\b(Element)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { (?=.*\\b(ElementProps)\\b).* } from "@szewtwin/core-common";`),
        new RegExp(`import { (?=.*\\b(BaseEntityTestProps)\\b).* } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export class DerivedElementTest extends Element {
          public static get className(): string { return "DerivedElementTest"; }

          public constructor (props: ElementProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`, utils.dedent`
        export class BaseEntityTest extends Entity implements BaseEntityTestProps {
          public static get className(): string { return "BaseEntityTest"; }

          public constructor (props: BaseEntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`, utils.dedent`
        export class DerivedEntityTest extends BaseEntityTest {
          public static get className(): string { return "DerivedEntityTest"; }

          public constructor (props: BaseEntityTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: correct order of base classes
    {
      testName: `Test Order of Base Classes`,
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="CoreCustomAttributes" version="01.00.00" alias="CoreCA"/>
          <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
          <DMEntityClass typeName="DerivedElementTest" description="Derived Element Test class" modifier="None">
            <BaseClass>BaseEntity</BaseClass>
            <DMProperty propertyName="stringProps" typeName="string"/>
          </DMEntityClass>
          <DMEntityClass typeName="BaseEntity" description="Base Entity Test class" modifier="None">
            <BaseClass>NormalEntity</BaseClass>
            <DMProperty propertyName="intProps" typeName="int"/>
          </DMEntityClass>
          <DMEntityClass typeName="Mixin" description="This Is A Mixin class" modifier="None">
            <DMCustomAttributes>
              <IsMixin xmlns="CoreCustomAttributes.01.00.00">
                  <AppliesToEntityClass>NormalEntity</AppliesToEntityClass>
              </IsMixin>
            </DMCustomAttributes>
            <DMProperty propertyName="booleanProps" typeName="boolean"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
            <DMProperty propertyName="binaryProps" typeName="binary"/>
            <DMProperty propertyName="doubleProps" typeName="double"/>
          </DMEntityClass>
          <DMEntityClass typeName="NormalEntity" description="Normal Test class" modifier="None">
            <BaseClass>bis:AnnotationElement2d</BaseClass>
            <BaseClass>Mixin</BaseClass>
            <DMProperty propertyName="intProps" typeName="int"/>
            <DMProperty propertyName="stringProps" typeName="string"/>
          </DMEntityClass>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { (?=.*\\b(GeometricElement2dProps)\\b).* } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        /**
         * This Is A Mixin class
         */
        export interface Mixin {
          booleanProps?: boolean;
          stringProps?: string;
          binaryProps?: any;
          doubleProps?: number;
        }

        export interface NormalEntityProps extends GeometricElement2dProps, Mixin {
          intProps?: number;
          stringProps?: string;
        }

        export interface BaseEntityProps extends NormalEntityProps {
          intProps?: number;
        }

        export interface DerivedElementTestProps extends BaseEntityProps {
          stringProps?: string;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(AnnotationElement2d)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { (?=.*\\b(NormalEntityProps)\\b)(?=.*\\b(BaseEntityProps)\\b)(?=.*\\b(DerivedElementTestProps)\\b).* } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        /**
         * Normal Test class
         */
        export class NormalEntity extends AnnotationElement2d implements NormalEntityProps {
          public static get className(): string { return "NormalEntity"; }

          public constructor (props: NormalEntityProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }

        /**
         * Base Entity Test class
         */
        export class BaseEntity extends NormalEntity implements BaseEntityProps {
          public static get className(): string { return "BaseEntity"; }

          public constructor (props: BaseEntityProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }

        /**
         * Derived Element Test class
         */
        export class DerivedElementTest extends BaseEntity implements DerivedElementTestProps {
          public static get className(): string { return "DerivedElementTest"; }

          public constructor (props: DerivedElementTestProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },

    // Test Case: Xml Deserialization should not crash when references Units and Formats
    {
      testName: "Xml Deserialization should not crash when parsing Units and Formats",
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="Units" version="01.00.00" alias="u"/>
          <DMSchemaReference name="Formats" version="01.00.00" alias="f"/>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [],
      expectedPropsTs: [],
      expectedElemImportTs: [],
      expectedElemTs: [],
    },

    // Test Case: Xml Deserialization should not crash when parsing KoQ's persistentUnit and presentationUnits
    {
      testName: "Xml Deserialization should not crash when parsing KoQ's persistentUnit and presentationUnits",
      referenceXmls: [],
      schemaXml: `<?xml version="1.0" encoding="utf-8"?>
        <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="Units" version="01.00.00" alias="u"/>
          <DMSchemaReference name="Formats" version="01.00.00" alias="f"/>
          <DMEntityClass typeName="TestEntity" description="TestEntity Test class" modifier="None">
            <DMArrayProperty propertyName="intArrayProp" typeName="int" minimumValue="0" maximumValue="10000" kindOfQuantity="KindOfQuantity"/>
            <DMProperty propertyName="doubleProp" typeName="double" minimumValue="0" maximumValue="10000" kindOfQuantity="KindOfQuantityAlternative"/>
          </DMEntityClass>
          <KindOfQuantity typeName="KindOfQuantity"
                          description="Kind of Quantity Description"
                          displayLabel="Kind of Quantity"
                          persistenceUnit="u:CM"
                          relativeError="0.001"
                          presentationUnits="f:DefaultReal(6)[u:FT|feet];f:DefaultReal[u:IN|inch];f:DefaultReal(8)[u:CM|centimeter][u:M|meter]"/>
          <KindOfQuantity typeName="KindOfQuantityAlternative"
                          description="Kind of Quantity Description"
                          displayLabel="Kind of Quantity"
                          persistenceUnit="u:CM"
                          relativeError="1E-3"
                          presentationUnits="f:DefaultReal(6)[u:FT|feet];f:DefaultReal[u:IN|inch];f:DefaultReal(8)[u:CM|centimeter][u:M|meter]"/>
        </DMSchema>`,
      expectedSchemaImportTs: utils.createExpectedSchemaImportTs("TestSchema"),
      expectedSchemaTs: utils.createExpectedSchemaTsString("TestSchema"),
      expectedPropsImportTs: [
        new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
      ],
      expectedPropsTs: [utils.dedent`
        export interface TestEntityProps extends EntityProps {
          intArrayProp?: number[];
          doubleProp?: number;
        }`,
      ],
      expectedElemImportTs: [
        new RegExp(`import { (?=.*\\b(Entity)\\b)(?=.*\\b(IVaultDb)\\b).* } from "@szewtwin/core-backend";`),
        new RegExp(`import { TestEntityProps } from "./TestSchemaElementProps";`),
      ],
      expectedElemTs: [utils.dedent`
        export class TestEntity extends Entity implements TestEntityProps {
          public static get className(): string { return "TestEntity"; }

          public constructor (props: TestEntityProps, iVault: IVaultDb) {
            super(props, iVault);
          }
        }`,
      ],
    },
  ];

  utils.testGeneratedSchemaTypescript(testCases);
});
