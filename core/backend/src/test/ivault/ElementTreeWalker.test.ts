/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64, Id64Array, Id64String } from "@szewtwin/core-szewec";
import { Code, GeometricElement2dProps, GeometricElementProps, IVault, SubCategoryAppearance } from "@szewtwin/core-common";
import { Point2d } from "@szewtwin/core-geometry";
import { assert } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { DefinitionContainer, DefinitionModel, DocumentListModel, Drawing, DrawingCategory, DrawingGraphic, ElementGroupsMembers, ElementOwnsChildElements, ExternalSource, ExternalSourceGroup, IVaultDb, Model, PhysicalPartition, SnapshotDb, SpatialCategory, SubCategory, Subject } from "../../core-backend";
import { deleteElementSubTrees, deleteElementTree, ElementTreeBottomUp, ElementTreeWalkerScope } from "../../ElementTreeWalker";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { withEditTxn } from "../../EditTxn";

// Test class that collects the results of a bottom-up tree walk
class ElementTreeCollector extends ElementTreeBottomUp {
  public subModels: Id64Array = [];
  public definitionModels: Id64Array = [];
  public elements: Id64Array = [];
  public definitions: Id64Array = [];

  public constructor(iVault: IVaultDb) { super(iVault); }

  public visitModel(model: Model, _scope: ElementTreeWalkerScope): void {
    if (model instanceof DefinitionModel)
      this.definitionModels.push(model.id);
    else
      this.subModels.push(model.id);
  }

  public visitElement(elementId: Id64String, scope: ElementTreeWalkerScope): void {
    if (scope.inDefinitionModel)
      this.definitions.push(elementId); // may be some other kind of InformationContentElement - that's OK.
    else
      this.elements.push(elementId);
  }

  public collect(topElement: Id64String): void {
    this.processElementTree(topElement, ElementTreeWalkerScope.createTopScope(this.txn.iVault, topElement));
  }
}

class SelectedElementCollector extends ElementTreeCollector {
  public constructor(iVault: IVaultDb, private _elementsToReport: Id64Array) { super(iVault); }
  public override shouldExploreModel(_model: Model): boolean { return true; }
  public override shouldVisitModel(_model: Model): boolean { return false; }
  public override shouldVisitElement(elementId: Id64String): boolean { return this._elementsToReport.includes(elementId); }
}

function doesElementExist(iVault: IVaultDb, elementId: Id64String): boolean {
  return iVault.elements.tryGetElementProps(elementId) !== undefined;
}

function doesModelExist(iVault: IVaultDb, mid: Id64String): boolean {
  return iVault.models.tryGetModelProps(mid) !== undefined;
}

function doesGroupRelationshipExist(iVault: IVaultDb, source: Id64String, target: Id64String): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return iVault.withPreparedStatement(`select count(*) from ${ElementGroupsMembers.classFullName} where sourcedminstanceid=? and targetdminstanceid=?`, (stmt) => {
    stmt.bindId(1, source);
    stmt.bindId(2, target);
    stmt.step();
    return stmt.getValue(0).getInteger() !== 0;
  });
}

