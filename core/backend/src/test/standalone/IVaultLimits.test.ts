/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  Code,
  GeometricElement3dProps,
  IVault, SubCategoryAppearance
} from "@szewtwin/core-common";
import * as chai from "chai";
import { assert } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { HubWrappers, KnownTestLocations } from "..";
import { withEditTxn } from "../../EditTxn";
import {
  ChannelControl,
  DictionaryModel,
  SpatialCategory
} from "../../core-backend";
import { HubMock } from "../../internal/HubMock";
import { IVaultTestUtils, TestUserType } from "../IVaultTestUtils";
import { Suite } from "mocha";
import { TestUtils } from "../TestUtils";
chai.use(chaiAsPromised);

describe("ivault limits", function (this: Suite) {
  const ctx = {
    accessTokens: {
      user1: "",
      user2: "",
      user3: "",
    },
    iVaultId: "",
    szewTwinId: "",
    modelId: "",
    spatialCategoryId: "",
    iVaultName: "TestIVault",
    rootSubject: "TestSubject",
    openBriefcase: async (user: "user1" | "user2" | "user3", noLock?: true) => {
      const b = await HubWrappers.downloadAndOpenBriefcase({ accessToken: ctx.accessTokens[user], szewTwinId: ctx.szewTwinId, iVaultId: ctx.iVaultId, noLock });
      b.channels.addAllowedChannel(ChannelControl.sharedChannelName);
      return b;
    },
    openB1: async (noLock?: true) => { return ctx.openBriefcase("user1", noLock); },
    openB2: async (noLock?: true) => { return ctx.openBriefcase("user2", noLock); },
    openB3: async (noLock?: true) => { return ctx.openBriefcase("user3", noLock); },
  }

  before(async () => {
    await TestUtils.startBackend();
    HubMock.startup("PullMergeMethod", KnownTestLocations.outputDir);
  });

  after(async () => {
    HubMock.shutdown()
  });

  beforeEach(async () => {
    ctx.szewTwinId = HubMock.szewTwinId;
    ctx.accessTokens.user1 = await HubWrappers.getAccessToken(TestUserType.SuperManager);
    ctx.accessTokens.user2 = await HubWrappers.getAccessToken(TestUserType.Regular);
    ctx.accessTokens.user3 = await HubWrappers.getAccessToken(TestUserType.Super);
    ctx.iVaultId = await HubMock.createNewIVault({ accessToken: ctx.accessTokens.user1, szewTwinId: ctx.szewTwinId, iVaultName: ctx.iVaultName, description: ctx.rootSubject });
    assert.isNotEmpty(ctx.iVaultId);
    const b1 = await ctx.openB1(true);
    await b1.locks.acquireLocks({ shared: IVault.dictionaryId });
    withEditTxn(b1, (txn) => {
      [, ctx.modelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(
        txn,
        IVaultTestUtils.getUniqueModelCode(b1, "newPhysicalModel"),
        true);
    });
    const dictionary: DictionaryModel = b1.models.getModel<DictionaryModel>(IVault.dictionaryId);
    const newCategoryCode = IVaultTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
    withEditTxn(b1, (txn) => {
      ctx.spatialCategoryId = SpatialCategory.insert(
        txn,
        dictionary.id,
        newCategoryCode.value,
        new SubCategoryAppearance({ color: 0xff0000 }),
      );
    });
    await b1.pushChanges({ description: "" });
    b1.close();
  });

  it("apply changes where max columns for class is used", async () => {
    const b1 = await ctx.openB1(true);
    const b2 = await ctx.openB2(true);

    // Import schema into b1 but do not push it.
    const createSchema = (additionProps: number) => {
      const schema = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<DMSchema schemaName="TestSchema1" alias="ts" version="01.00.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">`,
        ` <DMSchemaReference name="BisCore" version="01.00.00" alias="bis"/>`,
        ` <DMEntityClass typeName="Pipe1">`,
        `   <BaseClass>bis:GeometricElement3d</BaseClass>`,
      ];

      for (let i = 0; i < additionProps; i++) {
        schema.push(`   <DMProperty propertyName="p${i}" typeName="int" />`);
      }

      schema.push(...[
        ` </DMEntityClass>`,
        `</DMSchema>`
      ]);
      return schema.join("\n");
    }

    const schemaThatMaxOutColumnsLimit = 2030;

    await b1.importSchemaStrings([createSchema(schemaThatMaxOutColumnsLimit)]);
    await b1.pushChanges({ description: "import schema" });

    const elementProps: GeometricElement3dProps = {
      classFullName: "TestSchema1:Pipe1",
      model: ctx.modelId,
      category: ctx.spatialCategoryId,
      code: Code.createEmpty(),
    };
    const el = b1.elements.createElement(elementProps);
    withEditTxn(b1, (txn) => txn.insertElement(el.toJSON()));
    await b1.pushChanges({ description: "add element" });

    // Error applying changeset with id [22f762181d236dfe25bb32e38ed3b7509e975deb]: failed to apply changes
    // Expression depth is 2001 where current limit is 2000
    await b2.pullChanges();

    b1.close();
    b2.close();

    HubMock.shutdown();
  });
});
