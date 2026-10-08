/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DMSchemaToTs } from "../ecschema2ts";
import { assert } from "chai";
import * as utils from "./utilities/utils";
import { SchemaContext } from "@szewtwin/dmschema-metadata";
import { SchemaXmlFileLocater } from "@szewtwin/dmschema-locaters";

describe("BisCore test correct inheritance", () => {
  let ecschema2ts: DMSchemaToTs;
  beforeEach(() => {
    ecschema2ts = new DMSchemaToTs();
  });

  it("of class that subclasses Element with additional properties", () => {
    const schemaXml = `
<?xml version="1.0" encoding="UTF-8"?>
<DMSchema schemaName="BisCore" alias="bis" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
  <DMEntityClass typeName="Element" modifier="Abstract">
    <DMCustomAttributes>
      <CustomHandledProperty xmlns="BisCore.1.0.0"/>
    </DMCustomAttributes>
    <DMProperty propertyName="TestProp" typeName="string"/>
  </DMEntityClass>
  <DMEntityClass typeName="DerivedElement">
    <BaseClass>Element</BaseClass>
    <DMProperty propertyName="DerivedTestProp" typeName="string"/>
  </DMEntityClass>

  <DMCustomAttributeClass typeName="CustomHandledProperty" description="Applied to an element's property to indicate that the property's value is handled specially by a C++ class." appliesTo="AnyProperty">
      <DMProperty propertyName="StatementTypes" typeName="CustomHandledPropertyStatementType"/>
  </DMCustomAttributeClass>
  <DMEnumeration typeName="CustomHandledPropertyStatementType" backingTypeName="int" isStrict="true">
      <DMEnumerator name="CustomHandledPropertyStatementType0" value="0" displayLabel="None"/>
      <DMEnumerator name="CustomHandledPropertyStatementType1" value="1" displayLabel="Select"/>
      <DMEnumerator name="CustomHandledPropertyStatementType2" value="2" displayLabel="Insert"/>
      <DMEnumerator name="CustomHandledPropertyStatementType3" value="3" displayLabel="ReadOnly = Select|Insert"/>
      <DMEnumerator name="CustomHandledPropertyStatementType4" value="4" displayLabel="Update"/>
      <DMEnumerator name="CustomHandledPropertyStatementType6" value="6" displayLabel="InsertUpdate = Insert | Update"/>
      <DMEnumerator name="CustomHandledPropertyStatementType7" value="7" displayLabel="All = Select | Insert | Update"/>
  </DMEnumeration>
</DMSchema>`;

    const expectedElementSchemaString =
      `import { Entity, IVaultDb } from "@szewtwin/core-backend";
import { EntityProps } from "@szewtwin/core-common";
import { DerivedElementProps } from "./BisCoreElementProps";

export abstract class Element extends Entity {
  public static get className(): string { return "Element"; }

  public constructor (props: EntityProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

export const enum CustomHandledPropertyStatementType {
  None = 0,
  Select = 1,
  Insert = 2,
  ReadOnly = Select|Insert = 3,
  Update = 4,
  InsertUpdate = Insert | Update = 6,
  All = Select | Insert | Update = 7,
}

export class DerivedElement extends Element implements DerivedElementProps {
  public static get className(): string { return "DerivedElement"; }

  public constructor (props: DerivedElementProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}\n\n`;

    const expectedPropsSchemaString =
      `import { ElementProps } from "@szewtwin/core-common";

export interface DerivedElementProps extends ElementProps {
  derivedTestProp?: string;
}\n\n`;

    const context = new SchemaContext();
    const schema = utils.deserializeXml(context, schemaXml);
    const { elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);

    assert.equal(propsTsString, expectedPropsSchemaString);
    assert.equal(elemTsString, expectedElementSchemaString);
  });

  it("of class that subclasses Element without additional properties", () => {
    const schemaXml =
      `<?xml version="1.0" encoding="UTF-8"?>
<DMSchema schemaName="BisCore" alias="bis" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
  <DMEntityClass typeName="Element" modifier="Abstract">
    <DMCustomAttributes>
      <CustomHandledProperty xmlns="BisCore.01.00.00"/>
    </DMCustomAttributes>
    <DMProperty propertyName="TestProp" typeName="string"/>
  </DMEntityClass>
  <DMEntityClass typeName="DerivedElement">
    <BaseClass>Element</BaseClass>
  </DMEntityClass>

  <DMCustomAttributeClass typeName="CustomHandledProperty" description="Applied to an element's property to indicate that the property's value is handled specially by a C++ class." appliesTo="AnyProperty">
      <DMProperty propertyName="StatementTypes" typeName="CustomHandledPropertyStatementType"/>
  </DMCustomAttributeClass>
  <DMEnumeration typeName="CustomHandledPropertyStatementType" backingTypeName="int" isStrict="true">
      <DMEnumerator name="CustomHandledPropertyStatementType0" value="0" displayLabel="None"/>
      <DMEnumerator name="CustomHandledPropertyStatementType1" value="1" displayLabel="Select"/>
      <DMEnumerator name="CustomHandledPropertyStatementType2" value="2" displayLabel="Insert"/>
      <DMEnumerator name="CustomHandledPropertyStatementType3" value="3" displayLabel="ReadOnly = Select|Insert"/>
      <DMEnumerator name="CustomHandledPropertyStatementType4" value="4" displayLabel="Update"/>
      <DMEnumerator name="CustomHandledPropertyStatementType6" value="6" displayLabel="InsertUpdate = Insert | Update"/>
      <DMEnumerator name="CustomHandledPropertyStatementType7" value="7" displayLabel="All = Select | Insert | Update"/>
  </DMEnumeration>
</DMSchema>`;

    const expectedElementSchemaString =
      `import { Entity, IVaultDb } from "@szewtwin/core-backend";
import { EntityProps, ElementProps } from "@szewtwin/core-common";

export abstract class Element extends Entity {
  public static get className(): string { return "Element"; }

  public constructor (props: EntityProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

export const enum CustomHandledPropertyStatementType {
  None = 0,
  Select = 1,
  Insert = 2,
  ReadOnly = Select|Insert = 3,
  Update = 4,
  InsertUpdate = Insert | Update = 6,
  All = Select | Insert | Update = 7,
}

export class DerivedElement extends Element {
  public static get className(): string { return "DerivedElement"; }

  public constructor (props: ElementProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}\n\n`;
    const context = new SchemaContext();
    const schema = utils.deserializeXml(context, schemaXml);
    const { elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);

    assert.equal(propsTsString, `\n`);
    assert.equal(elemTsString, expectedElementSchemaString);
  });

  it("with multiple levels derived from Element without properties", () => {
    // A modified heirarchy of the bis schema to test a specific use case.
    const schemaXml = `
<?xml version="1.0" encoding="UTF-8"?>
<DMSchema schemaName="BisCore" alias="bis" version="1.0.0" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
  <DMEntityClass typeName="Element" modifier="Abstract">
    <DMProperty propertyName="LastMod" typeName="int">
      <DMCustomAttributes>
          <CustomHandledProperty xmlns="BisCore.01.00.00">
              <StatementTypes>0</StatementTypes>
          </CustomHandledProperty>
      </DMCustomAttributes>
    </DMProperty>
  </DMEntityClass>
  <DMEntityClass typeName="InformationContentElement" modifier="Abstract">
    <BaseClass>Element</BaseClass>
  </DMEntityClass>
  <DMEntityClass typeName="InformationReferenceElement" modifier="Abstract">
    <BaseClass>InformationContentElement</BaseClass>
  </DMEntityClass>
  <DMEntityClass typeName="Subject" modifier="Sealed">
    <BaseClass>InformationReferenceElement</BaseClass>
    <BaseClass>IParentElement</BaseClass>
    <DMProperty propertyName="Description" typeName="string"/>
  </DMEntityClass>
  <DMEntityClass typeName="IParentElement" modifier="Abstract">
    <DMCustomAttributes>
      <IsMixin xmlns="CoreCustomAttributes.1.0">
        <AppliesToEntityClass>Element</AppliesToEntityClass>
      </IsMixin>
    </DMCustomAttributes>
  </DMEntityClass>

  <DMCustomAttributeClass typeName="CustomHandledProperty" description="Applied to an element's property to indicate that the property's value is handled specially by a C++ class." appliesTo="AnyProperty">
      <DMProperty propertyName="StatementTypes" typeName="CustomHandledPropertyStatementType"/>
  </DMCustomAttributeClass>
  <DMEnumeration typeName="CustomHandledPropertyStatementType" backingTypeName="int" isStrict="true">
      <DMEnumerator name="CustomHandledPropertyStatementType0" value="0" displayLabel="None"/>
      <DMEnumerator name="CustomHandledPropertyStatementType1" value="1" displayLabel="Select"/>
      <DMEnumerator name="CustomHandledPropertyStatementType2" value="2" displayLabel="Insert"/>
      <DMEnumerator name="CustomHandledPropertyStatementType3" value="3" displayLabel="ReadOnly = Select|Insert"/>
      <DMEnumerator name="CustomHandledPropertyStatementType4" value="4" displayLabel="Update"/>
      <DMEnumerator name="CustomHandledPropertyStatementType6" value="6" displayLabel="InsertUpdate = Insert | Update"/>
      <DMEnumerator name="CustomHandledPropertyStatementType7" value="7" displayLabel="All = Select | Insert | Update"/>
  </DMEnumeration>
</DMSchema>`;

    const expectedElementSchemaString =
      `import { Entity, IVaultDb } from "@szewtwin/core-backend";
import { EntityProps, ElementProps } from "@szewtwin/core-common";
import { SubjectProps } from "./BisCoreElementProps";

export abstract class Element extends Entity {
  public static get className(): string { return "Element"; }

  public constructor (props: EntityProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

export const enum CustomHandledPropertyStatementType {
  None = 0,
  Select = 1,
  Insert = 2,
  ReadOnly = Select|Insert = 3,
  Update = 4,
  InsertUpdate = Insert | Update = 6,
  All = Select | Insert | Update = 7,
}

export abstract class InformationContentElement extends Element {
  public static get className(): string { return "InformationContentElement"; }

  public constructor (props: ElementProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

export abstract class InformationReferenceElement extends InformationContentElement {
  public static get className(): string { return "InformationReferenceElement"; }

  public constructor (props: ElementProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

export class Subject extends InformationReferenceElement implements SubjectProps {
  public static get className(): string { return "Subject"; }

  public constructor (props: SubjectProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}\n\n`;

    const expectedPropSchemaString =
      `import { ElementProps } from "@szewtwin/core-common";

export interface IParentElement {
}

export interface SubjectProps extends ElementProps {
  description?: string;
}\n\n`;

    const context = new SchemaContext();
    const schema = utils.deserializeXml(context, schemaXml);
    const { elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);

    assert.equal(elemTsString, expectedElementSchemaString);
    assert.equal(propsTsString, expectedPropSchemaString);
  });
});

