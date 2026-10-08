/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { Guid, Logger } from "@szewtwin/core-szewec";
import {
  BatchType, ContentIdProvider, defaultTileOptions, IVaultTileRpcInterface, iVaultTileTreeIdToString, RpcActivity, RpcManager, RpcRegistry,
} from "@szewtwin/core-common";
import { IVaultDb, SnapshotDb } from "../../IVaultDb";
import { IVaultHost } from "../../IVaultHost";
import { IVaultJsFs } from "../../IVaultJsFs";
import { GeometricModel3d } from "../../Model";
import { RpcTrace } from "../../rpc/tracing";
import { TestUtils } from "../TestUtils";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { withEditTxn } from "../../EditTxn";
import { _nativeDb } from "../../internal/Symbols";

const fakeRpc: RpcActivity = {
  accessToken: "dummy",
  activityId: "activity123",
  applicationId: "rpc test app",
  applicationVersion: "1.2.3",
  sessionId: "session 123",
};

interface TileContentRequestProps {
  treeId: string;
  contentId: string;
  guid: string;
}

// Goes through models in ivault until it finds a root tile for a non empty model, returns tile content request props for that tile
export async function getTileProps(iVault: IVaultDb): Promise<TileContentRequestProps | undefined> {
  const queryParams = { from: GeometricModel3d.classFullName, limit: IVaultDb.maxLimit };
  for (const modelId of iVault.queryEntityIds(queryParams)) {
    let model;
    try {
      model = iVault.models.getModel<GeometricModel3d>(modelId);
    } catch {
      continue;
    }

    if (model.isNotSpatiallyLocated || model.isTemplate)
      continue;

    iVaultTileTreeIdToString;
    const treeId = iVaultTileTreeIdToString(modelId, { type: BatchType.Primary, edges: false as const }, defaultTileOptions);
    const treeProps = await iVault.tiles.requestTileTreeProps(treeId);
    // Ignore empty tile trees.
    if (treeProps.rootTile.maximumSize === 0 && treeProps.rootTile.isLeaf === true)
      continue;

    let guid = model.geometryGuid || iVault.changeset.id || "first";
    if (treeProps.contentIdQualifier)
      guid = `${guid}_${treeProps.contentIdQualifier}`;

    const idProvider = ContentIdProvider.create(true, defaultTileOptions);
    const contentId = idProvider.rootContentId;

    return {
      treeId,
      contentId,
      guid,
    };
  }

  return undefined;
}

describe("TileCache open v1", () => {
  let tileRpcInterface: IVaultTileRpcInterface;

  const verifyTileCache = async (dbPath: string) => {
    RpcManager.initializeInterface(IVaultTileRpcInterface);
    tileRpcInterface = RpcRegistry.instance.getImplForInterface<IVaultTileRpcInterface>(IVaultTileRpcInterface);

    const iVault = SnapshotDb.openFile(dbPath);
    expect(iVault);
    // Generate tile
    const tileProps = await getTileProps(iVault);
    expect(tileProps);
    await RpcTrace.run(fakeRpc, async () => tileRpcInterface.generateTileContent(iVault.getRpcProps(), tileProps!.treeId, tileProps!.contentId, tileProps!.guid));

    const tilesCache = `${iVault.pathName}.Tiles`;
    expect(IVaultJsFs.existsSync(tilesCache)).true;

    iVault.close();
  };
  it("should create .tiles file next to .bim with default cacheDir", async () => {
    // Shutdown IVaultHost to allow this test to use it.
    await TestUtils.shutdownBackend();
    await TestUtils.startBackend();

    const dbPath = IVaultTestUtils.prepareOutputFile("IVault", "mirukuru.ibim");
    const snapshot = IVaultTestUtils.createSnapshotFromSeed(dbPath, IVaultTestUtils.resolveAssetFile("mirukuru.ibim"));
    snapshot.close();
    await verifyTileCache(dbPath);

  });
  it("should create .tiles file next to .bim with set cacheDir", async () => {
    // Shutdown IVaultHost to allow this test to use it.
    await TestUtils.shutdownBackend();
    const config = {
      cacheDir: TestUtils.getCacheDir(),
    };
    await TestUtils.startBackend(config);

    const dbPath = IVaultTestUtils.prepareOutputFile("IVault", "mirukuru.ibim");
    const snapshot = IVaultTestUtils.createSnapshotFromSeed(dbPath, IVaultTestUtils.resolveAssetFile("mirukuru.ibim"));
    snapshot.close();

    await verifyTileCache(dbPath);
  });
});

describe("TileCache, open v2", async () => {
  it("should place .Tiles in tempFileBase for V2 checkpoints", async () => {
    const dbPath = IVaultTestUtils.prepareOutputFile("IVault", "mirukuru.ibim");
    const snapshot = IVaultTestUtils.createSnapshotFromSeed(dbPath, IVaultTestUtils.resolveAssetFile("mirukuru.ibim"));
    const iVaultId = snapshot.iVaultId;
    const szewTwinId = Guid.createValue();
    const changeset = IVaultTestUtils.generateChangeSetId();
    withEditTxn(snapshot, () => {
      snapshot[_nativeDb].setSZEWTwinId(szewTwinId);
      snapshot[_nativeDb].saveLocalValue("ParentChangeSetId", changeset.id); // even fake checkpoints need a changesetId!
    });
    snapshot.close();

    RpcManager.initializeInterface(IVaultTileRpcInterface);
    const key = `${iVaultId}\$${changeset.id}`;
    const tileRpcInterface = RpcRegistry.instance.getImplForInterface<IVaultTileRpcInterface>(IVaultTileRpcInterface);
    const tempFileBase = path.join(IVaultHost.cacheDir, key);
    const checkpoint = SnapshotDb.openFile(dbPath, { key, tempFileBase });
    expect(checkpoint[_nativeDb].getTempFileBaseName()).equals(tempFileBase);
    // Generate tile
    const tileProps = await getTileProps(checkpoint);
    expect(tileProps).not.undefined;

    sinon.stub(Logger, "logError").callsFake(() => Logger.stringifyMetaData());
    const errorStringify = sinon.spy(Logger, "stringifyMetaData");

    await RpcTrace.run(fakeRpc, async () => {
      Logger.logError("fake", "fake message");
      return tileRpcInterface.generateTileContent(checkpoint.getRpcProps(), tileProps!.treeId, tileProps!.contentId, tileProps!.guid);
    });

    const logMsg = errorStringify.getCall(0).returnValue;
    expect(logMsg).includes(`"ActivityId":"${fakeRpc.activityId}"`); // from rpc, should include RPC activity
    expect(logMsg).to.not.include("token"); // but token should not appear

    expect(IVaultJsFs.existsSync(`${tempFileBase}.Tiles`)).true;
    checkpoint.close();
  });
});

