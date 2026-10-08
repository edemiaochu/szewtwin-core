/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { _nativeDb, IVaultJsFs, StandaloneDb } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { Code, IVault } from "@szewtwin/core-common";
import { withEditTxn } from "../../EditTxn";

describe("StandaloneDb", () => {

  describe("transaction flags", () => {

    it("should enable transactions with legacy allowEdit string flag", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "AllowEditString.dtw");

      // Create with allowEdit set to any truthy string value
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        allowEdit: "any string value",
      });

      // Verify the flag is set correctly in the database
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.equal(value, `{ "txns": true }`);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should enable transactions with legacy allowEdit JSON string", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "AllowEditJSON.dtw");

      // Create with allowEdit using the traditional JSON.stringify pattern
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        allowEdit: JSON.stringify({ txns: true }),
      });

      // Verify the flag is set correctly
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.equal(value, `{ "txns": true }`);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should enable transactions with new enableTransactions boolean flag", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "EnableTransactions.dtw");

      // Create with the new boolean flag
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        enableTransactions: true,
      });

      // Verify the flag is set correctly
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.equal(value, `{ "txns": true }`);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should enable transactions when either flag is set", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "BothFlags.dtw");

      // Create with both flags set
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        allowEdit: "legacy",
        enableTransactions: true,
      });

      // Verify the flag is set correctly
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.equal(value, `{ "txns": true }`);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should enable transactions with enableTransactions true even if allowEdit is undefined", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "OnlyEnableTransactions.dtw");

      // Create with only the new flag
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        enableTransactions: true,
      });

      // Verify the flag is set correctly
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.equal(value, `{ "txns": true }`);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should not enable transactions when both flags are false/undefined", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "NoFlags.dtw");

      // Create without enabling transactions
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        enableTransactions: false,
      });

      // Verify the flag is not set
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.isUndefined(value);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should not enable transactions when no flags are provided", () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "NoFlagsDefault.dtw");

      // Create without any edit flags
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
      });

      // Verify the flag is not set
      const value = iVault[_nativeDb].queryLocalValue("StandaloneEdit");
      assert.isUndefined(value);

      iVault.close();
      IVaultJsFs.removeSync(fileName);
    });

    it("should delete txns on close", async () => {
      const fileName = IVaultTestUtils.prepareOutputFile("StandaloneDb", "DeleteTxnsOnClose.dtw");

      // Create with transactions explicitly enabled
      const iVault = StandaloneDb.createEmpty(fileName, {
        rootSubject: { name: "Test" },
        enableTransactions: true,
      });

      const schema1 = `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestDomain" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.2">
          <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
          <DMEntityClass typeName="a1">
              <BaseClass>bis:GraphicalElement2d</BaseClass>
              <DMProperty propertyName="prop1" typeName="string" />
          </DMEntityClass>
          <DMEntityClass typeName="A1Recipe2d">
              <BaseClass>bis:TemplateRecipe2d</BaseClass>
              <DMProperty propertyName="prop1" typeName="string" />
          </DMEntityClass>
          <DMRelationshipClass typeName="A1OwnsA1" modifier="None" strength="embedding">
              <BaseClass>bis:ElementOwnsChildElements</BaseClass>
              <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="true">
                  <Class class="a1"/>
              </Source>
              <Target multiplicity="(0..*)" roleLabel="is owned by" polymorphic="false">
                  <Class class="a1"/>
              </Target>
          </DMRelationshipClass>
      </DMSchema>`;

      await iVault.importSchemaStrings([schema1]);
      const e1 = await withEditTxn(iVault, async (txn) => {
        return txn.insertElement({
          classFullName: "TestDomain:A1Recipe2d",
          model: IVault.dictionaryId,
          code: Code.createEmpty(),
        });
      });
      expect(iVault.txns.hasPendingTxns).to.be.true;

      // load up concurrent queries to ensure they are shutdown on close
      const reader = iVault.createQueryReader(
        `SELECT [DMInstanceId] as [id] FROM [TestDomain]:[A1Recipe2d]`
      );

      await reader.step();
      expect(reader.current.id).to.equal(e1);

      // should delete pending txns on close without error
      iVault.close();

      const reopened = StandaloneDb.openFile(fileName);
      expect(reopened.txns.hasPendingTxns).to.be.false;
      expect(() => reopened.elements.getElement(e1)).to.not.throw();
      reopened.close();

      IVaultJsFs.removeSync(fileName);
    });
  });

});
