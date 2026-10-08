/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import * as sinon from "sinon";
import { assert, BeDuration, Id64, Id64String, StopWatch, TransientIdSequence } from "@szewtwin/core-szewec";
import { Cartographic } from "@szewtwin/core-common";
import { BlankConnection, IVaultApp, IVaultConnection, SelectionSet, SelectionSetEventType } from "@szewtwin/core-frontend";
import { InstanceKey, KeySet, NodeKey, SelectionScope, StandardNodeTypes } from "@szewtwin/presentation-common";
import { createTestDMInstanceKey, createTestNodeKey, ResolvablePromise, waitForPendingAsyncs } from "@szewtwin/presentation-common/test-utils";
import { createStorage, CustomSelectable, SelectionStorage, TRANSIENT_ELEMENT_CLASSNAME } from "@szewtwin/unified-selection";
import { Presentation } from "../../presentation-frontend/Presentation.js";
import { PresentationManager } from "../../presentation-frontend/PresentationManager.js";
import { HiliteSetProvider } from "../../presentation-frontend/selection/HiliteSetProvider.js";
import { SelectionChangeEventArgs, SelectionChangesListener } from "../../presentation-frontend/selection/SelectionChangeEvent.js";
import { SelectionManager, ToolSelectionSyncHandler } from "../../presentation-frontend/selection/SelectionManager.js";
import { SelectionScopesManager } from "../../presentation-frontend/selection/SelectionScopesManager.js";

