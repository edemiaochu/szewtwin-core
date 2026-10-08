/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { Guid } from "@szewtwin/core-szewec";
import { V2CheckpointManager } from "../../CheckpointManager";
import { IVaultJsFs } from "../../IVaultJsFs";
import { _hubAccess, _nativeDb } from "../../internal/Symbols";
import { IVaultTestUtils } from "../IVaultTestUtils";

describe("Checkpoint Manager", () => {

  afterEach(() => {
    sinon.restore();
  });

  it("open missing local file should return undefined", async () => {
    const checkpoint = {
      szewTwinId: "5678",
      iVaultId: "910",
      changeset: { id: "1234" },
    };
    const request = {
      localFile: path.join(V2CheckpointManager.getFolder(), Guid.createValue()),
      checkpoint,
    };
    const db = IVaultTestUtils.tryOpenLocalFile(request);
    assert.isUndefined(db);
  });

  it("open a bad bim file should return undefined", async () => {
    const checkpoint = {
      szewTwinId: "5678",
      iVaultId: "910",
      changeset: { id: "1234" },
    };

    // Setup a local file
    const folder = path.join(V2CheckpointManager.getFolder(), checkpoint.iVaultId);
    if (!IVaultJsFs.existsSync(folder))
      IVaultJsFs.recursiveMkDirSync(folder);

    const outputFile = path.join(V2CheckpointManager.getFolder(), `${checkpoint.changeset.id}.bim`);
    if (IVaultJsFs.existsSync(outputFile))
      IVaultJsFs.unlinkSync(outputFile);

    IVaultJsFs.writeFileSync(outputFile, "Testing");

    // Attempt to open the file
    const request = {
      localFile: outputFile,
      checkpoint,
    };
    const db = IVaultTestUtils.tryOpenLocalFile(request);
    assert.isUndefined(db);
  });
});
