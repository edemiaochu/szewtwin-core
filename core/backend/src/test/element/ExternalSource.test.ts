/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { Id64String } from "@szewtwin/core-szewec";
import { EditTxn, withEditTxn } from "../../EditTxn";
import {
  Code, ExternalSourceAttachmentProps, ExternalSourceProps, IVault, RepositoryLinkProps, SynchronizationConfigLinkProps,
} from "@szewtwin/core-common";
import {
  ExternalSource, ExternalSourceAttachment, ExternalSourceAttachmentAttachesSource, ExternalSourceGroup, ExternalSourceGroupGroupsSources,
  ExternalSourceIsInRepository, ExternalSourceOwnsAttachments, FolderContainsRepositories, FolderLink, LinkElement, RepositoryLink,
  SnapshotDb, SynchronizationConfigLink, SynchronizationConfigProcessesSources, SynchronizationConfigSpecifiesRootSources,
} from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";

describe("ExternalSource", () => {

  it("should create elements and relationships like an iVault Connector would", () => {
    const iVaultFileName = IVaultTestUtils.prepareOutputFile("ExternalSource", "ExternalSource.dtw");
    const iVaultDb = SnapshotDb.createEmpty(iVaultFileName, { rootSubject: { name: "ExternalSource Test" } });

    assert.isTrue(iVaultDb.containsClass(SynchronizationConfigLink.classFullName));
    assert.isTrue(iVaultDb.containsClass(ExternalSource.classFullName));
    assert.isTrue(iVaultDb.containsClass(ExternalSourceIsInRepository.classFullName));
    assert.isTrue(iVaultDb.containsClass(ExternalSourceAttachment.classFullName));
    assert.isTrue(iVaultDb.containsClass(ExternalSourceGroup.classFullName));

    withEditTxn(iVaultDb, (txn) => {
      const syncJob = insertSynchronizationConfigLink(txn, "Synchronization Job");

      const folder = insertFolderLink(txn, "Folder", "https://test.szewec.com/folder");

      const repositoryM = insertRepositoryLink(txn, folder, "master.bld", "https://test.szewec.com/folder/master.bld", "BLD");
      const repositoryA = insertRepositoryLink(txn, folder, "a.bld", "https://test.szewec.com/folder/a.bld", "BLD");
      const repositoryB = insertRepositoryLink(txn, folder, "b.bld", "https://test.szewec.com/folder/b.bld", "BLD");
      const repositoryC = insertRepositoryLink(txn, folder, "c.bld", "https://test.szewec.com/folder/c.bld", "BLD");

      const modelM = insertExternalSource(txn, repositoryM, "M");
      const modelA = insertExternalSource(txn, repositoryA, "A");
      const modelB = insertExternalSource(txn, repositoryB, "B");
      const modelC = insertExternalSource(txn, repositoryC, "C");

      txn.insertRelationship({ classFullName: SynchronizationConfigSpecifiesRootSources.classFullName, sourceId: syncJob, targetId: modelM });
      txn.insertRelationship({ classFullName: SynchronizationConfigProcessesSources.classFullName, sourceId: syncJob, targetId: modelA });
      txn.insertRelationship({ classFullName: SynchronizationConfigProcessesSources.classFullName, sourceId: syncJob, targetId: modelB });
      txn.insertRelationship({ classFullName: SynchronizationConfigProcessesSources.classFullName, sourceId: syncJob, targetId: modelC });

      const group1 = insertExternalSourceGroup(txn, "Group1");
      txn.insertRelationship({ classFullName: ExternalSourceGroupGroupsSources.classFullName, sourceId: group1, targetId: modelA });
      txn.insertRelationship({ classFullName: ExternalSourceGroupGroupsSources.classFullName, sourceId: group1, targetId: modelB });
      txn.insertRelationship({ classFullName: ExternalSourceGroupGroupsSources.classFullName, sourceId: group1, targetId: modelC });

      insertExternalSourceAttachment(txn, modelM, modelA, "A");
      insertExternalSourceAttachment(txn, modelM, modelB, "B");
      insertExternalSourceAttachment(txn, modelA, modelC, "C");
      insertExternalSourceAttachment(txn, modelB, modelC, "C");
    });
    iVaultDb.close();
  });

  function insertSynchronizationConfigLink(txn: EditTxn, name: string): Id64String {
    const configProps: SynchronizationConfigLinkProps = {
      classFullName: SynchronizationConfigLink.classFullName,
      model: IVault.repositoryModelId,
      code: LinkElement.createCode(txn.iVault, IVault.repositoryModelId, name),
    };
    return txn.insertElement(configProps);
  }

  function insertFolderLink(txn: EditTxn, codeValue: string, url: string): Id64String {
    const folderLinkProps: RepositoryLinkProps = {
      classFullName: FolderLink.classFullName,
      model: IVault.repositoryModelId,
      code: LinkElement.createCode(txn.iVault, IVault.repositoryModelId, codeValue),
      url,
    };
    return txn.insertElement(folderLinkProps);
  }

  function insertRepositoryLink(txn: EditTxn, folderId: Id64String, codeValue: string, url: string, format: string): Id64String {
    const repositoryLinkProps: RepositoryLinkProps = {
      classFullName: RepositoryLink.classFullName,
      model: IVault.repositoryModelId,
      parent: new FolderContainsRepositories(folderId),
      code: LinkElement.createCode(txn.iVault, IVault.repositoryModelId, codeValue),
      url,
      format,
    };
    return txn.insertElement(repositoryLinkProps);
  }

  function insertExternalSource(txn: EditTxn, repository: Id64String, userLabel: string): Id64String {
    const externalSourceProps: ExternalSourceProps = {
      classFullName: ExternalSource.classFullName,
      model: IVault.repositoryModelId,
      code: Code.createEmpty(),
      userLabel,
      repository: new ExternalSourceIsInRepository(repository),
      connectorName: "Connector",
      connectorVersion: "0.0.1",
    };
    return txn.insertElement(externalSourceProps);
  }

  function insertExternalSourceAttachment(txn: EditTxn, masterModel: Id64String, attachedModel: Id64String, label: string): Id64String {
    const attachmentProps: ExternalSourceAttachmentProps = {
      classFullName: ExternalSource.classFullName,
      model: IVault.repositoryModelId,
      parent: new ExternalSourceOwnsAttachments(masterModel),
      code: Code.createEmpty(),
      userLabel: label,
      attaches: new ExternalSourceAttachmentAttachesSource(attachedModel),
    };
    return txn.insertElement(attachmentProps);
  }

  function insertExternalSourceGroup(txn: EditTxn, userLabel: string): Id64String {
    const groupProps: ExternalSourceProps = {
      classFullName: ExternalSourceGroup.classFullName,
      model: IVault.repositoryModelId,
      code: Code.createEmpty(),
      userLabel,
      repository: undefined,
      connectorName: "Connector",
      connectorVersion: "0.0.1",
    };
    return txn.insertElement(groupProps);
  }
});
