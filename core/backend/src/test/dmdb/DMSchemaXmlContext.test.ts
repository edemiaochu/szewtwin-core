/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { DMSchemaXmlContext, SchemaKey } from "../../DMSchemaXmlContext";
import { KnownTestLocations } from "../KnownTestLocations";
import { SequentialLogMatcher } from "../SequentialLogMatcher";

describe("DMSchemaXmlContext", () => {

  it("should be able to convert schema XML to JSON", () => {
    const testSchemaXmlPath = path.join(KnownTestLocations.assetsDir, "TestSchema.dmschema.xml");
    const testSchemaJsonPath = path.join(KnownTestLocations.assetsDir, "TestSchema.dmschema.json");
    const expectedTestSchemaJson = JSON.parse(fs.readFileSync(testSchemaJsonPath, { encoding: "utf-8" }));

    const context = new DMSchemaXmlContext();
    const schema = context.readSchemaFromXmlFile(testSchemaXmlPath);
    expect(schema).to.eql(expectedTestSchemaJson);
  });

  it("setSchemaLocater, should call schema locater callback for missing schema references", () => {
    const slm = new SequentialLogMatcher();
    slm.append().error().category("DMObjectsNative").message(/Unable to locate referenced schema BisCore\.01\.00\.00 while deserializing TestDomain\.01\.00\.00/gm);
    slm.append().error().category("DMObjectsNative").message(/Failed to read schema 'TestDomain\.01\.00\.00'/gm);
    const testDomainXmlPath = path.join(KnownTestLocations.assetsDir, "TestDomain.dmschema.xml");
    const expectedBisCoreKey = {
      name: "BisCore",
      readVersion: 1,
      writeVersion: 0,
      minorVersion: 0,
    };
    const context = new DMSchemaXmlContext();
    const missingReferences: SchemaKey[] = [];
    context.setSchemaLocater((key: SchemaKey) => {
      missingReferences.push(key);
    });

    expect(() => context.readSchemaFromXmlFile(testDomainXmlPath)).to.throw("ReferencedSchemaNotFound");
    expect(missingReferences).to.have.lengthOf(1);
    expect(missingReferences[0]).to.eql(expectedBisCoreKey);
    expect(slm.finishAndDispose()).to.true;
  });

  it("setFirstSchemaLocater, should call schema locater callback for missing schema references", () => {
    const slm = new SequentialLogMatcher();
    slm.append().error().category("DMObjectsNative").message(/Unable to locate referenced schema BisCore\.01\.00\.00 while deserializing TestDomain\.01\.00\.00/gm);
    slm.append().error().category("DMObjectsNative").message(/Failed to read schema 'TestDomain\.01\.00\.00'/gm);
    const testDomainXmlPath = path.join(KnownTestLocations.assetsDir, "TestDomain.dmschema.xml");
    const expectedBisCoreKey = {
      name: "BisCore",
      readVersion: 1,
      writeVersion: 0,
      minorVersion: 0,
    };
    const context = new DMSchemaXmlContext();
    const missingReferences: SchemaKey[] = [];
    context.setFirstSchemaLocater((key: SchemaKey) => {
      missingReferences.push(key);
    });

    expect(() => context.readSchemaFromXmlFile(testDomainXmlPath)).to.throw("ReferencedSchemaNotFound");
    expect(missingReferences).to.have.lengthOf(1);
    expect(missingReferences[0]).to.eql(expectedBisCoreKey);
    expect(slm.finishAndDispose()).to.true;
  });
});
