/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { EditTxnError, RpcRegistry } from "@szewtwin/core-common";
import { BriefcaseManager } from "../BriefcaseManager";
import { EditTxn } from "../EditTxn";
import { IVaultJsFs } from "../IVaultJsFs";
import { SnapshotDb, StandaloneDb } from "../IVaultDb";
import { IVaultHost, IVaultHostOptions, KnownLocations } from "../IVaultHost";
import { Schemas } from "../Schema";
import { KnownTestLocations } from "./KnownTestLocations";
import { AzureServerStorage } from "@szewtwin/object-storage-azure";
import type { ServerStorage } from "@szewtwin/object-storage-core";
import { TestUtils } from "./TestUtils";
import { IVaultTestUtils } from "./IVaultTestUtils";
import { Logger, LogLevel } from "@szewtwin/core-szewec";
import { overrideSyncNativeLogLevels } from "../internal/NativePlatform";
import { _getHubAccess, _hubAccess } from "../internal/Symbols";

describe("IVaultHost", () => {
  const opts = { cacheDir: TestUtils.getCacheDir() };
  beforeEach(async () => {
    await TestUtils.shutdownBackend();
  });

  afterEach(async () => {
    sinon.restore();
  });

  after(async () => {
    await TestUtils.startBackend();
  });

  it("valid default configuration", async () => {
    await IVaultHost.startup(opts);

    // Valid registered implemented RPCs
    expect(RpcRegistry.instance.implementationClasses.size).to.equal(4);
    expect(RpcRegistry.instance.implementationClasses.get("IVaultReadRpcInterface")).to.exist;
    expect(RpcRegistry.instance.implementationClasses.get("IVaultTileRpcInterface")).to.exist;
    expect(RpcRegistry.instance.implementationClasses.get("SnapshotIVaultRpcInterface")).to.exist;
    expect(RpcRegistry.instance.implementationClasses.get("DevToolsRpcInterface")).to.exist;

    expect(Schemas.getRegisteredSchema("BisCore")).to.exist;
    expect(Schemas.getRegisteredSchema("Generic")).to.exist;
    expect(Schemas.getRegisteredSchema("Functional")).to.exist;
    expect(EditTxn.implicitWriteEnforcement).to.equal("allow");
  });

  it("should allow configuring explicit transaction behavior", async () => {
    await IVaultHost.startup({ ...opts, implicitWriteEnforcement: "log" });
    expect(EditTxn.implicitWriteEnforcement).to.equal("log");
    expect(IVaultHost.configuration?.implicitWriteEnforcement).to.equal("log");
  });

  it("should properly cleanup beforeExit event listeners on shutdown", async () => {
    const beforeCount = process.listenerCount("beforeExit");
    for (let i = 0; i <= 15; i++) {
      await IVaultHost.startup();
      await IVaultHost.shutdown();

    }
    const afterCount = process.listenerCount("beforeExit");
    expect(beforeCount).to.be.equal(afterCount);
  });

  it("should call logger sync function", async () => {
    let nSyncCalls = 0;
    overrideSyncNativeLogLevels(() => ++nSyncCalls);
    await IVaultHost.startup(opts);
    expect(nSyncCalls).to.equal(0);
    Logger.setLevel("test-cat", LogLevel.Warning);
    expect(nSyncCalls).to.equal(1);
    overrideSyncNativeLogLevels(undefined);
  });

  it("should raise onAfterStartup events", async () => {
    const eventHandler = sinon.spy();
    IVaultHost.onAfterStartup.addOnce(eventHandler);
    await IVaultHost.startup(opts);
    expect(eventHandler.calledOnce).to.be.true;
  });

  it("should raise onBeforeShutdown events", async () => {
    await TestUtils.startBackend();
    const eventHandler = sinon.spy();
    IVaultHost.onBeforeShutdown.addOnce(eventHandler);
    const filename = IVaultTestUtils.resolveAssetFile("GetSetAutoHandledStructProperties.dtw");

    const workspaceClose = sinon.spy((IVaultHost.appWorkspace as any), "close");
    const saveSettings = IVaultHost.appWorkspace.settings as any;
    const settingClose = sinon.spy(saveSettings, "close");
    expect(workspaceClose.callCount).eq(0);
    expect(settingClose.callCount).eq(0);
    expect(saveSettings._remove).to.not.be.undefined;

    // shutdown should close any opened iVaults. Make sure that happens
    const ivault1 = SnapshotDb.openFile(filename, { key: "ivault1" });
    const ivault2 = SnapshotDb.openFile(filename, { key: "ivault2" });
    const ivault3 = SnapshotDb.openFile(filename, { key: "ivault3" });
    const ivault4 = SnapshotDb.openFile(filename, { key: "ivault4" });
    assert.notEqual(ivault1, ivault2);
    assert.notEqual(ivault2, ivault3);
    expect(ivault1.isOpen).to.be.true;
    expect(ivault2.isOpen).to.be.true;
    expect(ivault3.isOpen).to.be.true;
    ivault4.close(); // make sure it gets removed so we don't try to close it again on shutdown
    await TestUtils.shutdownBackend();
    expect(eventHandler.calledOnce).to.be.true;
    assert.isFalse(ivault1.isOpen, "shutdown should close iVault1");
    assert.isFalse(ivault2.isOpen, "shutdown should close iVault2");
    assert.isFalse(ivault3.isOpen, "shutdown should close iVault3");
    expect(workspaceClose.callCount).eq(1);
    expect(settingClose.callCount).eq(1);
    expect(saveSettings._remove).to.be.undefined;
  });

  it("should auto-shutdown on process beforeExit event", async () => {
    await TestUtils.startBackend();
    expect(IVaultHost.isValid).to.be.true;
    const eventHandler = sinon.spy();
    IVaultHost.onBeforeShutdown.addOnce(eventHandler);
    process.emit("beforeExit", 0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(eventHandler.calledOnce).to.be.true;
    expect(IVaultHost.isValid).to.be.false;
  });

  it("should set the briefcase cache directory to expected locations", async () => {
    const config: IVaultHostOptions = {};
    const cacheSubDir = "ivaults";

    // Test cache default location
    await IVaultHost.shutdown();
    await IVaultHost.startup(config);
    let expectedDir = path.join(IVaultHost.cacheDir, cacheSubDir);
    assert.strictEqual(expectedDir, BriefcaseManager.cacheDir);

    // Test custom cache location
    await IVaultHost.shutdown();
    config.cacheDir = KnownLocations.tmpdir;
    await IVaultHost.startup(config);
    expectedDir = path.join(KnownLocations.tmpdir, cacheSubDir);
    assert.strictEqual(expectedDir, BriefcaseManager.cacheDir);
  });

  it("should set Azure cloud storage provider for tile cache given credentials", async () => {
    const config: IVaultHostOptions = {};
    config.tileCacheAzureCredentials = {
      account: "testAccount",
      accessKey: "testAccessKey",
    };

    await IVaultHost.startup(config);

    assert.isDefined(IVaultHost.tileStorage);
    assert.isDefined(IVaultHost.tileStorage!.storage);
    assert.instanceOf(IVaultHost.tileStorage!.storage, AzureServerStorage);
    assert.equal((IVaultHost.tileStorage?.storage as any)._config.baseUrl, `https://${config.tileCacheAzureCredentials.account}.blob.core.windows.net`)
  });

  it("should set Azure cloud storage provider for tile cache with custom baseUrl", async () => {
    const config: IVaultHostOptions = {};
    config.tileCacheAzureCredentials = {
      account: "testAccount",
      accessKey: "testAccessKey",
      baseUrl: "https://custom.blob.core.windows.net",
    };

    await IVaultHost.startup(config);

    assert.isDefined(IVaultHost.tileStorage);
    assert.isDefined(IVaultHost.tileStorage!.storage);
    assert.instanceOf(IVaultHost.tileStorage!.storage, AzureServerStorage);
    assert.equal((IVaultHost.tileStorage?.storage as any)._config.baseUrl, config.tileCacheAzureCredentials.baseUrl)
  });

  it("should set custom cloud storage provider for tile cache", async () => {
    const config: IVaultHostOptions = {};
    config.tileCacheStorage = {} as ServerStorage;

    await IVaultHost.startup(config);

    assert.isDefined(IVaultHost.tileStorage);
    assert.equal(IVaultHost.tileStorage!.storage, config.tileCacheStorage);
  });

  it("should throw if both tileCacheStorage and tileCacheAzureCredentials are set", async () => {
    const config: IVaultHostOptions = {};
    config.tileCacheAzureCredentials = {
      account: "testAccount",
      accessKey: "testAccessKey",
    };
    config.tileCacheStorage = {} as ServerStorage;

    await expect(IVaultHost.startup(config)).to.be.rejectedWith("Cannot use both Azure and custom cloud storage providers for tile cache.");
  });

  it("should use local cache if cloud storage provider for tile cache is not set", async () => {
    await IVaultHost.startup(opts);

    assert.isUndefined(IVaultHost.tileStorage);
  });

  it("should cleanup tileStorage on shutdown", async () => {
    const config: IVaultHostOptions = {};
    config.tileCacheStorage = {} as ServerStorage;

    await IVaultHost.startup(config);

    assert.equal(IVaultHost.tileStorage?.storage, config.tileCacheStorage);

    await IVaultHost.shutdown();

    assert.isUndefined(IVaultHost.tileStorage);
  });

  it("should throw if hubAccess is undefined and getter is called", async () => {
    await IVaultHost.startup(opts);
    expect(IVaultHost[_getHubAccess]()).undefined;
    expect(() => IVaultHost[_hubAccess]).throws();
  });

  it("computeSchemaChecksum", () => {
    const assetsDir = path.join(KnownTestLocations.assetsDir, "DMSchemaOps");
    const schemaXmlPath = path.join(assetsDir, "SchemaA.dmschema.xml");
    let referencePaths = [assetsDir];
    let sha1 = IVaultHost.computeSchemaChecksum({ schemaXmlPath, referencePaths });
    expect(sha1).equal("3ac6578060902aa0b8426b61d62045fdf7fa0b2b");

    expect(() => IVaultHost.computeSchemaChecksum({ schemaXmlPath, referencePaths, exactMatch: true })).throws("Failed to read schema SchemaA.dmschema");

    referencePaths = [path.join(assetsDir, "exact-match")];
    sha1 = IVaultHost.computeSchemaChecksum({ schemaXmlPath, referencePaths, exactMatch: true });
    expect(sha1).equal("2a618664fbba1df7c05f27d7c0e8f58de250003b");
  });

  it("should log implicit transaction writes when configured to log", async () => {
    await IVaultHost.startup({ ...opts, implicitWriteEnforcement: "log" });
    const logError = sinon.spy(Logger, "logError");
    const fileName = IVaultTestUtils.prepareOutputFile("IVaultHost", "implicitWriteLog.dtw");
    const db = StandaloneDb.createEmpty(fileName, {
      rootSubject: { name: "implicitWriteLog" },
      enableTransactions: true,
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      db.saveFileProperty({ name: "log-mode", namespace: "IVaultHostTest" }, "value");
      expect(db.queryFilePropertyString({ name: "log-mode", namespace: "IVaultHostTest" })).to.equal("value");
      expect(logError.calledOnce).to.be.true;
      expect(logError.firstCall.args[0]).to.equal("core-backend.IVaultDb");
      expect(EditTxnError.isError(logError.firstCall.args[1], "implicit-txn-write-disallowed")).to.be.true;
    } finally {
      if (db.isOpen)
        db.close();

      IVaultJsFs.removeSync(fileName);
    }
  });

  it("should reject implicit transaction writes when configured to enforce", async () => {
    await IVaultHost.startup({ ...opts, implicitWriteEnforcement: "throw" });
    const fileName = IVaultTestUtils.prepareOutputFile("IVaultHost", "implicitWriteEnforce.dtw");
    const db = StandaloneDb.createEmpty(fileName, {
      rootSubject: { name: "implicitWriteEnforce" },
      enableTransactions: true,
    });

    try {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        db.saveFileProperty({ name: "enforce-mode", namespace: "IVaultHostTest" }, "value");
      }).to.throw().that.satisfies((error: unknown) => EditTxnError.isError(error, "implicit-txn-write-disallowed"));

      const txn = new EditTxn(db, "explicit test");
      txn.start();
      txn.saveFileProperty({ name: "explicit", namespace: "IVaultHostTest" }, "value");
      txn.end();

      expect(db.queryFilePropertyString({ name: "explicit", namespace: "IVaultHostTest" })).to.equal("value");
    } finally {
      if (db.isOpen)
        db.close();

      IVaultJsFs.removeSync(fileName);
    }
  });
});