describe("ElementTreeWalker", () => {
  let iVault: SnapshotDb;
  let originalEnv: any;

  let repositoryLinkId: Id64String;
  let jobSubjectId: Id64String;
  let childSubject: Id64String;
  let definitionModelId: Id64String;
  let definitionContainerId: Id64String;
  let drawingDefinitionModelId: Id64String;
  let spatialCategoryId: Id64String;
  let nestedSpatialCategoryId: Id64String;
  let drawingCategoryId: Id64String;
  let drawingSubCategory1Id: Id64String;
  let drawingSubCategory2Id: Id64String;
  let xsGroup: Id64String;
  let xsElement: Id64String;
  let documentListModelId: Id64String;
  let drawingModelId: Id64String;
  let drawingGraphicId1: Id64String;
  let physicalModelId: Id64String;
  let physicalObjectId1: Id64String;
  let physicalObjectId2: Id64String;
  let physicalObjectId3: Id64String;

  before(async () => {
    originalEnv = { ...process.env };

    IVaultTestUtils.registerTestBimSchema();
  });

  after(() => {
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Uncomment the following two lines to debug test failures
    // Logger.initializeToConsole();
    // Logger.setLevel("core-backend.IVaultDb.ElementTreeWalker", LogLevel.Trace);

    const iVaultFileName = IVaultTestUtils.prepareOutputFile("ElementTreeWalker", "Test.dtw");
    iVault = SnapshotDb.createEmpty(iVaultFileName, { rootSubject: { name: "ElementTreeWalker Test" } });
    const schemaPathname = path.join(KnownTestLocations.assetsDir, "TestBim.dmschema.xml");
    await iVault.importSchemas([schemaPathname]); // will throw an exception if import fails

    /*
      [RepositoryModel]
        RepositoryLink
        Job Subject
          +- DefinitionParitition  --   [DefinitionModel]
          |                               DrawingCategory
          |                                 default SubCategory + 2 non-default SubCategories
          |                               ExternalSourceGroup
          |                                 ExternalSource child1
          +- DefinitionParitition  --   [DefinitionModel]
          |                               SpatialCategory
          |                               DefinitionContainer
          |                                   SpatialCategory
          |
          +- DocumentList         --    [DocumentListModel]
          |                               Drawing             -- [DrawingModel]
          |                                                       DrawingGraphic
          +- Child Subject
              |
              +- PhysicalPartition --   [PhysicalModel]
                                          PhysicalObject, PhysicalObject, PhysicalObject (grouped)
    */

    withEditTxn(iVault, (txn) => {
      repositoryLinkId = IVaultTestUtils.insertRepositoryLink(txn, "test link", "foo", "bar");
      jobSubjectId = IVaultTestUtils.createJobSubjectElement(iVault, "Job").insert(txn);

      childSubject = Subject.insert(txn, jobSubjectId, "Child Subject");

      definitionModelId = DefinitionModel.insert(txn, jobSubjectId, "Definition");
      spatialCategoryId = SpatialCategory.insert(txn, definitionModelId, "SpatialCategory", new SubCategoryAppearance());
      drawingDefinitionModelId = DefinitionModel.insert(txn, jobSubjectId, "DrawingDefinition");
      drawingCategoryId = DrawingCategory.insert(txn, drawingDefinitionModelId, "DrawingCategory", new SubCategoryAppearance());
      drawingSubCategory1Id = SubCategory.insert(txn, drawingCategoryId, "SubCategory1", new SubCategoryAppearance());
      drawingSubCategory2Id = SubCategory.insert(txn, drawingCategoryId, "SubCategory2", new SubCategoryAppearance());

      definitionContainerId = DefinitionContainer.insert(txn, definitionModelId, Code.createEmpty());
      nestedSpatialCategoryId = SpatialCategory.insert(txn, definitionContainerId, "nested", {});

      xsGroup = txn.insertElement({ classFullName: ExternalSourceGroup.classFullName, model: drawingDefinitionModelId, code: Code.createEmpty() });
      xsElement = txn.insertElement({ classFullName: ExternalSource.classFullName, model: drawingDefinitionModelId, parent: new ElementOwnsChildElements(xsGroup), code: Code.createEmpty() });

      documentListModelId = DocumentListModel.insert(txn, jobSubjectId, "Document");
      assert.isTrue(Id64.isValidId64(documentListModelId));
      drawingModelId = Drawing.insert(txn, documentListModelId, "Drawing");
      const drawingGraphicProps1: GeometricElement2dProps = {
        classFullName: DrawingGraphic.classFullName,
        model: drawingModelId,
        category: drawingCategoryId,
        code: Code.createEmpty(),
        userLabel: "DrawingGraphic1",
        geom: IVaultTestUtils.createRectangle(Point2d.create(1, 1)),
        placement: { origin: Point2d.create(2, 2), angle: 0 },
      };
      drawingGraphicId1 = txn.insertElement(drawingGraphicProps1);

      [, physicalModelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, PhysicalPartition.createCode(iVault, childSubject, "Physical"), false, childSubject);
      const elementProps: GeometricElementProps = {
        classFullName: "TestBim:TestPhysicalObject",
        model: physicalModelId,
        category: spatialCategoryId,
        code: Code.createEmpty(),
      };
      const elementProps2: GeometricElementProps = {
        classFullName: "TestBim:TestPhysicalObject",
        model: physicalModelId,
        category: nestedSpatialCategoryId,
        code: Code.createEmpty(),
      };
      physicalObjectId1 = txn.insertElement(iVault.elements.createElement(elementProps).toJSON());
      physicalObjectId2 = txn.insertElement(iVault.elements.createElement(elementProps2).toJSON());
      physicalObjectId3 = txn.insertElement(iVault.elements.createElement(elementProps).toJSON());
      txn.insertRelationship(ElementGroupsMembers.create(iVault, physicalObjectId1, physicalObjectId2).toJSON());
      txn.insertRelationship(ElementGroupsMembers.create(iVault, physicalObjectId1, physicalObjectId3).toJSON());
    });

    assert.isTrue(doesElementExist(iVault, repositoryLinkId));
    assert.equal(iVault.elements.getElement(jobSubjectId).parent?.id, IVault.rootSubjectId);
    assert.equal(iVault.elements.getElement(definitionModelId).parent?.id, jobSubjectId);
    assert.equal(iVault.elements.getElement(definitionContainerId).model, definitionModelId);
    assert.equal(iVault.elements.getElement(spatialCategoryId).model, definitionModelId);
    assert.equal(iVault.elements.getElement(nestedSpatialCategoryId).model, definitionContainerId);
    assert.equal(iVault.elements.getElement(drawingDefinitionModelId).parent?.id, jobSubjectId);
    assert.equal(iVault.elements.getElement(drawingCategoryId).model, drawingDefinitionModelId);
    assert.equal(iVault.elements.getElement(drawingSubCategory1Id).parent?.id, drawingCategoryId);
    assert.equal(iVault.elements.getElement(drawingSubCategory2Id).parent?.id, drawingCategoryId);
    assert.equal(iVault.elements.getElement(xsGroup).model, drawingDefinitionModelId);
    assert.equal(iVault.elements.getElement(xsElement).parent?.id, xsGroup);
    assert.equal(iVault.elements.getElement(documentListModelId).parent?.id, jobSubjectId);
    assert.equal(iVault.elements.getElement(drawingModelId).model, documentListModelId);
    assert.equal(iVault.elements.getElement(drawingGraphicId1).model, drawingModelId);
    assert.equal(iVault.elements.getElement(physicalModelId).parent?.id, childSubject);
    assert.equal(iVault.elements.getElement(physicalObjectId1).model, physicalModelId);
    assert.equal(iVault.elements.getElement(physicalObjectId2).model, physicalModelId);
    assert.equal(iVault.elements.getElement(physicalObjectId3).model, physicalModelId);
    assert.isTrue(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId2));
    assert.isTrue(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId3));
    assert.isTrue(doesModelExist(iVault, definitionModelId));
    assert.isTrue(doesModelExist(iVault, definitionContainerId));
    assert.isTrue(doesModelExist(iVault, drawingDefinitionModelId));
    assert.isTrue(doesModelExist(iVault, drawingModelId));
    assert.isTrue(doesModelExist(iVault, physicalModelId));
  });

  afterEach(() => {
    sinon.restore();
    iVault.close();
  });

  it("DFS search and deleteElementTree", () => {
    // First, check that DFS search visits elements and models in expected bottom-up order
    {
      const collector1 = new ElementTreeCollector(iVault);
      collector1.collect(jobSubjectId);
      assert.isTrue(collector1.subModels.includes(physicalModelId));
      assert.isTrue(collector1.subModels.includes(drawingModelId));
      assert.isTrue(collector1.subModels.includes(documentListModelId));
      assert.isTrue(collector1.subModels.indexOf(drawingModelId) < collector1.subModels.indexOf(documentListModelId), "in bottom-up search, a child model should be visited before its parent model");
      assert.isFalse(collector1.subModels.includes(definitionModelId));
      assert.isTrue(collector1.definitionModels.includes(definitionModelId));
      assert.isFalse(collector1.subModels.includes(definitionContainerId));
      assert.isTrue(collector1.definitionModels.includes(definitionContainerId));
      assert.isFalse(collector1.subModels.includes(drawingDefinitionModelId));
      assert.isTrue(collector1.definitionModels.includes(drawingDefinitionModelId));
      assert.isTrue(collector1.definitions.includes(drawingCategoryId));
      assert.isTrue(collector1.definitions.includes(spatialCategoryId));
      assert.isTrue(collector1.definitions.includes(nestedSpatialCategoryId));
      assert.isFalse(collector1.elements.includes(drawingCategoryId));
      assert.isFalse(collector1.elements.includes(spatialCategoryId));
      assert.isFalse(collector1.elements.includes(nestedSpatialCategoryId));
      assert.isTrue(collector1.elements.indexOf(physicalObjectId1) < collector1.elements.indexOf(physicalModelId), "in bottom-up search, an element in a model should be visited before its model's element");
      assert.isTrue(collector1.elements.indexOf(drawingGraphicId1) < collector1.elements.indexOf(drawingModelId), "in bottom-up search, an element in a model should be visited before its model's element");
      assert.isTrue(collector1.elements.indexOf(drawingModelId) < collector1.elements.indexOf(documentListModelId), "in bottom-up search, an element in a model should be visited before its model's element");
      assert.isTrue(collector1.elements.indexOf(documentListModelId) < collector1.elements.indexOf(jobSubjectId), "in bottom-up search, a child element should be visited before its parent element");
      assert.isTrue(collector1.elements.indexOf(definitionModelId) < collector1.elements.indexOf(jobSubjectId), "in bottom-up search, a child element should be visited before its parent element");
      assert.isTrue(collector1.elements.indexOf(definitionContainerId) < collector1.elements.indexOf(definitionModelId), "in bottom-up search, a child element should be visited before its parent element");
      assert.isTrue(collector1.elements.indexOf(drawingDefinitionModelId) < collector1.elements.indexOf(jobSubjectId), "in bottom-up search, a child element should be visited before its parent element");
      assert.isTrue(collector1.elements.indexOf(childSubject) < collector1.elements.indexOf(jobSubjectId), "in bottom-up search, a child element should be visited before its parent element");
      assert.isTrue(collector1.elements.indexOf(physicalModelId) < collector1.elements.indexOf(childSubject), "in bottom-up search, a child element should be visited before its parent element");
    }

    // Exercise the search filters
    {
      const collector2 = new SelectedElementCollector(iVault, [drawingGraphicId1, spatialCategoryId, nestedSpatialCategoryId, physicalObjectId3]);
      collector2.collect(jobSubjectId);
      assert.isTrue(collector2.definitions.length === 2);
      assert.isTrue(collector2.definitions.includes(spatialCategoryId));
      assert.isTrue(collector2.definitions.includes(nestedSpatialCategoryId));
      assert.isTrue(collector2.elements.length === 2);
      assert.isTrue(collector2.elements.includes(drawingGraphicId1));
      assert.isTrue(collector2.elements.includes(physicalObjectId3));
    }

    // Test the deleteElementTree function
    withEditTxn(iVault, (txn) => {
      deleteElementTree(txn, jobSubjectId);
    });

    assert.isTrue(doesModelExist(iVault, IVault.repositoryModelId));
    assert.isTrue(doesModelExist(iVault, IVault.dictionaryId));
    assert.isTrue(doesElementExist(iVault, repositoryLinkId), "RepositoryLink should not have been deleted, since it is not under Job Subject");
    assert.isFalse(doesElementExist(iVault, definitionModelId));
    assert.isFalse(doesElementExist(iVault, definitionContainerId));
    assert.isFalse(doesElementExist(iVault, drawingDefinitionModelId));
    assert.isFalse(doesElementExist(iVault, spatialCategoryId));
    assert.isFalse(doesElementExist(iVault, nestedSpatialCategoryId));
    assert.isFalse(doesElementExist(iVault, drawingCategoryId));
    assert.isFalse(doesElementExist(iVault, xsGroup));
    assert.isFalse(doesElementExist(iVault, xsElement));
    assert.isFalse(doesElementExist(iVault, documentListModelId));
    assert.isFalse(doesElementExist(iVault, drawingModelId));
    assert.isFalse(doesElementExist(iVault, drawingGraphicId1));
    assert.isFalse(doesElementExist(iVault, physicalModelId));
    assert.isFalse(doesElementExist(iVault, physicalObjectId1));
    assert.isFalse(doesElementExist(iVault, physicalObjectId2));
    assert.isFalse(doesElementExist(iVault, physicalObjectId3));
    assert.isFalse(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId2));
    assert.isFalse(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId3));
    assert.isFalse(doesElementExist(iVault, jobSubjectId));
    assert.isFalse(doesModelExist(iVault, definitionModelId));
    assert.isFalse(doesModelExist(iVault, drawingDefinitionModelId));
    assert.isFalse(doesModelExist(iVault, drawingModelId));
    assert.isFalse(doesModelExist(iVault, physicalModelId));
  });

  it("deleteElementSubTrees", () => {
    /*
      [RepositoryModel]
        RepositoryLink
        Job Subject
          +- DefinitionParitition  --   [DefinitionModel]
          |                               DrawingCategory                         <-- PRUNE
          |                                 default SubCategory + 2 non-default SubCategories
          |                               ExternalSourceGroup
          |                                 ExternalSource child1
          +- DefinitionParitition  --   [DefinitionModel]
          |                               SpatialCategory
          |                               DefinitionContainer
          |                                   SpatialCategory
          |
          +- DocumentList         --    [DocumentListModel]
          |                               Drawing             -- [DrawingModel]   <-- PRUNE
          |                                                       DrawingGraphic       "
          +- Child Subject
              |
              +- PhysicalPartition --   [PhysicalModel]
                                          PhysicalObject, PhysicalObject, PhysicalObject (grouped)
                                                                                  ^-- PRUNE
    */

    const toPrune = new Set<string>();
    toPrune.add(drawingModelId);
    toPrune.add(drawingCategoryId);
    toPrune.add(physicalObjectId3);

    withEditTxn(iVault, (txn) => {
      deleteElementSubTrees(txn, jobSubjectId, (elementId) => toPrune.has(elementId));
    });

    assert.isFalse(doesElementExist(iVault, drawingCategoryId));
    assert.isFalse(doesElementExist(iVault, drawingSubCategory1Id));
    assert.isFalse(doesElementExist(iVault, drawingSubCategory2Id));
    assert.isFalse(doesElementExist(iVault, drawingModelId));
    assert.isFalse(doesModelExist(iVault, drawingModelId));
    assert.isFalse(doesElementExist(iVault, drawingGraphicId1)); // contents of drawing model should be gone
    assert.isFalse(doesElementExist(iVault, physicalObjectId3));
    assert.isFalse(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId3));

    assert.isTrue(doesElementExist(iVault, repositoryLinkId));
    assert.isTrue(doesElementExist(iVault, definitionModelId));
    assert.isTrue(doesElementExist(iVault, definitionContainerId));
    assert.isTrue(doesElementExist(iVault, drawingDefinitionModelId));
    assert.equal(iVault.elements.getElement(xsGroup).model, drawingDefinitionModelId);
    assert.equal(iVault.elements.getElement(xsElement).parent?.id, xsGroup);
    assert.isTrue(doesElementExist(iVault, spatialCategoryId));
    assert.isTrue(doesElementExist(iVault, nestedSpatialCategoryId));
    assert.isTrue(doesElementExist(iVault, documentListModelId));
    assert.isTrue(doesElementExist(iVault, physicalModelId));
    assert.isTrue(doesElementExist(iVault, physicalObjectId1));
    assert.isTrue(doesElementExist(iVault, physicalObjectId2));
    assert.isTrue(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId2));
    assert.isTrue(doesElementExist(iVault, jobSubjectId));
    assert.isTrue(doesModelExist(iVault, definitionModelId));
    assert.isTrue(doesModelExist(iVault, definitionContainerId));
    assert.isTrue(doesModelExist(iVault, drawingDefinitionModelId));
    assert.isTrue(doesModelExist(iVault, physicalModelId));
    assert.isTrue(doesModelExist(iVault, IVault.repositoryModelId));
    assert.isTrue(doesModelExist(iVault, IVault.dictionaryId));
  });

  it("deleteDefinitionPartition", () => {
    /*
      [RepositoryModel]
        RepositoryLink
        Job Subject
          +- DefinitionParitition  --   [DefinitionModel]                         <-- PRUNE
          |                               DrawingCategory
          |                                 default SubCategory + 2 non-default SubCategories
          |                               ExternalSourceGroup
          |                                 ExternalSource child1
          +- DefinitionParitition  --   [DefinitionModel]
          |                               SpatialCategory
          |                               DefinitionContainer
          |                                   SpatialCategory          |
          +- DocumentList         --    [DocumentListModel]
          |                               Drawing             -- [DrawingModel]
          |                                                       DrawingGraphic
          +- Child Subject
              |
              +- PhysicalPartition --   [PhysicalModel]
                                          PhysicalObject, PhysicalObject, PhysicalObject (grouped)
    */

    const toPrune = new Set<string>();
    toPrune.add(drawingDefinitionModelId);
    toPrune.add(documentListModelId); // (also get rid of the elements that use the definitions)

    withEditTxn(iVault, (txn) => {
      deleteElementSubTrees(txn, jobSubjectId, (elementId) => toPrune.has(elementId));
    });

    assert.isFalse(doesElementExist(iVault, drawingDefinitionModelId));
    assert.isFalse(doesModelExist(iVault, drawingDefinitionModelId));
    assert.isFalse(doesElementExist(iVault, drawingCategoryId));
    assert.isFalse(doesElementExist(iVault, drawingSubCategory1Id));
    assert.isFalse(doesElementExist(iVault, drawingSubCategory2Id));
    assert.isFalse(doesElementExist(iVault, xsGroup));
    assert.isFalse(doesElementExist(iVault, xsElement));
    assert.isFalse(doesElementExist(iVault, documentListModelId));
    assert.isFalse(doesModelExist(iVault, documentListModelId));
    assert.isFalse(doesElementExist(iVault, drawingModelId));
    assert.isFalse(doesModelExist(iVault, drawingModelId));
    assert.isFalse(doesElementExist(iVault, drawingGraphicId1));

    assert.isTrue(doesElementExist(iVault, repositoryLinkId));
    assert.isTrue(doesElementExist(iVault, definitionModelId));
    assert.isTrue(doesElementExist(iVault, definitionContainerId));
    assert.isTrue(doesElementExist(iVault, spatialCategoryId));
    assert.isTrue(doesElementExist(iVault, nestedSpatialCategoryId));
    assert.isTrue(doesElementExist(iVault, physicalModelId));
    assert.isTrue(doesElementExist(iVault, physicalObjectId1));
    assert.isTrue(doesElementExist(iVault, physicalObjectId2));
    assert.isTrue(doesElementExist(iVault, physicalObjectId3));
    assert.isTrue(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId2));
    assert.isTrue(doesGroupRelationshipExist(iVault, physicalObjectId1, physicalObjectId3));
    assert.isTrue(doesElementExist(iVault, jobSubjectId));
    assert.isTrue(doesModelExist(iVault, definitionModelId));
    assert.isTrue(doesModelExist(iVault, definitionContainerId));
    assert.isTrue(doesModelExist(iVault, physicalModelId));
    assert.isTrue(doesModelExist(iVault, IVault.repositoryModelId));
    assert.isTrue(doesModelExist(iVault, IVault.dictionaryId));
  });
});



