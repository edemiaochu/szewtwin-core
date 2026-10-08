/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { TextureLoadProps } from "@szewtwin/core-common";
import { SnapshotDb } from "../../IVaultDb";
import { IVaultTestUtils } from "../IVaultTestUtils";

describe("IVaultDb.queryTextureData", () => {
  let ivault: SnapshotDb;

  before(() => {
    ivault = IVaultTestUtils.createSnapshotFromSeed(IVaultTestUtils.prepareOutputFile("ElementGraphics", "mirukuru.ibim"), IVaultTestUtils.resolveAssetFile("mirukuru.ibim"));
  });

  after(() => ivault.close());

  it("returns undefined if texture not found", async () => {
    expect(await ivault.queryTextureData({ name: "0x123" })).to.be.undefined;
  });

  describe("throws", () => {
    it("if name is not a valid Id", async () => {
      await expect(ivault.queryTextureData({} as unknown as TextureLoadProps)).to.be.rejectedWith("name property must be a valid Id64String");
      await expect(ivault.queryTextureData({ name: "0" })).to.be.rejectedWith("name property must be a valid Id64String");
      await expect(ivault.queryTextureData({ name: "NotAnId" })).to.be.rejectedWith("name property must be a valid Id64String");
    });

    it("if max size is not a positive number", async () => {
      await expect(ivault.queryTextureData({ name: "0x123", maxTextureSize: "25" } as unknown as TextureLoadProps)).to.be.rejectedWith("maxTextureSize property must be a positive number");
      await expect(ivault.queryTextureData({ name: "0x123", maxTextureSize: 0 })).to.be.rejectedWith("maxTextureSize property must be a positive number");
      await expect(ivault.queryTextureData({ name: "0x123", maxTextureSize: -1 })).to.be.rejectedWith("maxTextureSize property must be a positive number");
    });
  });
});