const generateSelection = (): InstanceKey[] => {
  return [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" }), createTestDMInstanceKey({ id: "0x3" })];
};

describe("SelectionManager", () => {
  let selectionManager: SelectionManager;
  let baseSelection: InstanceKey[];

  let ss: SelectionSet;
  let ivault: IVaultConnection;

  const scopesManager = {
    activeScope: undefined as undefined | string | SelectionScope,
    getSelectionScopes: sinon.stub<Parameters<SelectionScopesManager["getSelectionScopes"]>, ReturnType<SelectionScopesManager["getSelectionScopes"]>>(),
    computeSelection: sinon.stub<Parameters<SelectionScopesManager["computeSelection"]>, ReturnType<SelectionScopesManager["computeSelection"]>>(),
  };

  const source: string = "test";

  async function waitForSelection(size: number, targetIvault: IVaultConnection, level?: number) {
    return waitFor(() => {
      const selection = selectionManager.getSelection(targetIvault, level);
      expect(selection.size).to.be.eq(size);
      return selection;
    });
  }

  beforeEach(() => {
    ivault = {} as IVaultConnection;
    Object.assign(ivault, {
      key: "ivault-key",
      selectionSet: (ss = new SelectionSet(ivault)),
    });

    scopesManager.activeScope = undefined;
    scopesManager.computeSelection.reset();
    scopesManager.getSelectionScopes.reset();

    baseSelection = generateSelection();
  });

  describe("with own storage", () => {
    beforeEach(() => {
      selectionManager = new SelectionManager({ scopes: scopesManager as unknown as SelectionScopesManager });
      IVaultConnection.onOpen.raiseEvent(ivault);
    });

    afterEach(() => {
      IVaultConnection.onClose.raiseEvent(ivault);
    });

    it("clears ivault selection when it's closed", async () => {
      selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey()]);
      await waitForSelection(1, ivault);

      IVaultConnection.onClose.raiseEvent(ivault);
      await waitForSelection(0, ivault);
    });

    describe("getSelectionLevels", () => {
      it("returns empty list when there're no selection levels", () => {
        expect(selectionManager.getSelectionLevels(ivault)).to.be.empty;
      });

      it("returns available selection levels", async () => {
        selectionManager.addToSelection("", ivault, [createTestDMInstanceKey({ id: "0x1" })], 0);
        selectionManager.addToSelection("", ivault, [createTestDMInstanceKey({ id: "0x2" })], 3);
        await waitFor(() => {
          expect(selectionManager.getSelectionLevels(ivault)).to.deep.eq([0, 3]);
        });
      });

      it("doesn't include empty selection levels", async () => {
        selectionManager.addToSelection("", ivault, [createTestDMInstanceKey({ id: "0x1" })], 0);
        selectionManager.addToSelection("", ivault, [createTestDMInstanceKey({ id: "0x2" })], 1);
        selectionManager.addToSelection("", ivault, [], 2);
        await waitFor(() => {
          expect(selectionManager.getSelectionLevels(ivault)).to.deep.eq([0, 1]);
        });
      });
    });

    describe("addToSelection", () => {
      it("adds selection on an empty selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);

        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
      });

      it("adds selection on non empty selection", async () => {
        selectionManager.addToSelection(source, ivault, [baseSelection[0]]);
        selectionManager.addToSelection(source, ivault, [baseSelection[1], baseSelection[2]]);

        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
      });

      it("adds selection on different ivaults", async () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault2, baseSelection);

        for (const currIVault of [ivault, ivault2]) {
          const selectedItemsSet = await waitForSelection(baseSelection.length, currIVault);

          for (const key of baseSelection) {
            expect(selectedItemsSet.has(key)).true;
          }
        }
      });

      it("adds selection on different levels", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, baseSelection, 1);
        for (let i = 0; i <= 1; i++) {
          const selectedItemsSet = await waitForSelection(baseSelection.length, ivault, i);

          for (const key of baseSelection) {
            expect(selectedItemsSet.has(key)).true;
          }
        }
      });

      it("clears higher level selection when adding items to lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey({ id: "0x1" })], 1);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey({ id: "0x21" })]);

        await waitForSelection(0, ivault, 1);
      });

      it("doesn't clear higher level selection when adding same items to lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey()], 1);
        selectionManager.addToSelection(source, ivault, baseSelection);

        await waitForSelection(1, ivault, 1);
      });
    });

    describe("replaceSelection", () => {
      it("replaces selection on an empty selection", async () => {
        selectionManager.replaceSelection(source, ivault, baseSelection);

        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
      });

      it("replaces on an non empty selection", async () => {
        selectionManager.addToSelection(source, ivault, [baseSelection[0]]);
        selectionManager.replaceSelection(source, ivault, [baseSelection[1], baseSelection[2]]);

        const selectedItemsSet = await waitForSelection(baseSelection.length - 1, ivault);
        expect(selectedItemsSet.has(baseSelection[0])).false;
        expect(selectedItemsSet.has(baseSelection[1])).true;
        expect(selectedItemsSet.has(baseSelection[2])).true;
      });

      it("replaces on different ivaults", async () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
        selectionManager.replaceSelection(source, ivault, baseSelection);
        selectionManager.replaceSelection(source, ivault2, baseSelection);

        for (const currIVault of [ivault, ivault2]) {
          const selectedItemsSet = await waitForSelection(baseSelection.length, currIVault);

          for (const key of baseSelection) {
            expect(selectedItemsSet.has(key)).true;
          }
        }
      });

      it("replaces with different levels", async () => {
        selectionManager.replaceSelection(source, ivault, baseSelection);
        selectionManager.replaceSelection(source, ivault, baseSelection, 1);
        for (let i = 0; i <= 1; i++) {
          const selectedItemsSet = await waitForSelection(baseSelection.length, ivault, i);

          for (const key of baseSelection) {
            expect(selectedItemsSet.has(key)).true;
          }
        }
      });

      it("clears higher level selection when replacing lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey({ id: "0x1" })], 1);
        selectionManager.replaceSelection(source, ivault, [createTestDMInstanceKey({ id: "0x2" })]);

        await waitForSelection(0, ivault, 1);
      });

      it("doesn't clear higher level selection when replacing lower level selection with same items", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey()], 1);
        selectionManager.replaceSelection(source, ivault, baseSelection);

        await waitForSelection(1, ivault, 1);
      });
    });

    describe("clearSelection", () => {
      it("clears empty selection", async () => {
        selectionManager.clearSelection(source, ivault);
        await waitForSelection(0, ivault);
      });

      it("clears non empty selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.clearSelection(source, ivault);
        await waitForSelection(0, ivault);
      });

      it("clears on different ivaults", async () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault2, baseSelection);

        selectionManager.clearSelection(source, ivault2);

        await waitForSelection(0, ivault2);
        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
      });

      it("clears with different levels", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, baseSelection, 1);

        selectionManager.clearSelection(source, ivault, 1);
        await waitForSelection(0, ivault, 1);

        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
      });

      it("clears higher level selection when clearing items in lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey()], 1);
        selectionManager.clearSelection(source, ivault);
        await waitForSelection(0, ivault, 1);
      });

      it("doesn't clear higher level selection when clearing empty lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey()], 1);
        selectionManager.clearSelection(source, ivault);
        await waitForSelection(1, ivault, 1);
      });
    });

    describe("removeFromSelection", () => {
      it("removes part of the selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.removeFromSelection(source, ivault, [baseSelection[1], baseSelection[2]]);

        const selectedItemsSet = await waitForSelection(baseSelection.length - 2, ivault);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 2);
        expect(selectedItemsSet.has(baseSelection[0])).true;
        expect(selectedItemsSet.has(baseSelection[1])).false;
        expect(selectedItemsSet.has(baseSelection[2])).false;
      });

      it("removes whole selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.removeFromSelection(source, ivault, baseSelection);

        await waitForSelection(0, ivault);
      });

      it("removes on different ivaults", async () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault2, baseSelection);

        selectionManager.removeFromSelection(source, ivault, [baseSelection[0]]);
        selectionManager.removeFromSelection(source, ivault2, [baseSelection[1], baseSelection[2]]);

        let selectedItemsSet = await waitForSelection(baseSelection.length - 1, ivault);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 1);
        expect(selectedItemsSet.has(baseSelection[0])).false;
        expect(selectedItemsSet.has(baseSelection[1])).true;
        expect(selectedItemsSet.has(baseSelection[2])).true;

        selectedItemsSet = await waitForSelection(baseSelection.length - 2, ivault2);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 2);
        expect(selectedItemsSet.has(baseSelection[0])).true;
        expect(selectedItemsSet.has(baseSelection[1])).false;
        expect(selectedItemsSet.has(baseSelection[2])).false;
      });

      it("removes with different levels", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, baseSelection, 1);
        selectionManager.removeFromSelection(source, ivault, [baseSelection[0]], 1);

        let selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length);
        expect(selectedItemsSet.has(baseSelection[0])).true;
        expect(selectedItemsSet.has(baseSelection[1])).true;
        expect(selectedItemsSet.has(baseSelection[2])).true;

        selectedItemsSet = await waitForSelection(baseSelection.length - 1, ivault, 1);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 1);
        expect(selectedItemsSet.has(baseSelection[0])).false;
        expect(selectedItemsSet.has(baseSelection[1])).true;
        expect(selectedItemsSet.has(baseSelection[2])).true;
      });

      it("clears higher level selection when removing items from lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey()], 1);
        selectionManager.removeFromSelection(source, ivault, baseSelection);

        await waitForSelection(0, ivault, 1);
      });

      it("doesn't clear higher level selection when removing non-existing items from lower level selection", async () => {
        selectionManager.addToSelection(source, ivault, baseSelection);
        selectionManager.addToSelection(source, ivault, [createTestDMInstanceKey({ className: "TestSchema:AdditionalClass", id: "0x1" })], 1);
        selectionManager.removeFromSelection(source, ivault, [createTestDMInstanceKey({ className: "TestSchema:AdditionalClass", id: "0x2" })]);

        await waitForSelection(1, ivault, 1);
      });
    });

    describe("addToSelectionWithSelectionScope", () => {
      it("adds scoped selection", async () => {
        const scope: SelectionScope = { id: "element", label: "Element" };
        const ids = ["0x123"];
        scopesManager.getSelectionScopes.resolves([scope]);
        scopesManager.computeSelection.resolves(new KeySet(baseSelection));

        await selectionManager.addToSelectionWithScope(source, ivault, ids, scope);
        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
        expect(scopesManager.computeSelection).to.be.called;
      });
    });

    describe("replaceSelectionWithSelectionScope", () => {
      it("replaces empty selection with scoped selection", async () => {
        const scope: SelectionScope = { id: "element", label: "Element" };
        const ids = ["0x123"];
        scopesManager.getSelectionScopes.resolves([scope]);
        scopesManager.computeSelection.resolves(new KeySet(baseSelection));

        await selectionManager.replaceSelectionWithScope(source, ivault, ids, scope);
        const selectedItemsSet = await waitForSelection(baseSelection.length, ivault);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length);
        for (const key of baseSelection) {
          expect(selectedItemsSet.has(key)).true;
        }
        expect(scopesManager.computeSelection).to.be.called;
      });
    });

    describe("removeFromSelectionWithSelectionScope", () => {
      it("removes scoped selection", async () => {
        const scope: SelectionScope = { id: "element", label: "Element" };
        const ids = ["0x123"];
        scopesManager.getSelectionScopes.resolves([scope]);
        scopesManager.computeSelection.resolves(new KeySet(baseSelection));

        const additionalKey = createTestDMInstanceKey({ className: "TestSchema:AdditionalClass", id: "0x1" });
        selectionManager.addToSelection(source, ivault, [...baseSelection, additionalKey]);
        await selectionManager.removeFromSelectionWithScope(source, ivault, ids, scope);
        const selectedItemsSet = await waitForSelection(1, ivault);
        expect(selectedItemsSet.has(additionalKey)).true;
        expect(scopesManager.computeSelection).to.be.called;
      });
    });

    describe("handleEvent", () => {
      it("fires `selectionChange` event after `addToSelection`, `replaceSelection`, `clearSelection`, `removeFromSelection`", async () => {
        const raiseEventSpy = sinon.spy(selectionManager.selectionChange, "raiseEvent");
        selectionManager.addToSelection(source, ivault, baseSelection);
        await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(1));
        selectionManager.removeFromSelection(source, ivault, baseSelection);
        await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(2));
        selectionManager.replaceSelection(source, ivault, baseSelection);
        await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(3));
        selectionManager.clearSelection(source, ivault);
        await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(4));
      });

      it("doesn't fire `selectionChange` event after addToSelection, replaceSelection, clearSelection, removeFromSelection if nothing changes", () => {
        const raiseEventSpy = sinon.spy(selectionManager.selectionChange, "raiseEvent");
        selectionManager.addToSelection(source, ivault, []);
        selectionManager.clearSelection(source, ivault);
        selectionManager.removeFromSelection(source, ivault, baseSelection);
        selectionManager.replaceSelection(source, ivault, []);
        expect(raiseEventSpy, "Expected selectionChange.raiseEvent to not be called").to.not.have.been.called;
      });

      it("fires `selectionChange` event after `addToSelection`, `replaceSelection`, `clearSelection`, `removeFromSelection` with `BlankConnection", async () => {
        const blankIvault = BlankConnection.create({ name: "blankConnection", extents: { low: {}, high: {} }, location: Cartographic.createZero() });
        try {
          const raiseEventSpy = sinon.spy(selectionManager.selectionChange, "raiseEvent");
          selectionManager.addToSelection(source, blankIvault, baseSelection);
          await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(1));
          selectionManager.removeFromSelection(source, blankIvault, baseSelection);
          await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(2));
          selectionManager.replaceSelection(source, blankIvault, baseSelection);
          await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(3));
          selectionManager.clearSelection(source, blankIvault);
          await waitFor(() => expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(4));
        } finally {
          await blankIvault.close();
        }
      });
    });

    describe("setSyncWithIVaultToolSelection", () => {
      beforeEach(() => {
        sinon.stub(IVaultApp, "viewManager").get(() => ({
          onSelectionSetChanged: sinon.stub(),
        }));
      });

      afterEach(() => {
        sinon.restore();
      });

      it("registers tool selection change listener once per ivault", () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
        const ss2 = new SelectionSet(ivault2);
        Object.assign(ivault2, { selectionSet: ss2 });

        selectionManager.setSyncWithIVaultToolSelection(ivault);
        expect(ss.onChanged.numberOfListeners).to.eq(1); // verify listener added

        selectionManager.setSyncWithIVaultToolSelection(ivault);
        expect(ss.onChanged.numberOfListeners).to.eq(1); // verify listener _not_ added for the same ivault

        selectionManager.setSyncWithIVaultToolSelection(ivault2);
        expect(ss2.onChanged.numberOfListeners).to.eq(1); // verify listener added for a different ivault

        selectionManager.setSyncWithIVaultToolSelection(ivault2, false);
        expect(ss2.onChanged.numberOfListeners).to.eq(0); // verify listener removed

        selectionManager.setSyncWithIVaultToolSelection(ivault, false);
        expect(ss.onChanged.numberOfListeners).to.eq(1); // verify listener _not_ removed as the ivault was registered to sync twice

        selectionManager.setSyncWithIVaultToolSelection(ivault, false);
        expect(ss.onChanged.numberOfListeners).to.eq(0); // verify listener removed

        selectionManager.setSyncWithIVaultToolSelection(ivault, false);
        expect(ss.onChanged.numberOfListeners).to.eq(0); // verify nothing happens as the listeners was removed previously
      });

      describe("syncing with ivault tool selection", () => {
        let syncer: ToolSelectionSyncHandler;

        const matchKeyset = (keys: KeySet) =>
          sinon.match((value: KeySet) => {
            return value instanceof KeySet && value.size === keys.size && value.hasAll(keys);
          });

        beforeEach(() => {
          syncer = new ToolSelectionSyncHandler(ivault, selectionManager);
        });

        afterEach(() => {
          syncer[Symbol.dispose]();
        });

        describe("choosing scope", () => {
          it('uses "element" scope when `activeScope = undefined`', async () => {
            scopesManager.computeSelection.resolves(new KeySet([createTestDMInstanceKey()]));
            ss.add({ elements: "0x123" });
            await waitForPendingAsyncs(syncer);
            await waitForSelection(1, ivault);
            expect(scopesManager.computeSelection).to.be.calledWith(
              sinon.match(() => true),
              sinon.match(() => true),
              sinon.match((options) => options.id === "element"),
            );
          });

          it('uses "element" scope when `activeScope = "element"`', async () => {
            scopesManager.activeScope = "element";
            scopesManager.computeSelection.resolves(new KeySet([createTestDMInstanceKey()]));
            ss.add({ elements: "0x123" });
            await waitForPendingAsyncs(syncer);
            await waitForSelection(1, ivault);
            expect(scopesManager.computeSelection).to.be.calledWith(
              sinon.match(() => true),
              sinon.match(() => true),
              sinon.match((options) => options.id === "element"),
            );
          });
        });

        describe("changing logical selection", () => {
          let transientElementId: Id64String;
          let transientElementKey: InstanceKey;
          let persistentElementId: Id64String;
          let persistentElementKey: InstanceKey;
          let modelId: Id64String;
          let modelKey: InstanceKey;
          let subcategoryId: Id64String;
          let subcategoryKey: InstanceKey;
          const logicalSelectionChangesListener = sinon.stub();

          beforeEach(() => {
            const scope: SelectionScope = {
              id: "test scope",
              label: "Test",
            };
            transientElementId = new TransientIdSequence().getNext();
            transientElementKey = { className: TRANSIENT_ELEMENT_CLASSNAME, id: transientElementId };
            persistentElementId = "0x123";
            persistentElementKey = createTestDMInstanceKey({ id: "0x123" });
            modelId = "0x456";
            modelKey = { className: "BisCore.Model", id: "0x456" };
            subcategoryId = "0x789";
            subcategoryKey = { className: "BisCore.SubCategory", id: "0x789" };

            logicalSelectionChangesListener.reset();
            selectionManager.selectionChange.addListener(logicalSelectionChangesListener);

            scopesManager.activeScope = scope;
            scopesManager.computeSelection.callsFake(async (_, ids) => {
              const keys = new KeySet();
              for (const id of Id64.iterable(ids)) {
                switch (id) {
                  case persistentElementId:
                    keys.add(persistentElementKey);
                    break;
                  case modelId:
                    keys.add(modelKey);
                    break;
                  case subcategoryId:
                    keys.add(subcategoryKey);
                    break;
                }
              }
              return keys;
            });
          });

          it("ignores events with different ivault", async () => {
            const spy = sinon.spy(selectionManager, "addToSelectionWithScope");
            const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
            const ss2 = new SelectionSet(ivault2);
            Object.assign(ivault2, { selectionSet: ss2 });
            ss.onChanged.raiseEvent({ type: SelectionSetEventType.Add, set: ss2, added: ["0x1"], additions: { elements: ["0x1"] } });
            await waitForPendingAsyncs(syncer);
            await waitForSelection(0, ivault);
            expect(spy).to.not.be.called;
          });

          it("adds models to logical selection when tool selection changes", async () => {
            const spy = sinon.spy(selectionManager, "addToSelection");

            ss.add({ models: [modelId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(modelKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([modelKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("adds subcategories to logical selection when tool selection changes", async () => {
            const spy = sinon.spy(selectionManager, "addToSelection");

            ss.add({ subcategories: [subcategoryId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(subcategoryKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([subcategoryKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("adds persistent elements to logical selection when tool selection changes", async () => {
            const spy = sinon.spy(selectionManager, "addToSelection");

            ss.add({ elements: [persistentElementId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(persistentElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([persistentElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("adds transient elements to logical selection when tool selection changes", async () => {
            const spy = sinon.spy(selectionManager, "addToSelection");

            ss.add({ elements: [transientElementId] });
            await waitForPendingAsyncs(syncer);
            const selection = await waitForSelection(1, ivault);
            expect(selection.has(transientElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([transientElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("adds mixed elements to logical selection when tool selection changes", async () => {
            const spy = sinon.spy(selectionManager, "addToSelection");

            ss.add({ elements: [transientElementId, persistentElementId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(2, ivault);
            expect(selection.has(persistentElementKey)).to.be.true;
            expect(selection.has(transientElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([persistentElementKey, transientElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("replaces persistent elements in logical selection when tool selection changes", async () => {
            selectionManager.addToSelection("", ivault, [createTestDMInstanceKey({ className: "TestSchema:AdditionalClass" })]);
            await waitForSelection(1, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "replaceSelection");

            ss.replace({ elements: [persistentElementId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(persistentElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([persistentElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("replaces transient elements in logical selection when tool selection changes", async () => {
            selectionManager.addToSelection("", ivault, [createTestDMInstanceKey()]);
            await waitForSelection(1, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "replaceSelection");

            ss.replace({ elements: [transientElementId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(transientElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([transientElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("replaces mixed elements in logical selection when tool selection changes", async () => {
            selectionManager.addToSelection("", ivault, [createTestDMInstanceKey()]);
            await waitForSelection(1, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "replaceSelection");

            ss.replace({ elements: [persistentElementId, transientElementId] });
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(2, ivault);
            expect(selection.has(persistentElementKey)).to.be.true;
            expect(selection.has(transientElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([persistentElementKey, transientElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("removes persistent elements from logical selection when tool selection changes", async () => {
            ss.add({ elements: [persistentElementId, transientElementId] });
            await waitForSelection(2, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "removeFromSelection");

            ss.remove(persistentElementId);
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(transientElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([persistentElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("removes transient elements from logical selection when tool selection changes", async () => {
            ss.add({ elements: [persistentElementId, transientElementId] });
            await waitForSelection(2, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "removeFromSelection");

            ss.remove(transientElementId);
            await waitForPendingAsyncs(syncer);

            const selection = await waitForSelection(1, ivault);
            expect(selection.has(persistentElementKey)).to.be.true;

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([transientElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("removes mixed elements from logical selection when tool selection changes", async () => {
            ss.add({ elements: [persistentElementId, transientElementId] });
            await waitForSelection(2, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "removeFromSelection");

            ss.remove([persistentElementId, transientElementId]);
            await waitForPendingAsyncs(syncer);

            await waitForSelection(0, ivault);

            expect(spy).to.be.calledOnceWith("Tool", ivault, matchKeyset(new KeySet([persistentElementKey, transientElementKey])), 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });

          it("clears elements from logical selection when tool selection is cleared", async () => {
            ss.add({ elements: [persistentElementId, transientElementId] });
            await waitForSelection(2, ivault);
            logicalSelectionChangesListener.reset();

            const spy = sinon.spy(selectionManager, "clearSelection");

            ss.emptyAll();
            await waitForPendingAsyncs(syncer);

            await waitForSelection(0, ivault);

            expect(spy).to.be.calledOnceWith("Tool", ivault, 0);
            expect(logicalSelectionChangesListener).to.be.calledOnce;
          });
        });
      });
    });

    describe("suspendIVaultToolSelectionSync", () => {
      beforeEach(() => {
        scopesManager.computeSelection.resolves(new KeySet());

        selectionManager.setSyncWithIVaultToolSelection(ivault, true);
      });

      it("suspends selection synchronization", () => {
        const spy = sinon.spy(selectionManager, "clearSelection");
        {
          using _ = selectionManager.suspendIVaultToolSelectionSync(ivault);
          ss.onChanged.raiseEvent({ type: SelectionSetEventType.Clear, set: ss, removed: [], removals: {} });
        }
        expect(spy).to.not.be.called;

        ss.onChanged.raiseEvent({ type: SelectionSetEventType.Clear, set: ss, removed: [], removals: {} });
        expect(spy).to.be.called;
      });

      it("does nothing if synchronization is not set up", () => {
        const spy = sinon.spy(selectionManager, "clearSelection");
        selectionManager.setSyncWithIVaultToolSelection(ivault, false);
        {
          using _ = selectionManager.suspendIVaultToolSelectionSync(ivault);
          ss.onChanged.raiseEvent({ type: SelectionSetEventType.Clear, set: ss, removed: [], removals: {} });
        }
        expect(spy).to.not.be.called;
      });

      it("doesn't suspend synchronization for other ivaults", () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;
        const ss2 = new SelectionSet(ivault2);
        Object.assign(ivault2, { selectionSet: ss2 });
        selectionManager.setSyncWithIVaultToolSelection(ivault2);

        const spy = sinon.spy(selectionManager, "clearSelection");
        {
          using _ = selectionManager.suspendIVaultToolSelectionSync(ivault2);
          ss.onChanged.raiseEvent({ type: SelectionSetEventType.Clear, set: ss, removed: [], removals: {} });
        }
        expect(spy).to.be.called;
      });
    });

    describe("getHiliteSet", () => {
      let factory: sinon.SinonStub<[{ ivault: IVaultConnection }], HiliteSetProvider>;

      beforeEach(() => {
        const provider = {
          getHiliteSet: async () => ({}),
        };
        factory = sinon.stub(HiliteSetProvider, "create").returns(provider as unknown as HiliteSetProvider);
      });

      afterEach(() => {
        factory.restore();
      });

      it("creates provider once for ivault", async () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;

        // call for the first with an ivault should create a provider
        await selectionManager.getHiliteSet(ivault);
        expect(factory).to.be.calledOnceWith({ ivault });
        factory.resetHistory();

        // second call with same ivault shouldn't create a new provider
        await selectionManager.getHiliteSet(ivault);
        expect(factory).to.not.be.called;

        // another ivault - new provider
        await selectionManager.getHiliteSet(ivault2);
        expect(factory).to.be.calledOnceWith({ ivault: ivault2 });
        factory.resetHistory();

        // make sure we still have provider for the first ivault
        await selectionManager.getHiliteSet(ivault);
        expect(factory).to.not.be.called;
      });
    });

    describe("getHiliteSetIterator", () => {
      let factory: sinon.SinonStub<[{ ivault: IVaultConnection }], HiliteSetProvider>;

      beforeEach(() => {
        const provider = {
          async *getHiliteSetIterator() {
            return;
          },
        };
        factory = sinon.stub(HiliteSetProvider, "create").returns(provider as unknown as HiliteSetProvider);
      });

      afterEach(() => {
        factory.restore();
      });

      it("creates provider once for ivault", () => {
        const ivault2 = { key: "ivault-key-2" } as IVaultConnection;

        // call for the first with an ivault should create a provider
        selectionManager.getHiliteSetIterator(ivault);
        expect(factory).to.be.calledOnceWith({ ivault });
        factory.resetHistory();

        // second call with same ivault shouldn't create a new provider
        selectionManager.getHiliteSetIterator(ivault);
        expect(factory).to.not.be.called;

        // another ivault - new provider
        selectionManager.getHiliteSetIterator(ivault2);
        expect(factory).to.be.calledOnceWith({ ivault: ivault2 });
        factory.resetHistory();

        // make sure we still have provider for the first ivault
        selectionManager.getHiliteSetIterator(ivault);
        expect(factory).to.not.be.called;
      });
    });
  });

  describe("with custom storage", () => {
    let storage: SelectionStorage;
    const presentationManager = {
      getContentInstanceKeys: sinon.stub<
        Parameters<PresentationManager["getContentInstanceKeys"]>,
        ReturnType<PresentationManager["getContentInstanceKeys"]>
      >(),
    };

    const changeListener = sinon.stub<Parameters<SelectionChangesListener>, ReturnType<SelectionChangesListener>>();

    beforeEach(() => {
      storage = createStorage();
      presentationManager.getContentInstanceKeys.reset();
      sinon.stub(Presentation, "presentation").get(() => presentationManager);

      selectionManager = new SelectionManager({ selectionStorage: storage, scopes: scopesManager as unknown as SelectionScopesManager });
      IVaultConnection.onOpen.raiseEvent(ivault);

      changeListener.reset();
      selectionManager.selectionChange.addListener(changeListener);
    });

    afterEach(() => {
      IVaultConnection.onClose.raiseEvent(ivault);
    });

    function createNodeKey({ id, ...props }: Partial<NodeKey> & { id: string }) {
      return createTestNodeKey({ ...props, pathFromRoot: [id] });
    }

    async function collectInstanceKeys(seletableId: string) {
      const selectables = storage.getSelection({ ivaultKey: ivault.key });
      const selectable = selectables.custom.get(seletableId);
      assert(selectable !== undefined);
      const loadedKeys = [];
      for await (const key of selectable.loadInstanceKeys()) {
        loadedKeys.push(key);
      }
      return loadedKeys;
    }

    describe("creates selectable from", () => {
      it("instances node key", async () => {
        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })];
        const instancesNodeKey = createNodeKey({ id: "test-node", instanceKeys, type: StandardNodeTypes.DMInstancesNode });
        selectionManager.addToSelection(source, ivault, [instancesNodeKey]);

        const selectionSet = await waitForSelection(1, ivault);
        expect(selectionSet.has(instancesNodeKey));

        const loadedKeys = await collectInstanceKeys("test-node");
        expect(loadedKeys[0].id).to.be.eq("0x1");
        expect(loadedKeys[1].id).to.be.eq("0x2");
      });

      it("grouping node key", async () => {
        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })];
        const groupingNodeKey = createNodeKey({
          id: "test-node",
          type: StandardNodeTypes.DMClassGroupingNode,
          className: "Schema:Class",
          groupedInstancesCount: 2,
          instanceKeysSelectQuery: {
            query: "key-query",
          },
        });
        selectionManager.addToSelection(source, ivault, [groupingNodeKey]);
        presentationManager.getContentInstanceKeys.resolves({
          total: 2,
          items: () => createAsyncGenerator(instanceKeys),
        });

        const selectionSet = await waitForSelection(1, ivault);
        expect(selectionSet.has(groupingNodeKey));

        const loadedKeys = await collectInstanceKeys("test-node");
        expect(loadedKeys[0].id).to.be.eq("0x1");
        expect(loadedKeys[1].id).to.be.eq("0x2");
      });
    });

    describe("creates selection set from", () => {
      it("instance key selectable", async () => {
        const instanceKey = createTestDMInstanceKey({ id: "0x1" });
        storage.addToSelection({ ivaultKey: ivault.key, source, selectables: [instanceKey], level: 0 });
        const selectionSet = await waitForSelection(1, ivault);
        expect(selectionSet.has(instanceKey)).to.be.true;
      });

      it("custom selectable", async () => {
        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })];
        storage.addToSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom", loadInstanceKeys: () => createAsyncGenerator(instanceKeys), data: {} }],
          level: 0,
        });

        const selectionSet = await waitForSelection(2, ivault);
        expect(selectionSet.has(instanceKeys[0])).to.be.true;
        expect(selectionSet.has(instanceKeys[1])).to.be.true;
      });

      it("custom selectable once", async () => {
        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })];
        const loadInstanceKeys = sinon.fake<Parameters<CustomSelectable["loadInstanceKeys"]>, ReturnType<CustomSelectable["loadInstanceKeys"]>>(() =>
          createAsyncGenerator(instanceKeys),
        );
        storage.addToSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom", loadInstanceKeys, data: {} }],
          level: 0,
        });

        const selectionSet = await waitForSelection(2, ivault);
        expect(selectionSet.has(instanceKeys[0])).to.be.true;
        expect(selectionSet.has(instanceKeys[1])).to.be.true;

        expect(changeListener).to.be.calledWith(
          sinon.match((args: SelectionChangeEventArgs) => {
            return args.keys.size === 2 && args.keys.hasAll([instanceKeys[0], instanceKeys[1]]);
          }),
        );
        expect(loadInstanceKeys).to.be.calledOnce;
      });
    });

    describe("handles multiple changes", () => {
      it("returns latest selection set", async () => {
        const firstDelay = new ResolvablePromise<void>();
        const secondDelay = new ResolvablePromise<void>();

        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" }), createTestDMInstanceKey({ id: "0x3" })];

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom1", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(0, 1), firstDelay), data: {} }],
          level: 0,
        });
        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom2", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(1), secondDelay), data: {} }],
          level: 0,
        });

        await waitForSelection(0, ivault);

        await secondDelay.resolve();
        await waitForSelection(2, ivault);

        await firstDelay.resolve();
        const selectionSet = await waitForSelection(2, ivault);
        expect(selectionSet.has(instanceKeys[0])).to.be.false;
        expect(selectionSet.has(instanceKeys[1])).to.be.true;
        expect(selectionSet.has(instanceKeys[2])).to.be.true;
      });

      it("returns intermediate selection set", async () => {
        const firstDelay = new ResolvablePromise<void>();
        const secondDelay = new ResolvablePromise<void>();

        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" }), createTestDMInstanceKey({ id: "0x3" })];

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom1", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(0, 1), firstDelay), data: {} }],
          level: 0,
        });
        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom2", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(1), secondDelay), data: {} }],
          level: 0,
        });

        await waitForSelection(0, ivault);

        await firstDelay.resolve();
        const intermediateSelectionSet = await waitForSelection(1, ivault);
        expect(intermediateSelectionSet.has(instanceKeys[0])).to.be.true;

        await secondDelay.resolve();
        const selectionSet = await waitForSelection(2, ivault);
        expect(selectionSet.has(instanceKeys[0])).to.be.false;
        expect(selectionSet.has(instanceKeys[1])).to.be.true;
        expect(selectionSet.has(instanceKeys[2])).to.be.true;
      });

      it("returns selection sets for different levels", async () => {
        const firstDelay = new ResolvablePromise<void>();
        const secondDelay = new ResolvablePromise<void>();

        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" }), createTestDMInstanceKey({ id: "0x3" })];

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom1", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(0, 1), firstDelay), data: {} }],
          level: 0,
        });
        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom2", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(1), secondDelay), data: {} }],
          level: 1,
        });

        await waitForSelection(0, ivault);

        await secondDelay.resolve();
        const selectionSet1 = await waitForSelection(2, ivault, 1);
        expect(selectionSet1.has(instanceKeys[1])).to.be.true;
        expect(selectionSet1.has(instanceKeys[2])).to.be.true;

        await firstDelay.resolve();
        const selectionSet0 = await waitForSelection(1, ivault);
        expect(selectionSet0.has(instanceKeys[0])).to.be.true;

        // make sure level 1 selection is not cleared
        const selectionSet = await waitForSelection(2, ivault, 1);
        expect(selectionSet.has(instanceKeys[1])).to.be.true;
        expect(selectionSet.has(instanceKeys[2])).to.be.true;
      });

      it("returns empty selection sets for lower levels", async () => {
        const firstDelay = new ResolvablePromise<void>();
        const secondDelay = new ResolvablePromise<void>();

        const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" }), createTestDMInstanceKey({ id: "0x3" })];

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom1", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(0, 1), firstDelay), data: {} }],
          level: 1,
        });

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ identifier: "custom2", loadInstanceKeys: () => createAsyncGenerator(instanceKeys.slice(1), secondDelay), data: {} }],
          level: 0,
        });

        await waitForSelection(0, ivault, 0);
        await waitForSelection(0, ivault, 1);

        await secondDelay.resolve();
        const selectionSet0 = await waitForSelection(2, ivault);
        expect(selectionSet0.has(instanceKeys[1])).to.be.true;
        expect(selectionSet0.has(instanceKeys[2])).to.be.true;

        await firstDelay.resolve();
        await waitForSelection(0, ivault, 1);
      });
    });

    describe("selection change event", () => {
      const instanceKeys = [createTestDMInstanceKey({ id: "0x1" }), createTestDMInstanceKey({ id: "0x2" })];
      const selectable1instanceKeys = [createTestDMInstanceKey({ id: "0x3" }), createTestDMInstanceKey({ id: "0x4" })];
      const selectable2instanceKeys = [createTestDMInstanceKey({ id: "0x5" }), createTestDMInstanceKey({ id: "0x6" })];

      it("ignores selection changes to unknown ivaults", async () => {
        storage.addToSelection({
          ivaultKey: "unknown-ivault",
          source,
          selectables: [{ className: "BisCore:Element", id: "0x1" }],
        });
        await waitFor(() => {
          expect(changeListener).not.to.be.called;
        });

        // just confirm that adding to a known ivault does raise the event
        storage.addToSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [{ className: "BisCore:Element", id: "0x2" }],
        });
        await waitFor(() => {
          expect(changeListener).to.be.calledOnce;
        });
      });

      it("handles blank connection events", async () => {
        const blank = BlankConnection.create({
          name: "blank",
          extents: { low: {}, high: {} },
          location: Cartographic.createZero(),
        });
        storage.addToSelection({
          ivaultKey: blank.name,
          source,
          selectables: instanceKeys,
        });
        await waitFor(() => {
          expect(changeListener).to.be.calledOnceWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.ivault === blank && args.keys.size === instanceKeys.length && args.keys.hasAll(instanceKeys);
            }),
          );
        });
      });

      it("converts add event selectables", async () => {
        const selectable1: CustomSelectable = { identifier: "custom-1", loadInstanceKeys: () => createAsyncGenerator(selectable1instanceKeys), data: {} };
        const selectable2: CustomSelectable = { identifier: "custom-2", loadInstanceKeys: () => createAsyncGenerator(selectable2instanceKeys), data: {} };

        storage.addToSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[0], selectable1],
        });

        await waitFor(() => {
          expect(changeListener).to.be.calledWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.keys.size === 3 && args.keys.hasAll([instanceKeys[0], ...selectable1instanceKeys]);
            }),
          );
        });

        // verify current selection size
        await waitForSelection(3, ivault);
        changeListener.resetHistory();

        storage.addToSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[1], selectable2],
        });

        await waitFor(() => {
          expect(changeListener).to.be.calledWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.keys.size === 3 && args.keys.hasAll([instanceKeys[1], ...selectable2instanceKeys]);
            }),
          );
        });

        // verify current selection size
        await waitForSelection(6, ivault);
      });

      it("converts replace event selectables", async () => {
        const selectable1: CustomSelectable = { identifier: "custom-1", loadInstanceKeys: () => createAsyncGenerator(selectable1instanceKeys), data: {} };
        const selectable2: CustomSelectable = { identifier: "custom-2", loadInstanceKeys: () => createAsyncGenerator(selectable2instanceKeys), data: {} };

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[0], selectable1],
        });

        await waitFor(() => {
          expect(changeListener).to.be.calledWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.keys.size === 3 && args.keys.hasAll([instanceKeys[0], ...selectable1instanceKeys]);
            }),
          );
        });

        // verify current selection size
        await waitForSelection(3, ivault);
        changeListener.resetHistory();

        storage.replaceSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[1], selectable2],
        });

        await waitFor(() => {
          expect(changeListener).to.be.calledWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.keys.size === 3 && args.keys.hasAll([instanceKeys[1], ...selectable2instanceKeys]);
            }),
          );
        });

        // verify current selection size
        await waitForSelection(3, ivault);
      });

      it("converts remove event selectables", async () => {
        const selectable1: CustomSelectable = { identifier: "custom-1", loadInstanceKeys: () => createAsyncGenerator(selectable1instanceKeys), data: {} };
        const selectable2: CustomSelectable = { identifier: "custom-2", loadInstanceKeys: () => createAsyncGenerator(selectable2instanceKeys), data: {} };

        storage.addToSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[0], instanceKeys[1], selectable1, selectable2],
        });

        // verify current selection size
        await waitForSelection(6, ivault);
        changeListener.resetHistory();

        storage.removeFromSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[0], selectable1],
        });

        await waitFor(() => {
          expect(changeListener).to.be.calledWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.keys.size === 3 && args.keys.hasAll([instanceKeys[0], ...selectable1instanceKeys]);
            }),
          );
        });

        // verify current selection size
        await waitForSelection(3, ivault);
        changeListener.resetHistory();

        storage.removeFromSelection({
          ivaultKey: ivault.key,
          source,
          selectables: [instanceKeys[1], selectable2],
        });

        await waitFor(() => {
          expect(changeListener).to.be.calledWith(
            sinon.match((args: SelectionChangeEventArgs) => {
              return args.keys.size === 3 && args.keys.hasAll([instanceKeys[1], ...selectable2instanceKeys]);
            }),
          );
        });

        // verify current selection size
        await waitForSelection(0, ivault);
      });
    });
  });
});

function createAsyncGenerator<T extends object>(values: T[], delay?: Promise<void>): AsyncGenerator<T> {
  return (async function* () {
    await delay;
    for (const value of values) {
      yield value;
    }
  })();
}

async function waitFor<T>(check: () => Promise<T> | T, timeout?: number): Promise<T> {
  if (timeout === undefined) {
    timeout = 5000;
  }
  const timer = new StopWatch(undefined, true);
  let lastError: unknown;
  do {
    try {
      const res = check();
      return res instanceof Promise ? await res : res;
    } catch (e) {
      lastError = e;
      await BeDuration.wait(0);
    }
  } while (timer.current.milliseconds < timeout);
  throw lastError;
}
