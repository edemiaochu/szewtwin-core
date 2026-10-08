/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { GuidString } from "@szewtwin/core-szewec";
import { BriefcaseConnectionProps } from "@szewtwin/core-common";
import { assert } from "chai";
import { BriefcaseDb, BriefcaseManager } from "../../core-backend";
import { HubMock } from "../../internal/HubMock";
import { KnownTestLocations } from "../KnownTestLocations";

describe("BriefcaseDb", () => {
  let szewTwinId: GuidString;

  before(() => {
    HubMock.startup("BriefcaseDbTest", KnownTestLocations.outputDir);
    szewTwinId = HubMock.szewTwinId;
  });

  after(() => HubMock.shutdown());

  describe("toJSON", () => {
    it("should include briefcaseId in the returned BriefcaseConnectionProps", async () => {
      const iVaultId = await HubMock.createNewIVault({ iVaultName: "ToJsonTest", szewTwinId });
      const briefcaseProps = await BriefcaseManager.downloadBriefcase({ accessToken: "test token", szewTwinId, iVaultId });
      const db = await BriefcaseDb.open({ fileName: briefcaseProps.fileName });

      try {
        const json: BriefcaseConnectionProps = db.toJSON();

        assert.isDefined(json.briefcaseId);
        assert.equal(json.briefcaseId, db.briefcaseId);

        assert.isDefined(json.rootSubject);
        assert.isDefined(json.key);
        assert.isDefined(json.projectExtents);
      } finally {
        db.close();
      }
    });
  });
});
