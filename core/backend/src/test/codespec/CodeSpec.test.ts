/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Guid, Id64 } from "@szewtwin/core-szewec";
import { CodeScopeSpec, CodeSpec, EditTxnError } from "@szewtwin/core-common";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { StandaloneDb } from "../../IVaultDb";
import { EditTxn, withEditTxn } from "../../EditTxn";

describe("CodeSpec", () => {
  let ivault: StandaloneDb;
  before(() => {
    ivault = StandaloneDb.createEmpty(IVaultTestUtils.prepareOutputFile("CodeSpec", "CodeSpec.dtw"), {
      rootSubject: { name: "CodeSpec tests", description: "CodeSpec tests" },
      client: "CodeSpec",
      globalOrigin: { x: 0, y: 0 },
      projectExtents: { low: { x: -500, y: -500, z: -50 }, high: { x: 500, y: 500, z: 50 } },
      guid: Guid.createValue(),
    });
  });

  after(() => {
    ivault.close();
  });

  it("should insert with default properties and update them later", () => {
    let codeSpec = CodeSpec.create(ivault, "PumpTag", CodeScopeSpec.Type.Model);
    const codeSpecId = withEditTxn(ivault, (txn) => ivault.codeSpecs.insert(txn, codeSpec));
    expect(Id64.isValidId64(codeSpecId)).to.be.true;
    expect(codeSpecId).to.be.equal(codeSpec.id);

    codeSpec = ivault.codeSpecs.getById(codeSpecId);

    expect(codeSpec.scopeReq).to.be.equal(CodeScopeSpec.ScopeRequirement.ElementId);
    expect(codeSpec.scopeType).to.be.equal(CodeScopeSpec.Type.Model);
    expect(codeSpec.isExternal).false;

    codeSpec.scopeReq = CodeScopeSpec.ScopeRequirement.FederationGuid;
    codeSpec.scopeType = CodeScopeSpec.Type.Repository;
    withEditTxn(ivault, (txn) => ivault.codeSpecs.updateProperties(txn, codeSpec));
    const fname = ivault.pathName;
    ivault.close();
    ivault = StandaloneDb.openFile(fname);

    codeSpec = ivault.codeSpecs.getByName("PumpTag");
    expect(codeSpecId).to.be.equal(codeSpec.id);
    expect(codeSpec.name).equal("PumpTag");
    expect(codeSpec.isExternal).true;

    expect(codeSpec.scopeReq).to.be.equal(CodeScopeSpec.ScopeRequirement.FederationGuid);
    expect(codeSpec.scopeType).to.be.equal(CodeScopeSpec.Type.Repository);

    codeSpec = ivault.codeSpecs.getById(codeSpecId);
    expect(codeSpec.name).to.be.equal("PumpTag");
  });

  it("supports deprecated insert overloads when implicit writes are allowed", () => {
    const previousEnforcement = EditTxn.implicitWriteEnforcement;
    EditTxn.implicitWriteEnforcement = "allow";

    try {
      const suffix = Guid.createValue().replace(/-/g, "");
      const legacySpecName = `LegacyCodeSpec_${suffix}`;
      const legacyTypeName = `LegacyTypeCodeSpec_${suffix}`;

      const legacySpec = CodeSpec.create(ivault, legacySpecName, CodeScopeSpec.Type.Model);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const legacySpecId = ivault.codeSpecs.insert(legacySpec);
      expect(Id64.isValidId64(legacySpecId)).to.be.true;
      expect(legacySpec.id).to.equal(legacySpecId);
      expect(ivault.codeSpecs.getByName(legacySpecName).id).to.equal(legacySpecId);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const legacyTypeSpecId = ivault.codeSpecs.insert(legacyTypeName, CodeScopeSpec.Type.ParentElement);
      expect(Id64.isValidId64(legacyTypeSpecId)).to.be.true;
      const legacyTypeSpec = ivault.codeSpecs.getById(legacyTypeSpecId);
      expect(legacyTypeSpec.name).to.equal(legacyTypeName);
      expect(legacyTypeSpec.scopeType).to.equal(CodeScopeSpec.Type.ParentElement);
    } finally {
      EditTxn.implicitWriteEnforcement = previousEnforcement;
    }
  });

  it("supports deprecated updateProperties overload when implicit writes are allowed", () => {
    const previousEnforcement = EditTxn.implicitWriteEnforcement;
    EditTxn.implicitWriteEnforcement = "allow";

    try {
      const suffix = Guid.createValue().replace(/-/g, "");
      const codeSpecId = withEditTxn(ivault, (txn) => ivault.codeSpecs.insert(txn, `LegacyUpdateCodeSpec_${suffix}`, CodeScopeSpec.Type.Model));
      const codeSpec = ivault.codeSpecs.getById(codeSpecId);
      codeSpec.scopeReq = CodeScopeSpec.ScopeRequirement.FederationGuid;
      codeSpec.scopeType = CodeScopeSpec.Type.Repository;

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ivault.codeSpecs.updateProperties(codeSpec);

      const updatedCodeSpec = ivault.codeSpecs.getById(codeSpecId);
      expect(updatedCodeSpec.scopeReq).to.equal(CodeScopeSpec.ScopeRequirement.FederationGuid);
      expect(updatedCodeSpec.scopeType).to.equal(CodeScopeSpec.Type.Repository);
      expect(updatedCodeSpec.isExternal).to.be.true;
    } finally {
      EditTxn.implicitWriteEnforcement = previousEnforcement;
    }
  });

  it("supports txn-aware updateProperties overload when implicit writes are disallowed", () => {
    const previousEnforcement = EditTxn.implicitWriteEnforcement;
    EditTxn.implicitWriteEnforcement = "throw";

    try {
      const suffix = Guid.createValue().replace(/-/g, "");
      const codeSpecId = withEditTxn(ivault, (txn) => ivault.codeSpecs.insert(txn, `ExplicitUpdateCodeSpec_${suffix}`, CodeScopeSpec.Type.Model));
      const codeSpec = ivault.codeSpecs.getById(codeSpecId);
      codeSpec.scopeReq = CodeScopeSpec.ScopeRequirement.FederationGuid;
      codeSpec.scopeType = CodeScopeSpec.Type.Repository;

      withEditTxn(ivault, (txn) => ivault.codeSpecs.updateProperties(txn, codeSpec));

      const updatedCodeSpec = ivault.codeSpecs.getById(codeSpecId);
      expect(updatedCodeSpec.scopeReq).to.equal(CodeScopeSpec.ScopeRequirement.FederationGuid);
      expect(updatedCodeSpec.scopeType).to.equal(CodeScopeSpec.Type.Repository);
      expect(updatedCodeSpec.isExternal).to.be.true;
    } finally {
      EditTxn.implicitWriteEnforcement = previousEnforcement;
    }
  });

  it("rejects deprecated insert overloads when implicit writes are disallowed", () => {
    const previousEnforcement = EditTxn.implicitWriteEnforcement;
    EditTxn.implicitWriteEnforcement = "throw";

    try {
      const suffix = Guid.createValue().replace(/-/g, "");
      const legacySpec = CodeSpec.create(ivault, `LegacyThrowCodeSpec_${suffix}`, CodeScopeSpec.Type.Model);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(() => ivault.codeSpecs.insert(legacySpec)).to.throw().that.satisfies((error: unknown) =>
        EditTxnError.isError(error, "implicit-txn-write-disallowed"));

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(() => ivault.codeSpecs.insert(`LegacyThrowTypeCodeSpec_${suffix}`, CodeScopeSpec.Type.Model)).to.throw().that.satisfies((error: unknown) =>
        EditTxnError.isError(error, "implicit-txn-write-disallowed"));

      const explicitSpecId = withEditTxn(ivault, (txn) => ivault.codeSpecs.insert(txn, `LegacyThrowUpdateCodeSpec_${suffix}`, CodeScopeSpec.Type.Model));
      const explicitSpec = ivault.codeSpecs.getById(explicitSpecId);
      explicitSpec.scopeReq = CodeScopeSpec.ScopeRequirement.FederationGuid;

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(() => ivault.codeSpecs.updateProperties(explicitSpec)).to.throw().that.satisfies((error: unknown) =>
        EditTxnError.isError(error, "implicit-txn-write-disallowed"));

      withEditTxn(ivault, (txn) => ivault.codeSpecs.updateProperties(txn, explicitSpec));
    } finally {
      EditTxn.implicitWriteEnforcement = previousEnforcement;
    }
  });
});
