/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as utils from "./utilities/utils";

describe("dmjson properties to ts", () => {
  describe("primitive property", () => {
    const testCases: utils.PropertyTestCase[] = [
      // Test Case: Class with binary property
      {
        testName: `Class with binary property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="BinaryProp" typeName="binary"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            binaryProp?: any;
          }`,
        ],
      },

      // Test Case: Class with point3d type
      {
        testName: `Class with point3d property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="Point3dProp" typeName="point3d"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
          new RegExp(`import { (?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            point3dProp?: Point3d;
          }`,
        ],
      },

      // Test Case: Class with point2d type
      {
        testName: `Class with point2d property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="Point2dProp" typeName="point2d"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
          new RegExp(`import { (?=.*\\b(Point2d)\\b).* } from "@szewtwin/core-geometry";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            point2dProp?: Point2d;
          }`,
        ],
      },

      // Test Case: Class with bool type
      {
        testName: `Class with bool property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="BoolProp" typeName="bool"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            boolProp?: boolean;
          }`,
        ],
      },

      // Test Case: Class with int type
      {
        testName: `Class with int property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="IntProp" typeName="int"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            intProp?: number;
          }`,
        ],
      },

      // Test Case: Class with double type
      {
        testName: `Class with double property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="DoubleProp" typeName="double"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            doubleProp?: number;
          }`,
        ],
      },

      // Test Case: Class with datetime
      {
        testName: `Class with datetime property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="DateTimeProp" typeName="dateTime"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            dateTimeProp?: Date;
          }`,
        ],
      },

      // Test Case: Class with string
      {
        testName: `Class with string property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="StringProp" typeName="string"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            stringProp?: string;
          }`,
        ],
      },

      // Test Case: Class with long
      {
        testName: `Class with long property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMProperty propertyName="LongProp" typeName="long"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            longProp?: any;
          }`,
        ],
      }];

    utils.testGeneratedTypescriptProperty(testCases);
  });

  describe("navigation", () => {
    const testCases: utils.PropertyTestCase[] = [
      // Test Case: Class with navigation
      {
        testName: `Class with navigation property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="01.00.00" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
            <DMEntityClass typeName="TestClass" modifier="None">
              <DMNavigationProperty propertyName="NavProp" relationshipName="bis:ElementScopesCode" direction="backward"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { (?=.*\\b(EntityProps)\\b)(?=.*\\b(RelatedElementProps)\\b).* } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            navProp?: RelatedElementProps;
          }`,
        ],
      }];

    utils.testGeneratedTypescriptProperty(testCases);
  });

  describe("struct property", () => {
    const testCases: utils.PropertyTestCase[] = [
      // Test Case: Class with struct
      {
        testName: `Class with struct property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMStructClass typeName="DerivedStruct" modifier="None">
                <DMProperty propertyName="IntProp" typeName="int"/>
                <DMProperty propertyName="DoubleProp" typeName="double"/>
            </DMStructClass>
            <DMEntityClass typeName="TestClass" modifier="None">
                <DMStructProperty propertyName="StructProp" typeName="DerivedStruct"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            structProp?: DerivedStruct;
          }`,
        ],
      },

      // Test Case: Class with struct in reference schema
      {
        testName: `Class with struct property in reference schema`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="RefTest" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMStructClass typeName="DerivedStruct" modifier="None">
                <DMProperty propertyName="IntProp" typeName="int"/>
                <DMProperty propertyName="DoubleProp" typeName="double"/>
            </DMStructClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="RefTest" version="01.00.00" alias="ref"/>
            <DMEntityClass typeName="TestClass" modifier="None">
                <DMStructProperty propertyName="StructProp" typeName="ref:DerivedStruct"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
          new RegExp(`import { DerivedStruct } from "./RefTestElementProps";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            structProp?: DerivedStruct;
          }`,
        ],
      },
    ];

    utils.testGeneratedTypescriptProperty(testCases);
  });

  describe("primitive array property", () => {
    const testCases: utils.PropertyTestCase[] = [
      // Test Case: Class with primitive array property
      {
        testName: `Class with primitive array property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMEntityClass typeName="TestClass" modifier="None">
                <DMArrayProperty propertyName="BinaryArrayProp" typeName="binary" minOccurs="0" maxOccurs="unbounded"/>
                <DMArrayProperty propertyName="BoolArrayProp" typeName="bool" minOccurs="0" maxOccurs="unbounded"/>
                <DMArrayProperty propertyName="DoubleArrayProp" typeName="double" minOccurs="0" maxOccurs="unbounded"/>
                <DMArrayProperty propertyName="IntArrayProp" typeName="int" minOccurs="0" maxOccurs="unbounded"/>
                <DMArrayProperty propertyName="Point2dArrayProp" typeName="point2d" minOccurs="0" maxOccurs="unbounded"/>
                <DMArrayProperty propertyName="Point3dArrayProp" typeName="point3d" minOccurs="0" maxOccurs="unbounded"/>
                <DMArrayProperty propertyName="StringArrayProp" typeName="string" minOccurs="0" maxOccurs="unbounded"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
          new RegExp(`import { (?=.*\\b(Point2d)\\b)(?=.*\\b(Point3d)\\b).* } from "@szewtwin/core-geometry";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            binaryArrayProp?: any[];
            boolArrayProp?: boolean[];
            doubleArrayProp?: number[];
            intArrayProp?: number[];
            point2dArrayProp?: Point2d[];
            point3dArrayProp?: Point3d[];
            stringArrayProp?: string[];
          }`,
        ],
      }];

    utils.testGeneratedTypescriptProperty(testCases);
  });

  describe("struct array property", () => {
    const testCases: utils.PropertyTestCase[] = [
      // Test Case: Class with struct array property
      {
        testName: `Class with struct array property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMStructClass typeName="TestStruct" modifier="None">
                <DMProperty propertyName="IntProp" typeName="int"/>
                <DMProperty propertyName="DoubleProp" typeName="double"/>
            </DMStructClass>
            <DMEntityClass typeName="TestClass" modifier="None">
                <DMStructArrayProperty propertyName="StructArrayProp" typeName="TestStruct" minOccurs="0" maxOccurs="unbounded"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            structArrayProp?: TestStruct[];
          }`,
        ],
      },

      // Test Case: Class with struct array property in reference schema
      {
        testName: `Class with struct array property in reference schema`,
        referenceXmls: [
          `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="RefTest" alias="ref" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMStructClass typeName="TestStruct" modifier="None">
                <DMProperty propertyName="IntProp" typeName="int"/>
                <DMProperty propertyName="DoubleProp" typeName="double"/>
            </DMStructClass>
          </DMSchema>`,
        ],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="RefTest" version="01.00.00" alias="ref"/>
            <DMEntityClass typeName="TestClass" modifier="None">
                <DMStructArrayProperty propertyName="StructArrayProp" typeName="ref:TestStruct" minOccurs="0" maxOccurs="unbounded"/>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
          new RegExp(`import { TestStruct } from "./RefTestElementProps";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            structArrayProp?: TestStruct[];
          }`,
        ],
      },
    ];

    utils.testGeneratedTypescriptProperty(testCases);
  });

  describe("do not add custom handled properties", () => {
    const testCases: utils.PropertyTestCase[] = [
      // Test Case: Class with struct array property
      {
        testName: `Class with struct array property`,
        referenceXmls: [],
        schemaXml: `<?xml version="1.0" encoding="utf-8"?>
          <DMSchema schemaName="TestSchema" alias="ts" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
            <DMSchemaReference name="CoreCustomAttributes" version="01.00.00" alias="CoreCA"/>
            <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
            <DMStructClass typeName="TestStruct" modifier="None">
                <DMProperty propertyName="IntProp" typeName="int"/>
            </DMStructClass>
            <DMEntityClass typeName="TestClass" modifier="None">
                <DMProperty propertyName="StringProp" typeName="string">
                  <DMCustomAttributes>
                      <CustomHandledProperty xmlns="BisCore.01.00.00"/>
                  </DMCustomAttributes>
                </DMProperty>
                <DMProperty propertyName="IntProp" typeName="int"/>
                <DMStructArrayProperty propertyName="StructArrayProp" typeName="TestStruct" minOccurs="0" maxOccurs="unbounded"/>
                <DMStructArrayProperty propertyName="StructCustomHandledArrayProp" typeName="TestStruct" minOccurs="0" maxOccurs="unbounded">
                  <DMCustomAttributes>
                      <CustomHandledProperty xmlns="BisCore.01.00.00"/>
                  </DMCustomAttributes>
                </DMStructArrayProperty>
                <DMNavigationProperty propertyName="NavProp" relationshipName="bis:ElementScopesCode" direction="backward">
                  <DMCustomAttributes>
                      <CustomHandledProperty xmlns="BisCore.01.00.00"/>
                  </DMCustomAttributes>
                </DMNavigationProperty>
            </DMEntityClass>
          </DMSchema>`,
        expectedPropsImportTs: [
          new RegExp(`import { EntityProps } from "@szewtwin/core-common";`),
        ],
        expectedPropsTs: [utils.dedent`
          export interface TestClassProps extends EntityProps {
            intProp?: number;
            structArrayProp?: TestStruct[];
          }`,
        ],
      }];

    utils.testGeneratedTypescriptProperty(testCases);
  });
});
