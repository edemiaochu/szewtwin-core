/* eslint-disable @typescript-eslint/naming-convention */
import { assert, expect } from "chai";
import * as sinon from "sinon";
import { BriefcaseDb, IVaultDb } from "../../IVaultDb";
import { getIntegrityCheckName, performQuickIntegrityCheck, performSpecificIntegrityCheck, QuickIntegrityCheckResultRow } from "../../internal/IntegrityCheck";
import { DbResult, GuidString, Id64 } from "@szewtwin/core-szewec";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubMock } from "../../internal/HubMock";
import { HubWrappers } from "../IVaultTestUtils";
import { IVault, IVaultError } from "@szewtwin/core-common";
import { _nativeDb, ChannelControl, Subject, SubjectOwnsSubjects } from "../../core-backend";
import { withEditTxn } from "../../EditTxn";

describe("Integrity Check Tests", () => {
  let iVaultStub: sinon.SinonStubbedInstance<IVaultDb>;

  beforeEach(() => {
    iVaultStub = sinon.createStubInstance(IVaultDb);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getIntegrityCheckName", () => {
    it("should return the correct name for a valid check type", () => {
      expect(getIntegrityCheckName("checkDataColumns")).to.equal("Check Data Columns");
      expect(getIntegrityCheckName("checkDMProfile")).to.equal("Check DM Profile");
      expect(getIntegrityCheckName("checkNavigationClassIds")).to.equal("Check Navigation Class Ids");
      expect(getIntegrityCheckName("checkNavigationIds")).to.equal("Check Navigation Ids");
      expect(getIntegrityCheckName("checkLinktableForeignKeyClassIds")).to.equal("Check Link Table Foreign Key Class Ids");
      expect(getIntegrityCheckName("checkLinktableForeignKeyIds")).to.equal("Check Link Table Foreign Key Ids");
      expect(getIntegrityCheckName("checkClassIds")).to.equal("Check Class Ids");
      expect(getIntegrityCheckName("checkDataSchema")).to.equal("Check Data Schema");
      expect(getIntegrityCheckName("checkSchemaLoad")).to.equal("Check Schema Load");
      expect(getIntegrityCheckName("checkMissingChildRows")).to.equal("Check Missing Child Rows");
    });

    it("should return the correct name when sqlCommand string is passed", () => {
      expect(getIntegrityCheckName("check_data_columns")).to.equal("Check Data Columns");
      expect(getIntegrityCheckName("check_dm_profile")).to.equal("Check DM Profile");
      expect(getIntegrityCheckName("check_nav_class_ids")).to.equal("Check Navigation Class Ids");
      expect(getIntegrityCheckName("check_nav_ids")).to.equal("Check Navigation Ids");
      expect(getIntegrityCheckName("check_linktable_fk_class_ids")).to.equal("Check Link Table Foreign Key Class Ids");
      expect(getIntegrityCheckName("check_linktable_fk_ids")).to.equal("Check Link Table Foreign Key Ids");
      expect(getIntegrityCheckName("check_class_ids")).to.equal("Check Class Ids");
      expect(getIntegrityCheckName("check_data_schema")).to.equal("Check Data Schema");
      expect(getIntegrityCheckName("check_schema_load")).to.equal("Check Schema Load");
      expect(getIntegrityCheckName("check_missing_child_rows")).to.equal("Check Missing Child Rows");
    });

    it("should return the input string if check type is not found", () => {
      expect(getIntegrityCheckName("unknownCheck")).to.equal("unknownCheck");
    });
  });

  describe("performQuickIntegrityCheck", () => {
    it("should return quick integrity check results", async () => {
      const mockResults = [
        { check: "check_data_columns", result: true, elapsed_sec: "0.5" },
        { check: "check_dm_profile", result: false, elapsed_sec: "0.3" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performQuickIntegrityCheck(iVaultStub);

      expect(results).to.have.lengthOf(2);
      expect(results[0]).to.deep.include({ check: "Check Data Columns", passed: true, elapsedSeconds: "0.5" });
      expect(results[1]).to.deep.include({ check: "Check DM Profile", passed: false, elapsedSeconds: "0.3" });
    });

    it("should handle empty results", async () => {
      const asyncIterator = async function* () { };
      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performQuickIntegrityCheck(iVaultStub);

      expect(results).to.be.an("array").that.is.empty;
    });
  });

  describe("performSpecificIntegrityCheck", () => {
    it("should return CheckDataColumnsResultRow for checkDataColumns", async () => {
      const mockResults = [
        { sno: 1, table: "ElementProps", column: "testColumn" },
        { sno: 2, table: "ElementTable", column: "missingColumn" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkDataColumns");

      expect(results).to.have.lengthOf(2);
      expect(results[0]).to.deep.equal({ sno: 1, table: "ElementProps", column: "testColumn" });
      expect(results[1]).to.deep.equal({ sno: 2, table: "ElementTable", column: "missingColumn" });
    });

    it("should return CheckDMProfileResultRow for checkDMProfile", async () => {
      const mockResults = [
        { sno: 1, type: "Schema", name: "BisCore", issue: "Invalid schema definition" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkDMProfile");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, type: "Schema", name: "BisCore", issue: "Invalid schema definition" });
    });

    it("should return CheckNavClassIdsResultRow for checkNavigationClassIds", async () => {
      const mockResults = [
        { sno: 1, id: "1", class: "Element", property: "parent", nav_id: "2", nav_classId: "3" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkNavigationClassIds");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, id: "1", class: "Element", property: "parent", navId: "2", navClassId: "3" });
    });

    it("should return CheckNavIdsResultRow for checkNavigationIds", async () => {
      const mockResults = [
        { sno: 1, id: "1", class: "Element", property: "parent", nav_id: "2", primary_class: "Element" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkNavigationIds");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, id: "1", class: "Element", property: "parent", navId: "2", primaryClass: "Element" });
    });

    it("should return CheckLinkTableFkClassIdsResultRow for checkLinktableForeignKeyClassIds", async () => {
      const mockResults = [
        { sno: 1, id: "1", relationship: "ElementOwnsChildElements", property: "parent", key_id: "2", key_classId: "3" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkLinktableForeignKeyClassIds");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, id: "1", relationship: "ElementOwnsChildElements", property: "parent", keyId: "2", keyClassId: "3" });
    });

    it("should return CheckLinkTableFkIdsResultRow for checkLinktableForeignKeyIds", async () => {
      const mockResults = [
        { sno: 1, id: "1", relationship: "ElementOwnsChildElements", property: "parent", key_id: "2", primary_class: "Element" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkLinktableForeignKeyIds");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, id: "1", relationship: "ElementOwnsChildElements", property: "parent", keyId: "2", primaryClass: "Element" });
    });

    it("should return CheckClassIdsResultRow for checkClassIds", async () => {
      const mockResults = [
        { sno: 1, class: "Element", id: "1", class_id: "2", type: "Element" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkClassIds");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, class: "Element", id: "1", classId: "2", type: "Element" });
    });

    it("should return CheckDataSchemaResultRow for checkDataSchema", async () => {
      const mockResults = [
        { sno: 1, type: "Schema", name: "BisCore" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkDataSchema");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, type: "Schema", name: "BisCore" });
    });

    it("should return CheckSchemaLoadResultRow for checkSchemaLoad", async () => {
      const mockResults = [
        { sno: 1, schema: "BisCore" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkSchemaLoad");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, schema: "BisCore" });
    });

    it("should return CheckMissingChildRowsResultRow for checkMissingChildRows", async () => {
      const mockResults = [
        { sno: 1, class: "Element", id: "1", class_id: "2", MissingRowInTables: "ElementTable" },
      ];

      const asyncIterator = async function* () {
        for (const result of mockResults) {
          yield result;
        }
      };

      iVaultStub.createQueryReader.returns(asyncIterator() as any);

      const results = await performSpecificIntegrityCheck(iVaultStub as any, "checkMissingChildRows");

      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.deep.equal({ sno: 1, class: "Element", id: "1", classId: "2", missingRowInTables: "ElementTable" });
    });
  });
});

describe("iVaultDb integrityCheck Tests", () => {
  let szewTwinId: GuidString;
  let iVault: BriefcaseDb;

  before(() => {
    HubMock.startup("IntegrityCheckTest", KnownTestLocations.outputDir);
    szewTwinId = HubMock.szewTwinId;
  });

  after(() => HubMock.shutdown());

  beforeEach(async () => {
    // Create new iVault
    const adminToken = "super manager token";
    const iVaultName = "PRAGMA_test";
    const iVaultId = await HubMock.createNewIVault({ szewTwinId, iVaultName, description: "TestSubject", accessToken: adminToken });
    assert.isNotEmpty(iVaultId);
    iVault = await HubWrappers.downloadAndOpenBriefcase({ szewTwinId, iVaultId, accessToken: adminToken });
  });

  afterEach(() => {
    // Cleanup
    iVault.close();
  });

  it("should call integrityCheck on a new iVault and return no errors", async () => {
    const results = await iVault.integrityCheck();
    expect(results).to.have.lengthOf(1);
    expect(results[0]).to.have.property("check").that.equals("Quick Check");
    expect(results[0]).to.have.property("passed").that.equals(true);
    expect(results[0]).to.have.property("results").that.is.an("array");
    expect(results[0].results.length).to.equal(9);
    assert(results[0].results.every((row) => (row as QuickIntegrityCheckResultRow).passed === true), "All specific checks should pass");
  });

  it("should call integrityCheck with no options selected and default to quick check", async () => {
    const results = await iVault.integrityCheck({});
    expect(results).to.have.lengthOf(1);
    expect(results[0]).to.have.property("check").that.equals("Quick Check");
    expect(results[0]).to.have.property("passed").that.equals(true);
    expect(results[0].results.length).to.equal(9);

    const results2 = await iVault.integrityCheck({ quickCheck: false });
    expect(results2).to.have.lengthOf(1);
    expect(results2[0]).to.have.property("check").that.equals("Quick Check");
    expect(results2[0]).to.have.property("passed").that.equals(true);
    expect(results2[0].results.length).to.equal(9);

    const results3 = await iVault.integrityCheck({
      quickCheck: false,
      specificChecks: {
        checkDataColumns: false,
        checkDMProfile: false,
        checkNavigationClassIds: false,
        checkNavigationIds: false,
        checkLinktableForeignKeyClassIds: false,
        checkLinktableForeignKeyIds: false,
        checkClassIds: false,
        checkDataSchema: false,
        checkSchemaLoad: false,
        checkMissingChildRows: false,
      }
    });
    expect(results3).to.have.lengthOf(1);
    expect(results3[0]).to.have.property("check").that.equals("Quick Check");
    expect(results3[0]).to.have.property("passed").that.equals(true);
    expect(results3[0].results.length).to.equal(9);
  });

  it("should throw an error when iVault is closed", async () => {
    iVault.close();

    try {
      await iVault.integrityCheck();
      assert.fail("Expected error was not thrown");
    } catch (error) {
      expect((error as IVaultError).message).to.include("IVault is not open");
    }
  });

  it("should call integrityCheck on a new iVault and run all specific integrity checks and return no errors", async () => {
    const results = await iVault.integrityCheck({
      specificChecks: {
        checkDataColumns: true,
        checkDMProfile: true,
        checkNavigationClassIds: true,
        checkNavigationIds: true,
        checkLinktableForeignKeyClassIds: true,
        checkLinktableForeignKeyIds: true,
        checkClassIds: true,
        checkDataSchema: true,
        checkSchemaLoad: true,
        checkMissingChildRows: true,
      },
    });
    expect(results).to.be.an("array");
    expect(results).to.have.lengthOf(10);

    // Verify each check is present and has the expected structure
    const checkNames = results.map((r) => r.check);
    expect(checkNames).to.include.members([
      "Check Data Columns",
      "Check DM Profile",
      "Check Navigation Class Ids",
      "Check Navigation Ids",
      "Check Link Table Foreign Key Class Ids",
      "Check Link Table Foreign Key Ids",
      "Check Class Ids",
      "Check Data Schema",
      "Check Schema Load",
      "Check Missing Child Rows",
    ]);

    // All checks should pass
    results.forEach((result) => {
      expect(result.passed).to.equal(true, `${result.check} should pass`);
      expect(result.results).to.be.empty;
    });
  });

  it("should report corrupt foreignKey Ids", async () => {
    // Insert two elements
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });

    const [element1Id, element2Id] = withEditTxn(iVault, (txn) => ([
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject1"),
      }),
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject2"),
      }),
    ]));

    // Create a relationship between them
    await iVault.locks.acquireLocks({ exclusive: Id64.toIdSet([element1Id, element2Id]) });
    const relationship = iVault.relationships.createInstance({
      classFullName: "BisCore:SubjectRefersToSubject",
      sourceId: element1Id,
      targetId: element2Id,
    });
    const relationshipId = withEditTxn(iVault, (txn) => txn.insertRelationship(relationship.toJSON()));
    assert.isTrue(Id64.isValidId64(relationshipId));

    // Delete one element without deleting the relationship to corrupt the iVault
    withEditTxn(iVault, () => {
      const deleteResult = iVault[_nativeDb].executeSql(`DELETE FROM bis_Element WHERE Id=${element2Id}`);
      expect(deleteResult).to.equal(DbResult.BE_SQLITE_OK);
    });

    // Run integrity check specifically for linktable foreign key Ids
    const results = await iVault.integrityCheck({
      quickCheck: true,
      specificChecks: {
        checkLinktableForeignKeyClassIds: true,
        checkLinktableForeignKeyIds: true,
      },
    });

    // Run integrity check with default options — quickCheck only, no specific checks
    const justQuickCheck = await iVault.integrityCheck();

    expect(justQuickCheck).to.have.lengthOf(1);
    expect(justQuickCheck[0]).to.have.property("check").that.equals("Quick Check");
    expect(justQuickCheck[0]).to.have.property("passed").that.equals(false);
    expect(justQuickCheck[0].results.length).to.equal(9);
    const foreignKeyCheck = justQuickCheck[0].results.find((row) => (row as QuickIntegrityCheckResultRow).check === "Check Link Table Foreign Key Ids");
    assert.isDefined(foreignKeyCheck, "Check Link Table Foreign Key Ids sub-check should be present in quickCheck results");
    expect((foreignKeyCheck as QuickIntegrityCheckResultRow).passed).to.equal(false, "Check Link Table Foreign Key Ids should report failure");

    // Verify that the checkLinktableForeignKeyIds check reports the corruption
    expect(results).to.have.lengthOf(3);
    expect(results[0]).to.have.property("check").that.equals("Quick Check");
    expect(results[0]).to.have.property("passed").that.equals(false);
    expect(results[0]).to.have.property("results").that.is.an("array");
    expect(results[0].results.length).to.equal(9);
    assert(results[0].results.findIndex((row) => (row as QuickIntegrityCheckResultRow).passed === false) !== -1, "Quick check should report failed specific check");
    expect(results[1]).to.have.property("passed").that.equals(true);
    expect(results[1]).to.have.property("results").that.is.an("array").that.is.empty;
    expect(results[2]).to.have.property("passed").that.equals(false);
    expect(results[2].results).to.have.lengthOf(1);
    expect(results[2].results[0]).to.deep.include({
      sno: 1,
      id: relationshipId,
      relationship: "BisCore:ElementRefersToElements",
      property: "TargetDMInstanceId",
      keyId: element2Id,
      primaryClass: "BisCore:Element",
    });
  });

  it("should report corrupt foreignKey Ids after calling clearCaches", async () => {
    // Insert two elements
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });

    const [element1Id, element2Id] = withEditTxn(iVault, (txn) => ([
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject1"),
      }),
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject2"),
      }),
    ]));

    // Create a relationship between them
    await iVault.locks.acquireLocks({ exclusive: Id64.toIdSet([element1Id, element2Id]) });
    const relationship = iVault.relationships.createInstance({
      classFullName: "BisCore:SubjectRefersToSubject",
      sourceId: element1Id,
      targetId: element2Id,
    });
    const relationshipId = withEditTxn(iVault, (txn) => txn.insertRelationship(relationship.toJSON()));
    assert.isTrue(Id64.isValidId64(relationshipId));

    // Delete one element without deleting the relationship to corrupt the iVault
    withEditTxn(iVault, () => {
      const deleteResult = iVault[_nativeDb].executeSql(`DELETE FROM bis_Element WHERE Id=${element2Id}`);
      expect(deleteResult).to.equal(DbResult.BE_SQLITE_OK);
    });

    // Run integrity check specifically for linktable foreign key Ids
    const results = await iVault.integrityCheck({
      quickCheck: true,
      specificChecks: {
        checkLinktableForeignKeyClassIds: true,
        checkLinktableForeignKeyIds: true,
      },
    });

    // Verify that the checkLinktableForeignKeyIds check reports the corruption
    expect(results).to.have.lengthOf(3);
    expect(results[0]).to.have.property("check").that.equals("Quick Check");
    expect(results[0]).to.have.property("passed").that.equals(false);
    expect(results[0]).to.have.property("results").that.is.an("array");
    expect(results[0].results.length).to.equal(9);
    assert(results[0].results.findIndex((row) => (row as QuickIntegrityCheckResultRow).passed === false) !== -1, "Quick check should report failed specific check");
    expect(results[1]).to.have.property("passed").that.equals(true);
    expect(results[1]).to.have.property("results").that.is.an("array").that.is.empty;
    expect(results[2]).to.have.property("passed").that.equals(false);
    expect(results[2].results).to.have.lengthOf(1);
    expect(results[2].results[0]).to.deep.include({
      sno: 1,
      id: relationshipId,
      relationship: "BisCore:ElementRefersToElements",
      property: "TargetDMInstanceId",
      keyId: element2Id,
      primaryClass: "BisCore:Element",
    });

    // Clear caches
    iVault.clearCaches();

    // Run integrity check again after clearing cache
    const resultsAfterClearCache = await iVault.integrityCheck({
      quickCheck: true,
      specificChecks: {
        checkLinktableForeignKeyClassIds: true,
        checkLinktableForeignKeyIds: true,
      },
    });

    // Verify that the checkLinktableForeignKeyIds check still reports the corruption after clearing cache
    expect(resultsAfterClearCache).to.have.lengthOf(3);
    expect(resultsAfterClearCache[0]).to.have.property("check").that.equals("Quick Check");
    expect(resultsAfterClearCache[0]).to.have.property("passed").that.equals(false);
    expect(resultsAfterClearCache[0]).to.have.property("results").that.is.an("array");
    expect(resultsAfterClearCache[0].results.length).to.equal(9);
    assert(resultsAfterClearCache[0].results.findIndex((row) => (row as QuickIntegrityCheckResultRow).passed === false) !== -1, "Quick check should report failed specific check");
    expect(resultsAfterClearCache[1]).to.have.property("passed").that.equals(true);
    expect(resultsAfterClearCache[1]).to.have.property("results").that.is.an("array").that.is.empty;
    expect(resultsAfterClearCache[2]).to.have.property("passed").that.equals(false);
    expect(resultsAfterClearCache[2].results).to.have.lengthOf(1);
    expect(resultsAfterClearCache[2].results[0]).to.deep.include({
      sno: 1,
      id: relationshipId,
      relationship: "BisCore:ElementRefersToElements",
      property: "TargetDMInstanceId",
      keyId: element2Id,
      primaryClass: "BisCore:Element",
    });
  });

  it("should report corrupt foreignKey Ids on an iVault with unsaved changes", async () => {
    // Insert two elements
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });

    const [element1Id, element2Id] = withEditTxn(iVault, (txn) => ([
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject1"),
      }),
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject2"),
      }),
    ]));

    // Create a relationship between them
    await iVault.locks.acquireLocks({ exclusive: Id64.toIdSet([element1Id, element2Id]) });
    const relationship = iVault.relationships.createInstance({
      classFullName: "BisCore:SubjectRefersToSubject",
      sourceId: element1Id,
      targetId: element2Id,
    });
    const relationshipId = withEditTxn(iVault, (txn) => txn.insertRelationship(relationship.toJSON()));
    assert.isTrue(Id64.isValidId64(relationshipId));

    // Delete one element without deleting the relationship to corrupt the iVault - don't save it
    const deleteResult = iVault[_nativeDb].executeSql(`DELETE FROM bis_Element WHERE Id=${element2Id}`);
    expect(deleteResult).to.equal(DbResult.BE_SQLITE_OK);

    // Run integrity check specifically for linktable foreign key Ids
    const results = await iVault.integrityCheck({
      quickCheck: true,
      specificChecks: {
        checkLinktableForeignKeyClassIds: true,
        checkLinktableForeignKeyIds: true,
      },
    });

    await iVault.discardChanges();

    // Verify that the checkLinktableForeignKeyIds check reports the corruption
    expect(results).to.have.lengthOf(3);
    expect(results[0]).to.have.property("check").that.equals("Quick Check");
    expect(results[0]).to.have.property("passed").that.equals(false);
    expect(results[0]).to.have.property("results").that.is.an("array");
    expect(results[0].results.length).to.equal(9);
    assert(results[0].results.findIndex((row) => (row as QuickIntegrityCheckResultRow).passed === false) !== -1, "Quick check should report failed specific check");
    expect(results[1]).to.have.property("passed").that.equals(true);
    expect(results[1]).to.have.property("results").that.is.an("array").that.is.empty;
    expect(results[2]).to.have.property("passed").that.equals(false);
    expect(results[2].results).to.have.lengthOf(1);
    expect(results[2].results[0]).to.deep.include({
      sno: 1,
      id: relationshipId,
      relationship: "BisCore:ElementRefersToElements",
      property: "TargetDMInstanceId",
      keyId: element2Id,
      primaryClass: "BisCore:Element",
    });
  });

  it("should report corrupt source-side foreignKey Ids", async () => {
    iVault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    await iVault.locks.acquireLocks({ shared: IVault.repositoryModelId });

    const [element1Id, element2Id] = withEditTxn(iVault, (txn) => ([
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject1"),
      }),
      txn.insertElement({
        classFullName: Subject.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsSubjects(IVault.rootSubjectId),
        code: Subject.createCode(iVault, IVault.rootSubjectId, "Subject2"),
      }),
    ]));

    await iVault.locks.acquireLocks({ exclusive: Id64.toIdSet([element1Id, element2Id]) });
    const relationship = iVault.relationships.createInstance({
      classFullName: "BisCore:SubjectRefersToSubject",
      sourceId: element1Id,
      targetId: element2Id,
    });
    const relationshipId = withEditTxn(iVault, (txn) => txn.insertRelationship(relationship.toJSON()));
    assert.isTrue(Id64.isValidId64(relationshipId));

    // Delete the SOURCE element to create a source-side FK orphan
    withEditTxn(iVault, () => {
      const deleteResult = iVault[_nativeDb].executeSql(`DELETE FROM bis_Element WHERE Id=${element1Id}`);
      expect(deleteResult).to.equal(DbResult.BE_SQLITE_OK);
    });

    const results = await iVault.integrityCheck({
      quickCheck: true,
      specificChecks: {
        checkLinktableForeignKeyIds: true,
      },
    });

    // Quick Check + specific Check Link Table Foreign Key Ids
    expect(results).to.have.lengthOf(2);
    expect(results[0]).to.have.property("check").that.equals("Quick Check");
    expect(results[0]).to.have.property("passed").that.equals(false);

    // Specific check should find the source-side orphan
    expect(results[1]).to.have.property("check").that.equals("Check Link Table Foreign Key Ids");
    expect(results[1]).to.have.property("passed").that.equals(false);
    expect(results[1].results).to.have.length.greaterThanOrEqual(1);
    expect(results[1].results[0]).to.deep.include({
      id: relationshipId,
      relationship: "BisCore:ElementRefersToElements",
      property: "SourceDMInstanceId",
      keyId: element1Id,
      primaryClass: "BisCore:Element",
    });
  });
});
