/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { Guid, Id64 } from "@szewtwin/core-szewec";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { withEditTxn } from "../../EditTxn";

import { IVault, RepositoryLinkProps } from "@szewtwin/core-common";
import { RepositoryLink } from "../../Element";
import { SnapshotDb } from "../../IVaultDb";

const testFileName = "UrlLinkTest.dtw";
const subDirName = "UrlLinkTrip";
const iVaultPath = IVaultTestUtils.prepareOutputFile(subDirName, testFileName);

describe("UrlLink tests", () => {
  it("Link should construct properly", () => {
    const ivault = SnapshotDb.createEmpty(iVaultPath, { rootSubject: { name: "UrlLinkTest" } });
    const linkProps: RepositoryLinkProps = {
      description: "This is a test repository link",
      url: "http://szewtwinjs.org",
      repositoryGuid: Guid.createValue(),
      classFullName: RepositoryLink.classFullName,
      code: RepositoryLink.createCode(ivault, IVault.repositoryModelId, "MyTestValue"),
      model: IVault.repositoryModelId,
    };

    const linkElement = ivault.elements.createElement(linkProps);
    const id = withEditTxn(ivault, (txn) => txn.insertElement(linkElement.toJSON()));
    assert.isTrue(Id64.isValidId64(id), "insert worked");

    // verify inserted element properties
    const actualValue = ivault.elements.getElement<RepositoryLink>(id);
    assert.equal(actualValue.url, linkProps.url, "Repository link url not set as expected");
    assert.equal(actualValue.description, linkProps.description, "Repository link description not set as expected");
    assert.equal(actualValue.repositoryGuid, linkProps.repositoryGuid, "Repository link guid not set as expected.");
  });
});