describe("Referencing BisCore", () => {
  it("as a base class", () => {
    const schemaXml = `
<?xml version="1.0" encoding="UTF-8"?>
<DMSchema schemaName="DMObjects" alias="eco" version="02.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
  <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
  <DMEntityClass typeName="SchemaDictionary" modifer="Sealed" description="The singleton container of SchemaDef Elements">
      <BaseClass>bis:DefinitionModel</BaseClass>
  </DMEntityClass>

  <!-- A Model that models SchemaDef elements contained in the SchemasDefinitionModel -->
  <DMEntityClass typeName="SchemaModel" modifier="Sealed" description="A container for SchemaChild elements">
    <BaseClass>bis:DefinitionModel</BaseClass>
  </DMEntityClass>
</DMSchema>`;

    const expectedElementSchemaString =
      `import { DefinitionModel, IVaultDb } from "@szewtwin/core-backend";
import { ModelProps } from "@szewtwin/core-common";

/**
 * The singleton container of SchemaDef Elements
 */
export class SchemaDictionary extends DefinitionModel {
  public static get className(): string { return "SchemaDictionary"; }

  public constructor (props: ModelProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

/**
 * A container for SchemaChild elements
 */
export class SchemaModel extends DefinitionModel {
  public static get className(): string { return "SchemaModel"; }

  public constructor (props: ModelProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}\n\n`;

    const schemaLocator = new SchemaXmlFileLocater();
    schemaLocator.addSchemaSearchPath(`${utils.getAssetsDir()}schema3.2`);
    const context = new SchemaContext();
    context.addLocater(schemaLocator);
    const schema = utils.deserializeXml(context, schemaXml);
    const ecschema2ts = new DMSchemaToTs();
    const { elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);

    assert.equal(propsTsString, `\n`);
    assert.equal(elemTsString, expectedElementSchemaString);
  });
});
