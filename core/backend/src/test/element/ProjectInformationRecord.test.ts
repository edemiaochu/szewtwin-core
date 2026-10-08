/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { SnapshotDb } from "../../IVaultDb";
import { IVault, ProjectInformation } from "@szewtwin/core-common";
import { ProjectInformationRecord } from "../../Element";
import { SubjectOwnsProjectInformationRecord } from "../../NavigationRelationship";
import { DbResult } from "@szewtwin/core-szewec";
import { withEditTxn } from "../../EditTxn";

describe("ProjectInformationRecord", () => {
  describe("with BisCore < 00.01.25", () => {
    let db: SnapshotDb;

    before(() => {
      const seedFileName = IVaultTestUtils.resolveAssetFile("mirukuru.ibim");
      const testFileName = IVaultTestUtils.prepareOutputFile("ProjectInformationRecord", "OldBisCore.dtw");
      db = IVaultTestUtils.createSnapshotFromSeed(testFileName, seedFileName);
    });

    after(() => db.close());

    it("throws", () => {
      const projectProps: ProjectInformation = {
        projectNumber: "num",
        projectName: "name",
        location: "place",
      };

      expect(() => ProjectInformationRecord.create({
        iVault: db,
        parentSubjectId: IVault.rootSubjectId,
        ...projectProps,
      })).to.throw("ProjectInformationRecord requires BisCore v01.00.25 or newer");
    });
  });

  describe("with BisCore >= 00.01.25", () => {
    let db: SnapshotDb;

    before(async () => {
      db = SnapshotDb.createEmpty(
        IVaultTestUtils.prepareOutputFile("ProjectInformationRecord", "NewBisCore.dtw"),
        { rootSubject: { name: "ProjectInformationRecord" } }
      );
    });

    after(() => db.close());

    it("inserts element and creates relationship", () => {
      function countRelationships(): number {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        return db.withPreparedStatement(`SELECT COUNT(*) FROM ${SubjectOwnsProjectInformationRecord.classFullName}`, (stmt) => {
          expect(stmt.step()).to.equal(DbResult.BE_SQLITE_ROW);
          return stmt.getValue(0).getInteger();
        });
      }

      expect(countRelationships()).to.equal(0);

      const projectProps: ProjectInformation = {
        projectNumber: "num",
        projectName: "name",
        location: "place",
      };

      let record = ProjectInformationRecord.create({
        iVault: db,
        parentSubjectId: IVault.rootSubjectId,
        ...projectProps,
      });

      const recordId = withEditTxn(db, (txn) => record.insert(txn));

      record = db.elements.getElement<ProjectInformationRecord>(recordId);
      expect(record).instanceof(ProjectInformationRecord);
      expect(record.projectInformation).to.deep.equal(projectProps);

      expect(countRelationships()).to.equal(1);
    })

    it("throws if parent is not a Subject", () => {
      const projectProps: ProjectInformation = {
        projectNumber: "num",
        projectName: "name",
        location: "place",
      };

      const record = ProjectInformationRecord.create({
        iVault: db,
        parentSubjectId: IVault.dictionaryId,
        ...projectProps,
      });

      withEditTxn(db, (txn) => {
        expect(() => record.insert(txn)).to.throw("ProjectInformationRecord must be a child of a Subject");
      });
    });
  });
});


