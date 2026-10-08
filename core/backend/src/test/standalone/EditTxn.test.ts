/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Logger, OpenMode } from "@szewtwin/core-szewec";
import { expect } from "chai";
import * as sinon from "sinon";
import { EditTxnError } from "@szewtwin/core-common";
import { EditTxn, type IVaultDb, IVaultJsFs, StandaloneDb } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";

class TestEditTxn extends EditTxn {
  public constructor(iVault: IVaultDb) {
    super(iVault, "test");
  }

  public writeFileProperty(name: string, value: string | undefined): void {
    super.saveFileProperty({ name, namespace: "EditTxnTest" }, value);
  }
}

class AbandonOnCloseEditTxn extends TestEditTxn {
  public override onClose(): void {
    if (this.isActive)
      this.abandonChanges();
  }
}

function expectEditTxnError(fn: () => void, key: EditTxnError.Key): void {
  expect(fn).to.throw().that.satisfies((error: unknown) => EditTxnError.isError(error, key));
}

function legacyWriteFileProperty(iVault: StandaloneDb, name: string, value: string): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  iVault.saveFileProperty({ name, namespace: "EditTxnTest" }, value);
}

describe("EditTxn", () => {
  let iVault: StandaloneDb;
  let fileName: string;

  beforeEach(() => {
    EditTxn.implicitWriteEnforcement = "allow";
    fileName = IVaultTestUtils.prepareOutputFile("EditTxn", "EditTxn.dtw");
    iVault = StandaloneDb.createEmpty(fileName, {
      rootSubject: { name: "EditTxn" },
      enableTransactions: true,
    });
  });

  afterEach(() => {
    EditTxn.implicitWriteEnforcement = "allow";
    sinon.restore();

    if (iVault.isOpen)
      iVault.close();

    IVaultJsFs.removeSync(fileName);
  });

  it("allows implicit writes before and after explicit txn scopes", () => {
    // Implicit IVaultDb mutators should work before any explicit EditTxn starts.
    legacyWriteFileProperty(iVault, "legacy-before-start", "value");
    expect(iVault.queryFilePropertyString({ name: "legacy-before-start", namespace: "EditTxnTest" })).to.equal("value");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.abandonChanges();

    const txn = new TestEditTxn(iVault);
    txn.start();
    expect(txn.isActive).to.be.true;

    txn.writeFileProperty("cancelled", "value");
    txn.end("abandon");
    // After canceling, implicit writes should still work.
    expect(txn.isActive).to.be.false;
    legacyWriteFileProperty(iVault, "legacy-after-cancel", "value");
    expect(iVault.queryFilePropertyString({ name: "legacy-after-cancel", namespace: "EditTxnTest" })).to.equal("value");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.abandonChanges();
    expect(iVault.queryFilePropertyString({ name: "cancelled", namespace: "EditTxnTest" })).to.be.undefined;

    txn.start();
    txn.writeFileProperty("saved", "value");
    txn.end();
    // Committing also leaves the iVault ready for later implicit writes.
    expect(txn.isActive).to.be.false;
    expect(iVault.queryFilePropertyString({ name: "saved", namespace: "EditTxnTest" })).to.equal("value");
    legacyWriteFileProperty(iVault, "legacy-after-end", "value");
    expect(iVault.queryFilePropertyString({ name: "legacy-after-end", namespace: "EditTxnTest" })).to.equal("value");
  });

  it("enforces identical explicit transaction behavior across allow, log, and throw settings", () => {
    const settings: Array<"allow" | "log" | "throw"> = ["allow", "log", "throw"];

    for (const setting of settings) {
      EditTxn.implicitWriteEnforcement = setting;
      const txn = new TestEditTxn(iVault);
      const inactiveName = `inactive-${setting}`;
      const savedName = `saved-${setting}`;
      const inactiveAgainName = `inactive-again-${setting}`;

      // Inactive explicit txn writes must always fail, regardless of enforcement.
      expectEditTxnError(() => txn.writeFileProperty(inactiveName, "value"), "not-active");
      expectEditTxnError(() => txn.saveChanges(`save ${inactiveName}`), "not-active");
      expect(iVault.queryFilePropertyString({ name: inactiveName, namespace: "EditTxnTest" })).to.be.undefined;
      expectEditTxnError(() => txn.end("abandon"), "not-active");

      txn.start();
      txn.writeFileProperty(savedName, "value");
      txn.saveChanges(`save ${savedName}`);
      expect(txn.isActive).to.be.true;

      txn.end();
      expect(iVault.queryFilePropertyString({ name: savedName, namespace: "EditTxnTest" })).to.equal("value");

      expectEditTxnError(() => txn.writeFileProperty(inactiveAgainName, "value"), "not-active");
      expectEditTxnError(() => txn.saveChanges(`save ${inactiveAgainName}`), "not-active");
      expect(iVault.queryFilePropertyString({ name: inactiveAgainName, namespace: "EditTxnTest" })).to.be.undefined;
      expectEditTxnError(() => txn.end("abandon"), "not-active");
    }
  });

  it("logs implicit writes in log mode but still rejects inactive explicit writes", () => {
    EditTxn.implicitWriteEnforcement = "log";
    const logError = sinon.spy(Logger, "logError");
    const txn = new TestEditTxn(iVault);

    legacyWriteFileProperty(iVault, "implicit-log", "value");
    expect(iVault.queryFilePropertyString({ name: "implicit-log", namespace: "EditTxnTest" })).to.equal("value");
    expect(logError.called).to.be.true;
    expect(logError.firstCall.args[0]).to.equal("core-backend.IVaultDb");
    expect(EditTxnError.isError(logError.firstCall.args[1], "implicit-txn-write-disallowed")).to.be.true;

    const callCount = logError.callCount;
    expectEditTxnError(() => txn.writeFileProperty("inactive-log", "value"), "not-active");
    expectEditTxnError(() => txn.saveChanges("save inactive log"), "not-active");
    expect(logError.callCount).to.equal(callCount);
    expectEditTxnError(() => txn.end("abandon"), "not-active");
  });

  it("rejects implicit writes in throw mode and still allows active explicit writes", () => {
    EditTxn.implicitWriteEnforcement = "throw";

    expectEditTxnError(() => legacyWriteFileProperty(iVault, "implicit-throw", "value"), "implicit-txn-write-disallowed");
    expect(iVault.queryFilePropertyString({ name: "implicit-throw", namespace: "EditTxnTest" })).to.be.undefined;

    const txn = new TestEditTxn(iVault);
    txn.start();
    txn.writeFileProperty("explicit-enforce", "value");
    txn.end();

    expect(iVault.queryFilePropertyString({ name: "explicit-enforce", namespace: "EditTxnTest" })).to.equal("value");
  });

  it("throws when started with unsaved changes", () => {
    // Unsaved changes made through the implicit surface block a new explicit EditTxn.
    legacyWriteFileProperty(iVault, "unsaved", "value");

    const txn = new TestEditTxn(iVault);
    expectEditTxnError(() => txn.start(), "unsaved-changes");

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.abandonChanges();
    legacyWriteFileProperty(iVault, "legacy-after-abandon", "value");
    expect(iVault.queryFilePropertyString({ name: "legacy-after-abandon", namespace: "EditTxnTest" })).to.equal("value");
  });

  it("rejects starting an explicit txn while another explicit txn is active", () => {
    const first = new TestEditTxn(iVault);
    const second = new TestEditTxn(iVault);

    first.start();
    expect(first.isActive).to.be.true;

    // EditTxn.start() now requires the implicit txn to be active, so a second explicit txn cannot start yet.
    expectEditTxnError(() => second.start(), "already-active");
    expect(first.isActive).to.be.true;
    expect(second.isActive).to.be.false;

    first.end("abandon");
    expect(first.isActive).to.be.false;
  });

  it("allows deprecated mutating APIs while an explicit txn is active when enforcement is none", () => {
    const txn = new TestEditTxn(iVault);
    txn.start();

    // Deprecated IVaultDb mutators route through the implicit txn and are allowed in compatibility mode.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.saveFileProperty({ name: "legacy", namespace: "EditTxnTest" }, "value");
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.saveChanges("legacy save");
    expect(iVault.queryFilePropertyString({ name: "legacy", namespace: "EditTxnTest" })).to.equal("value");

    txn.writeFileProperty("explicit", "value");
    txn.saveChanges("explicit save");
    expect(iVault.queryFilePropertyString({ name: "explicit", namespace: "EditTxnTest" })).to.equal("value");

    txn.end("abandon");
    expect(txn.isActive).to.be.false;
  });

  it("allows starting a new explicit txn when only pending changes exist", () => {
    const first = new TestEditTxn(iVault);
    const second = new TestEditTxn(iVault);

    first.start();
    first.writeFileProperty("pending", "value");
    first.saveChanges("save pending");

    // Saved-but-unpushed changes are allowed; only unsaved local changes block start().
    expect(iVault.txns.hasPendingTxns).to.be.true;
    expect(iVault.txns.hasUnsavedChanges).to.be.false;

    first.end("abandon");
    expect(() => second.start()).to.not.throw();
    expect(first.isActive).to.be.false;
    expect(second.isActive).to.be.true;

    second.end("abandon");
    expect(second.isActive).to.be.false;
  });

  it("uses the default description unless save is given an override", () => {
    const txn = new EditTxn(iVault, "default description");

    txn.start();
    txn.saveFileProperty({ name: "default-description", namespace: "EditTxnTest" }, "value");
    txn.saveChanges();
    expect(iVault.txns.getLastSavedTxnProps()?.props.description).to.equal("default description");

    txn.saveFileProperty({ name: "override-description", namespace: "EditTxnTest" }, "value");
    txn.end("save", "override description");
    expect(iVault.txns.getLastSavedTxnProps()?.props.description).to.equal("override description");
  });

  it("reverseTxns abandons unsaved changes from the active explicit txn", () => {
    const txn = new TestEditTxn(iVault);
    txn.start();
    txn.writeFileProperty("reverse", "value");

    // Reversing txns abandons the active explicit txn's local changes, but the explicit txn remains active.
    iVault.txns.reverseTxns(1);

    expect(txn.isActive).to.be.true;
    expect(iVault.txns.hasUnsavedChanges).to.be.false;
    expect(iVault.queryFilePropertyString({ name: "reverse", namespace: "EditTxnTest" })).to.be.undefined;

    txn.end("abandon");
    expect(txn.isActive).to.be.false;
  });

  it("saves unsaved changes from the active explicit txn when the iVault closes", () => {
    const txn = new TestEditTxn(iVault);
    txn.start();
    txn.writeFileProperty("unsaved-on-close", "value");

    iVault.close();
    iVault = StandaloneDb.openFile(fileName, OpenMode.Readonly);

    expect(iVault.queryFilePropertyString({ name: "unsaved-on-close", namespace: "EditTxnTest" })).to.equal("value");
  });

  it("allows subclasses to abandon unsaved changes when the iVault closes", () => {
    const txn = new AbandonOnCloseEditTxn(iVault);
    txn.start();
    txn.writeFileProperty("saved-on-close", "value");

    iVault.close();
    iVault = StandaloneDb.openFile(fileName, OpenMode.Readonly);

    expect(iVault.queryFilePropertyString({ name: "saved-on-close", namespace: "EditTxnTest" })).to.be.undefined;
  });
});

