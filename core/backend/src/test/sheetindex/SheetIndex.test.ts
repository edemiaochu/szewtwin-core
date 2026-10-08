/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64, Id64String } from "@szewtwin/core-szewec";
import { BisCodeSpec, CodeScopeSpec, CodeSpec, EditTxnError, SheetProps } from "@szewtwin/core-common";
import { EditTxn, withEditTxn } from "../../EditTxn";

import { SnapshotDb } from "../../IVaultDb";
import { ExtensiveTestScenario, IVaultTestUtils } from "../IVaultTestUtils";
import { DocumentPartition, Sheet } from "../../Element";
import { expect } from "chai";
import { DocumentListModel, SheetIndexModel, SheetModel } from "../../Model";
import { ElementOwnsChildElements, SheetIndexFolderOwnsEntries, SheetIndexOwnsEntries, SheetIndexReferenceRefersToSheetIndex, SheetReferenceRefersToSheet } from "../../NavigationRelationship";
import { SheetIndex, SheetIndexFolder, SheetIndexReference, SheetReference } from "../../SheetIndex";

const getOrCreateDocumentList = (txn: EditTxn): Id64String => {
  const documentListName = "SheetList";
  const ids = txn.iVault.queryEntityIds({ from: DocumentPartition.classFullName, where: `CodeValue = '${documentListName}'` });
  if (ids.size === 1)
    return ids.values().next().value!;

  const subjectId = txn.iVault.elements.getRootSubject().id;
  return DocumentListModel.insert(txn, subjectId, documentListName);
};

const insertSheet = (txn: EditTxn, sheetName: string): Id64String => {
  const modelId = getOrCreateDocumentList(txn);
  const sheetElementProps: SheetProps = {
    height: 42,
    width: 42,
    scale: 42,
    classFullName: Sheet.classFullName,
    code: Sheet.createCode(txn.iVault, modelId, sheetName),
    model: modelId,
  };
  const sheetElementId = txn.insertElement(sheetElementProps);
  return txn.insertModel({
    classFullName: SheetModel.classFullName,
    modeledElement: { id: sheetElementId, relClassName: "BisCore:ModelModelsElement" },
  });
};

const insertCodeSpec = (txn: EditTxn) => {
  const indexSpec = CodeSpec.create(txn.iVault, BisCodeSpec.sheetIndex, CodeScopeSpec.Type.Model);
  txn.iVault.codeSpecs.insert(txn, indexSpec);

  const entrySpec = CodeSpec.create(txn.iVault, BisCodeSpec.sheetIndexEntry, CodeScopeSpec.Type.ParentElement);
  txn.iVault.codeSpecs.insert(txn, entrySpec);
};

