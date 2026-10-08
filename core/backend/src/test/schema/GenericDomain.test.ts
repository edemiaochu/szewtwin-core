/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { DbResult, Guid, Id64, Id64String } from "@szewtwin/core-szewec";
import { withEditTxn } from "../../EditTxn";
import {
  CategoryProps, Code, DefinitionElementProps, ElementProps, GeometricElement3dProps, IVault, PhysicalElementProps, PhysicalTypeProps,
  TypeDefinitionElementProps,
} from "@szewtwin/core-common";
import {
  DefinitionModel, DocumentListModel, DMSqlStatement, GenericDocument, GenericGraphicalModel3d, GenericGraphicalType2d, GenericPhysicalMaterial,
  GenericPhysicalType, GenericSchema, Graphic3d, GraphicalPartition3d, Group, GroupInformationPartition, GroupModel, IVaultDb, IVaultJsFs,
  PhysicalElementIsOfPhysicalMaterial, PhysicalElementIsOfType, PhysicalModel, PhysicalObject, PhysicalTypeIsOfPhysicalMaterial,
  SnapshotDb, SpatialCategory, SubjectOwnsPartitionElements,
} from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";

describe("Generic Domain", () => {

  function count(iVaultDb: IVaultDb, classFullName: string): number {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return iVaultDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (statement: DMSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
  }

  it("should create elements from the Generic domain", async () => {
    GenericSchema.registerSchema();
    assert.isTrue(IVaultJsFs.existsSync(GenericSchema.schemaFilePath));
    assert.equal(GenericSchema.schemaName, "Generic");
    assert.isTrue(PhysicalObject.classFullName.startsWith(GenericSchema.schemaName));

    const iVaultDb = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("GenericDomain", "GenericTest.dtw"), {
      rootSubject: { name: "GenericTest", description: "Test of the Generic domain schema." },
      client: "Generic",
      globalOrigin: { x: 0, y: 0 },
      projectExtents: { low: { x: -500, y: -500, z: -50 }, high: { x: 500, y: 500, z: 50 } },
      guid: Guid.createValue(),
      createClassViews: true,
    });

    withEditTxn(iVaultDb, (txn) => {
      // Create and populate a DefinitionModel
      const definitionModelId: Id64String = DefinitionModel.insert(txn, IVault.rootSubjectId, "Test DefinitionModel");
      assert.isTrue(Id64.isValidId64(definitionModelId));

      // Insert a SpatialCategory
      const spatialCategoryProps: CategoryProps = {
        classFullName: SpatialCategory.classFullName,
        model: definitionModelId,
        code: SpatialCategory.createCode(iVaultDb, definitionModelId, "Test SpatialCategory"),
      };
      const spatialCategoryId: Id64String = txn.insertElement(spatialCategoryProps);
      assert.isTrue(Id64.isValidId64(spatialCategoryId));

      // Insert a GenericGraphicalType2d
      const graphicalTypeProps: TypeDefinitionElementProps = {
        classFullName: GenericGraphicalType2d.classFullName,
        model: definitionModelId,
        code: Code.createEmpty(),
        userLabel: `${GenericGraphicalType2d.className}`,
      };
      const graphicalTypeId: Id64String = txn.insertElement(graphicalTypeProps);
      assert.isTrue(Id64.isValidId64(graphicalTypeId));

      // Insert a GenericPhysicalMaterial
      const physicalMaterialProps: DefinitionElementProps = {
        classFullName: GenericPhysicalMaterial.classFullName,
        model: definitionModelId,
        code: Code.createEmpty(),
        userLabel: `${GenericPhysicalMaterial.className}`,
      };
      const physicalMaterialId: Id64String = txn.insertElement(physicalMaterialProps);
      assert.isTrue(Id64.isValidId64(physicalMaterialId));

      // Insert a GenericPhysicalType
      const physicalTypeProps: PhysicalTypeProps = {
        classFullName: GenericPhysicalType.classFullName,
        model: definitionModelId,
        code: Code.createEmpty(),
        userLabel: `${GenericPhysicalType.className}`,
        physicalMaterial: new PhysicalTypeIsOfPhysicalMaterial(physicalMaterialId),
      };
      const physicalTypeId: Id64String = txn.insertElement(physicalTypeProps);
      assert.isTrue(Id64.isValidId64(physicalTypeId));

      // Create and populate a PhysicalModel
      const physicalModelId: Id64String = PhysicalModel.insert(txn, IVault.rootSubjectId, "Test PhysicalModel");
      assert.isTrue(Id64.isValidId64(physicalModelId));

      for (let i = 0; i < 3; i++) {
        const physicalObjectProps: PhysicalElementProps = {
          classFullName: PhysicalObject.classFullName,
          model: physicalModelId,
          category: spatialCategoryId,
          code: Code.createEmpty(),
          userLabel: `${PhysicalObject.className}${i}`,
          physicalMaterial: new PhysicalElementIsOfPhysicalMaterial(physicalMaterialId),
          typeDefinition: new PhysicalElementIsOfType(physicalTypeId),
        };
        const physicalObjectId: Id64String = txn.insertElement(physicalObjectProps);
        assert.isTrue(Id64.isValidId64(physicalObjectId));
      }
      assert.equal(3, count(iVaultDb, PhysicalObject.classFullName));

      // Create and populate a Generic:GroupModel
      const groupPartitionId = txn.insertElement({
        classFullName: GroupInformationPartition.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsPartitionElements(IVault.rootSubjectId),
        code: GroupInformationPartition.createCode(iVaultDb, IVault.rootSubjectId, "Test GroupModel"),
      });
      const groupModelId: Id64String = txn.insertModel({
        classFullName: GroupModel.classFullName,
        modeledElement: { id: groupPartitionId },
      });
      assert.isTrue(Id64.isValidId64(groupModelId));

      for (let i = 0; i < 4; i++) {
        const groupProps: ElementProps = {
          classFullName: Group.classFullName,
          model: groupModelId,
          code: Code.createEmpty(),
          userLabel: `${Group.className}${i}`,
        };
        const groupId: Id64String = txn.insertElement(groupProps);
        assert.isTrue(Id64.isValidId64(groupId));
      }
      assert.equal(4, count(iVaultDb, `${Group.schema.schemaName}:[${Group.className}]`)); // GROUP is a reserved word in SQL

      // Create and populate a Generic:GraphicalModel3d
      const graphicalPartitionId = txn.insertElement({
        classFullName: GraphicalPartition3d.classFullName,
        model: IVault.repositoryModelId,
        parent: new SubjectOwnsPartitionElements(IVault.rootSubjectId),
        code: GraphicalPartition3d.createCode(iVaultDb, IVault.rootSubjectId, "Test GraphicalModel3d"),
      });
      const graphicalModelId: Id64String = txn.insertModel({
        classFullName: GenericGraphicalModel3d.classFullName,
        modeledElement: { id: graphicalPartitionId },
      });
      assert.isTrue(Id64.isValidId64(graphicalModelId));

      for (let i = 0; i < 5; i++) {
        const graphicProps: GeometricElement3dProps = {
          classFullName: Graphic3d.classFullName,
          model: graphicalModelId,
          category: spatialCategoryId,
          code: Code.createEmpty(),
          userLabel: `${Graphic3d.className}${i}`,
        };
        const graphicId: Id64String = txn.insertElement(graphicProps);
        assert.isTrue(Id64.isValidId64(graphicId));
      }
      assert.equal(5, count(iVaultDb, Graphic3d.classFullName));

      // Create and populate a DocumentListModel
      const documentListModelId: Id64String = DocumentListModel.insert(txn, IVault.rootSubjectId, "Test DocumentListModel");
      assert.isTrue(Id64.isValidId64(documentListModelId));

      for (let i = 0; i < 2; i++) {
        const documentProps: ElementProps = {
          classFullName: GenericDocument.classFullName,
          model: documentListModelId,
          code: Code.createEmpty(),
          userLabel: `${GenericDocument.className}${i}`,
        };
        const graphicId: Id64String = txn.insertElement(documentProps);
        assert.isTrue(Id64.isValidId64(graphicId));
      }
      assert.equal(2, count(iVaultDb, GenericDocument.classFullName));
    });

    iVaultDb.close();
  });
});
