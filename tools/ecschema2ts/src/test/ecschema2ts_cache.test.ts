/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DMSchemaToTs } from "../ecschema2ts";
import { assert } from "chai";
import * as utils from "./utilities/utils";
import { SchemaContext } from "@szewtwin/dmschema-metadata";
import { SchemaXmlFileLocater } from "@szewtwin/dmschema-locaters";

describe("BisCore Cache test", () => {
  it("For DMEntity class with BaseClass in BisCore, find the correct BisCore props interface to extend", () => {
    const schemaXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="MyDomain" alias="mydomain" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
        <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
        <DMSchemaReference name="DMDbMap" version="02.00.00" alias="dmdbmap"/>

        <DMEntityClass typeName="Building" modifier="Sealed">
          <BaseClass>bis:SpatialLocationElement</BaseClass>
          <BaseClass>bis:IParentElement</BaseClass>
        </DMEntityClass>
      </DMSchema>`;

    const expectedSchemaString =
      `import { ClassRegistry, Schema, Schemas } from "@szewtwin/core-backend";
import * as elementsModule from "./MyDomainElements";

export class MyDomain extends Schema {
  public static get schemaName(): string { return "MyDomain"; }

  public static registerSchema() {
    if (!Schemas.getRegisteredSchema(MyDomain.name))
      Schemas.registerSchema(MyDomain);
  }

  protected constructor() {
    super();
    ClassRegistry.registerModule(elementsModule, MyDomain);
  }
}\n\n`;

    const expectedElementString =
      `import { SpatialLocationElement, IVaultDb } from "@szewtwin/core-backend";
import { GeometricElement3dProps } from "@szewtwin/core-common";

export class Building extends SpatialLocationElement {
  public static get className(): string { return "Building"; }

  public constructor (props: GeometricElement3dProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}\n\n`;

    const schemaLocator = new SchemaXmlFileLocater();
    schemaLocator.addSchemaSearchPath(`${utils.getAssetsDir()}schema3.2`);
    const context = new SchemaContext();
    context.addLocater(schemaLocator);

    const schema = utils.deserializeXml(context, schemaXml);
    const ecschema2ts = new DMSchemaToTs();
    const { schemaTsString, elemTsString, propsTsString } = ecschema2ts.convertSchemaToTs(schema);
    assert.equal(schemaTsString, expectedSchemaString);
    assert.equal(propsTsString, `\n`);
    assert.equal(elemTsString, expectedElementString);
  });
});