describe("SheetIndex", () => {
  let iVault: SnapshotDb;

  beforeEach(async () => {
    const iVaultFile: string = IVaultTestUtils.prepareOutputFile("IVault", "TestSheetIndex.dtw");

    const iVaultDb = SnapshotDb.createEmpty(iVaultFile, { rootSubject: { name: "SheetIndex" } });
    await ExtensiveTestScenario.prepareDb(iVaultDb);
    await ExtensiveTestScenario.populateDb(iVaultDb);
    iVault = iVaultDb;

    withEditTxn(iVault, (txn) => insertCodeSpec(txn));
  });

  afterEach(() => {
    iVault.close();
  });

  it("SheetIndexModel Should insert", () => {
    withEditTxn(iVault, (txn) => {
      const subjectId = iVault.elements.getRootSubject().id;
      const modelId = SheetIndexModel.insert(txn, subjectId, "testSheetIndex");
      expect(Id64.isValidId64(modelId)).to.be.true;
    });
  });

  it("SheetIndex Should insert", () => {
    withEditTxn(iVault, (txn) => {
      const subjectId = iVault.elements.getRootSubject().id;
      const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
      expect(Id64.isValidId64(modelId)).to.be.true;

      const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");
      expect(Id64.isValidId64(sheetIndex)).to.be.true;
    });
  });

  describe("Update", () => {
    it("Priority", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;

        const sheetIndex1Id = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex1Id)).to.be.true;

        const folderId = SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex1Id, name: "TestFolder", priority: 1 });
        expect(Id64.isValidId64(folderId)).to.be.true;

        const folder = iVault.elements.tryGetElement<SheetIndexFolder>(folderId);
        expect(folder).to.not.be.undefined;
        expect(folder?.entryPriority).equals(1);

        folder!.entryPriority = 0;
        folder!.update(txn);

        const folderPostUpdate = iVault.elements.tryGetElement<SheetIndexFolder>(folderId);
        expect(folderPostUpdate?.entryPriority).equals(0);
      });
    });

    it("Parent", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;

        const sheetIndex1Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-1");
        expect(Id64.isValidId64(sheetIndex1Id)).to.be.true;

        const sheetIndex2Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-2");
        expect(Id64.isValidId64(sheetIndex2Id)).to.be.true;

        const folderId = SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex1Id, name: "TestFolder", priority: 1 });
        expect(Id64.isValidId64(folderId)).to.be.true;

        const folder = iVault.elements.tryGetElement<SheetIndexFolder>(folderId);
        expect(folder).to.not.be.undefined;

        const parentRel11 = iVault.relationships.tryGetInstanceProps(ElementOwnsChildElements.classFullName, { sourceId: sheetIndex1Id, targetId: folderId });
        expect(parentRel11).to.not.be.undefined;

        folder!.parent = new SheetIndexOwnsEntries(sheetIndex2Id);
        folder!.update(txn);

        const parentRel12 = iVault.relationships.tryGetInstanceProps(ElementOwnsChildElements.classFullName, { sourceId: sheetIndex1Id, targetId: folderId });
        expect(parentRel12).to.be.undefined;

        const parentRel22 = iVault.relationships.tryGetInstanceProps(ElementOwnsChildElements.classFullName, { sourceId: sheetIndex2Id, targetId: folderId });
        expect(parentRel22).to.not.be.undefined;
      });
    });

    it("Sheet Reference", () => {
      withEditTxn(iVault, (txn) => {
        const sheet1Id = insertSheet(txn, "sheet-1");
        const sheet2Id = insertSheet(txn, "sheet-2");
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;

        const sheetIndexId = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndexId)).to.be.true;

        const sheetRefId = SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndexId, name: "TestSheetReference", priority: 1 });
        expect(Id64.isValidId64(sheetRefId)).to.be.true;

        const sheetRef = iVault.elements.tryGetElement<SheetReference>(sheetRefId);
        expect(sheetRef).to.not.be.undefined;
        expect(sheetRef!.sheet).to.be.undefined;

        sheetRef!.sheet = new SheetReferenceRefersToSheet(sheet1Id);
        sheetRef!.update(txn);

        const refersRel11 = iVault.relationships.tryGetInstanceProps(SheetReferenceRefersToSheet.classFullName, { sourceId: sheetRefId, targetId: sheet1Id });
        expect(refersRel11).to.not.be.undefined;

        const parentRel12 = iVault.relationships.tryGetInstanceProps(SheetReferenceRefersToSheet.classFullName, { sourceId: sheetRefId, targetId: sheet2Id });
        expect(parentRel12).to.be.undefined;

        sheetRef!.sheet = new SheetReferenceRefersToSheet(sheet2Id);
        sheetRef!.update(txn);

        const refersRel21 = iVault.relationships.tryGetInstanceProps(SheetReferenceRefersToSheet.classFullName, { sourceId: sheetRefId, targetId: sheet1Id });
        expect(refersRel21).to.be.undefined;

        const parentRel22 = iVault.relationships.tryGetInstanceProps(SheetReferenceRefersToSheet.classFullName, { sourceId: sheetRefId, targetId: sheet2Id });
        expect(parentRel22).to.not.be.undefined;
      });
    });

    it("Sheet Index Reference", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;

        const sheetIndex1Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-1");
        expect(Id64.isValidId64(sheetIndex1Id)).to.be.true;

        const sheetIndex2Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-2");
        expect(Id64.isValidId64(sheetIndex2Id)).to.be.true;
        const sheetIndex3Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-3");
        expect(Id64.isValidId64(sheetIndex3Id)).to.be.true;

        const sheetIndexRefId = SheetIndexReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex1Id, name: "TestSheetReference", priority: 1 });
        expect(Id64.isValidId64(sheetIndexRefId)).to.be.true;

        const sheetIndexRef = iVault.elements.tryGetElement<SheetIndexReference>(sheetIndexRefId);
        expect(sheetIndexRef).to.not.be.undefined;
        expect(sheetIndexRef!.sheetIndex).to.be.undefined;

        sheetIndexRef!.sheetIndex = new SheetIndexReferenceRefersToSheetIndex(sheetIndex2Id);
        sheetIndexRef!.update(txn);

        const parentRel11 = iVault.relationships.tryGetInstanceProps(SheetIndexReferenceRefersToSheetIndex.classFullName, { sourceId: sheetIndexRefId, targetId: sheetIndex2Id });
        expect(parentRel11).to.not.be.undefined;

        sheetIndexRef!.sheetIndex = new SheetIndexReferenceRefersToSheetIndex(sheetIndex3Id);
        sheetIndexRef!.update(txn);

        const refersRel21 = iVault.relationships.tryGetInstanceProps(SheetIndexReferenceRefersToSheetIndex.classFullName, { sourceId: sheetIndexRefId, targetId: sheetIndex2Id });
        expect(refersRel21).to.be.undefined;

        const parentRel22 = iVault.relationships.tryGetInstanceProps(SheetIndexReferenceRefersToSheetIndex.classFullName, { sourceId: sheetIndexRefId, targetId: sheetIndex3Id });
        expect(parentRel22).to.not.be.undefined;
      });
    });
  });

  describe("SheetIndexFolder", () => {
    it("Should insert", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndexId = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndexId)).to.be.true;

        const folderId = SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndexId, name: "TestFolder-1", priority: 1 });
        expect(Id64.isValidId64(folderId)).to.be.true;

        const folder = iVault.elements.tryGetElement<SheetIndexFolder>(folderId);
        expect(folder).to.not.be.undefined;

        const relationship = iVault.relationships.tryGetInstanceProps(ElementOwnsChildElements.classFullName, { sourceId: sheetIndexId, targetId: folderId });
        expect(relationship).to.not.be.undefined;
        expect(relationship?.classFullName).equals(SheetIndexOwnsEntries.classFullName);

        expect(folder?.parent?.id).equals(sheetIndexId);
      });
    });

    it("Should not insert SheetIndexFolder with the same name", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex)).to.be.true;

        const folder = SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestFolder", priority: 1 });
        expect(Id64.isValidId64(folder)).to.be.true;

        const failInsert = () => SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestFolder", priority: 0 });

        expect(failInsert).throws();
      });
    });

    it("Should have children", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndexId = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndexId)).to.be.true;

        const folder1Id = SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndexId, name: "TestFolder-1", priority: 1 });
        expect(Id64.isValidId64(folder1Id)).to.be.true;

        const folder2Id = SheetIndexFolder.insert(txn, { sheetIndexModelId: modelId, parentId: folder1Id, name: "TestFolder-2", priority: 1 });
        expect(Id64.isValidId64(folder2Id)).to.be.true;
        const folder2 = iVault.elements.tryGetElement<SheetIndexFolder>(folder2Id);
        expect(folder2).to.not.be.undefined;

        const relationship = iVault.relationships.tryGetInstanceProps(ElementOwnsChildElements.classFullName, { sourceId: folder1Id, targetId: folder2Id });
        expect(relationship).to.not.be.undefined;
        expect(relationship?.classFullName).equals(SheetIndexFolderOwnsEntries.classFullName);

        expect(folder2?.parent?.id).equals(folder1Id);
      });
    });
  });

  describe("SheetReferences", () => {
    it("Should not insert SheetReferences with the same name", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex)).to.be.true;

        const sheetRef1 = SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetRef", priority: 1 });
        expect(Id64.isValidId64(sheetRef1)).to.be.true;

        const failInsert = () => SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetRef", priority: 0 });

        expect(failInsert).throws();
      });
    });

    it("Should insert SheetReferences without a Sheet", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex)).to.be.true;

        const sheetRef = SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetRef", priority: 1 });
        expect(Id64.isValidId64(sheetRef)).to.be.true;
      });
    });

    it("Should insert and with a Sheet", () => {
      withEditTxn(iVault, (txn) => {
        const sheetId = insertSheet(txn, "sheet-1");
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex)).to.be.true;

        const sheetRefId = SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetRef", priority: 1, sheetId });
        expect(Id64.isValidId64(sheetRefId)).to.be.true;

        const ref = iVault.elements.tryGetElement<SheetReference>(sheetRefId);
        expect(ref).to.not.be.undefined;

        const relationship = iVault.relationships.tryGetInstanceProps(SheetReferenceRefersToSheet.classFullName, { sourceId: sheetRefId, targetId: sheetId });
        expect(relationship).to.not.be.undefined;
        expect(relationship?.classFullName).equals(SheetReferenceRefersToSheet.classFullName);

        expect(ref?.sheet?.id).equals(sheetId);
      });
    });

    it("supports deprecated SheetReference.insert overload when implicit writes are allowed", () => {
      const previousEnforcement = EditTxn.implicitWriteEnforcement;
      EditTxn.implicitWriteEnforcement = "allow";

      try {
        withEditTxn(iVault, (txn) => {
          const sheetId = insertSheet(txn, "legacy-sheet");
          const subjectId = iVault.elements.getRootSubject().id;
          const modelId = SheetIndexModel.insert(txn, subjectId, "LegacySheetRefModel");
          const sheetIndex = SheetIndex.insert(txn, modelId, "LegacySheetIndex");

          // eslint-disable-next-line @typescript-eslint/no-deprecated
          const sheetRefId = SheetReference.insert({
            iVaultDb: iVault,
            sheetIndexModelId: modelId,
            parentId: sheetIndex,
            name: "LegacySheetRef",
            priority: 1,
            sheetId,
          });

          expect(Id64.isValidId64(sheetRefId)).to.be.true;
          const ref = iVault.elements.tryGetElement<SheetReference>(sheetRefId);
          expect(ref?.sheet?.id).to.equal(sheetId);
        });
      } finally {
        EditTxn.implicitWriteEnforcement = previousEnforcement;
      }
    });

    it("rejects deprecated SheetReference.insert overload when implicit writes are disallowed", () => {
      const previousEnforcement = EditTxn.implicitWriteEnforcement;
      EditTxn.implicitWriteEnforcement = "throw";

      try {
        withEditTxn(iVault, (txn) => {
          const sheetId = insertSheet(txn, "legacy-throw-sheet");
          const subjectId = iVault.elements.getRootSubject().id;
          const modelId = SheetIndexModel.insert(txn, subjectId, "LegacyThrowSheetRefModel");
          const sheetIndex = SheetIndex.insert(txn, modelId, "LegacyThrowSheetIndex");

          // eslint-disable-next-line @typescript-eslint/no-deprecated
          expect(() => SheetReference.insert({
            iVaultDb: iVault,
            sheetIndexModelId: modelId,
            parentId: sheetIndex,
            name: "LegacyThrowSheetRef",
            priority: 1,
            sheetId,
          })).to.throw().that.satisfies((error: unknown) => EditTxnError.isError(error, "implicit-txn-write-disallowed"));
        });
      } finally {
        EditTxn.implicitWriteEnforcement = previousEnforcement;
      }
    });

    it.skip("Should not insert with the same Sheet twice", () => {
      withEditTxn(iVault, (txn) => {
        const sheetId = insertSheet(txn, "sheet-1");
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");

        SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetRef-1", priority: 1, sheetId });

        const sameIndex = () => SheetReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetRef-2", priority: 2, sheetId });

        expect(sameIndex).throws();
      });
    });
  });

  describe("SheetIndexReferences", () => {
    it("Should not insert SheetIndexReferences with the same name", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex)).to.be.true;

        const sheetIndexRef = SheetIndexReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetIndexRef", priority: 1 });
        expect(Id64.isValidId64(sheetIndexRef)).to.be.true;

        const failInsert = () => SheetIndexReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex, name: "TestSheetIndexRef", priority: 0 });

        expect(failInsert).throws();
      });
    });

    it("Should insert SheetIndexReferences without a SheetIndexRef", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex1Id = SheetIndex.insert(txn, modelId, "TestSheetIndex");
        expect(Id64.isValidId64(sheetIndex1Id)).to.be.true;

        const sheetRef = SheetIndexReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex1Id, name: "TestSheetIndexRef", priority: 1 });
        expect(Id64.isValidId64(sheetRef)).to.be.true;
      });
    });

    it("Should insert and with a SheetIndexRef", () => {
      withEditTxn(iVault, (txn) => {
        const subjectId = iVault.elements.getRootSubject().id;
        const modelId = SheetIndexModel.insert(txn, subjectId, "TestSheetIndexModel");
        expect(Id64.isValidId64(modelId)).to.be.true;
        const sheetIndex1Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-1");
        expect(Id64.isValidId64(sheetIndex1Id)).to.be.true;
        const sheetIndex2Id = SheetIndex.insert(txn, modelId, "TestSheetIndex-2");
        expect(Id64.isValidId64(sheetIndex1Id)).to.be.true;

        const sheetIndexRefId = SheetIndexReference.insert(txn, { sheetIndexModelId: modelId, parentId: sheetIndex1Id, name: "TestSheetRef", priority: 1, sheetIndexId: sheetIndex2Id });
        expect(Id64.isValidId64(sheetIndexRefId)).to.be.true;

        const ref = iVault.elements.tryGetElement<SheetIndexReference>(sheetIndexRefId);
        expect(ref).to.not.be.undefined;

        const relationship = iVault.relationships.tryGetInstanceProps(SheetIndexReferenceRefersToSheetIndex.classFullName, { sourceId: sheetIndexRefId, targetId: sheetIndex2Id });
        expect(relationship).to.not.be.undefined;
        expect(relationship?.classFullName).equals(SheetIndexReferenceRefersToSheetIndex.classFullName);

        expect(ref?.sheetIndex?.id).equals(sheetIndex2Id);
      });
    });
  });
});




