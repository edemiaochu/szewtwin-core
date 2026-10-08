/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { CompressedId64Set, IVaultStatus, OpenMode } from "@szewtwin/core-szewec";
import { LineSegment3d, Point3d, YawPitchRollAngles } from "@szewtwin/core-geometry";
import { withEditTxn } from "../../EditTxn";
import {
  Code, ColorByName, GeometricElement3dProps, GeometryStreamBuilder, IVault, ModelGeometryChangesProps, SubCategoryAppearance,
} from "@szewtwin/core-common";
import {
  _nativeDb,
  ChannelControl, IVaultJsFs, PhysicalModel, SpatialCategory, StandaloneDb, VolumeElement,
} from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";

describe("Model geometry changes", () => {
  let ivault: StandaloneDb;
  let modelId: string;
  let categoryId: string;
  let lastChanges: ModelGeometryChangesProps[] | undefined;

  before(async () => {
    const testFileName = IVaultTestUtils.prepareOutputFile("ModelGeometryTracking", "ModelGeometryTracking.dtw");
    const seedFileName = IVaultTestUtils.resolveAssetFile("test.dtw");
    IVaultJsFs.copySync(seedFileName, testFileName);

    // Upgrade the schema to include the GeometryGuid and LastMod model properties.
    StandaloneDb.upgradeStandaloneSchemas(testFileName);
    ivault = StandaloneDb.openFile(testFileName, OpenMode.ReadWrite);
    ivault.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    withEditTxn(ivault, "set up", (txn) => {
      modelId = PhysicalModel.insert(txn, IVault.rootSubjectId, "TestModel");
      categoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "TestCategory", new SubCategoryAppearance({ color: ColorByName.darkRed }));
    });
    ivault[_nativeDb].deleteAllTxns();
    ivault.txns.onGeometryChanged.addListener((props) => lastChanges = props);
  });

  after(async () => {
    ivault[_nativeDb].setGeometricModelTrackingEnabled(false);
    ivault.close();
  });

  interface GeometricModelChange {
    modelId: string;
    inserted?: string[];
    updated?: string[];
    deleted?: string[];
  }

  function expectChanges(expected: GeometricModelChange | undefined): void {
    if (!expected) {
      expect(lastChanges).to.be.undefined;
      return;
    }

    expect(lastChanges).to.be.not.undefined;
    expect(Array.isArray(lastChanges)).to.be.true;
    expect(lastChanges!.length).to.equal(1);
    const actual = lastChanges![0];
    expect(actual.id).to.equal(modelId);

    const expectElements = (ids?: CompressedId64Set, exp?: string[]) => {
      expect(undefined === ids).to.equal(undefined === exp);
      if (ids && exp) {
        const act = CompressedId64Set.decompressArray(ids);
        expect(act.length).to.equal(exp.length);
        expect(act.sort()).to.deep.equal(exp.sort());
      }
    };

    expectElements(actual.inserted?.ids, expected.inserted);
    expectElements(actual.updated?.ids, expected.updated);
    expectElements(actual.deleted, expected.deleted);
    lastChanges = undefined;
  }

  function expectNoChanges(): void {
    expect(lastChanges).to.be.undefined;
  }

  it("emits events", async () => {
    expect(ivault[_nativeDb].isGeometricModelTrackingSupported()).to.be.true;
    expect(ivault[_nativeDb].setGeometricModelTrackingEnabled(true).result).to.be.true;

    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(LineSegment3d.create(Point3d.createZero(), Point3d.create(5, 0, 0)));

    // Insert a geometric element.
    const props: GeometricElement3dProps = {
      classFullName: VolumeElement.classFullName,
      model: modelId,
      category: categoryId,
      code: Code.createEmpty(),
      placement: {
        origin: new Point3d(1, 2, 0),
        angles: new YawPitchRollAngles(),
      },
      geom: builder.geometryStream,
    };

    const elemId0 = withEditTxn(ivault, "insert elem 0", (txn) => txn.insertElement(props));
    expectChanges({ modelId, inserted: [elemId0] });

    // Modify the element without touching its geometry.
    props.userLabel = "new label";
    props.id = elemId0;
    withEditTxn(ivault, "change label", (txn) => txn.updateElement(props));
    expectNoChanges();

    // Modify the element's geometry.
    props.placement = { origin: new Point3d(2, 1, 0), angles: new YawPitchRollAngles() };
    withEditTxn(ivault, "change placement", (txn) => txn.updateElement(props));
    expectChanges({ modelId, updated: [elemId0] });

    // Insert another element.
    props.id = undefined;
    const elemId1 = withEditTxn(ivault, "insert elem 1", (txn) => txn.insertElement(props));
    expectChanges({ modelId, inserted: [elemId1] });

    // Delete an element.
    withEditTxn(ivault, "delete elem 0", (txn) => txn.deleteElement(elemId0));
    expectChanges({ modelId, deleted: [elemId0] });

    // Stop tracking geometry changes
    expect(ivault[_nativeDb].setGeometricModelTrackingEnabled(false).result).to.be.false;
    expect(ivault[_nativeDb].isGeometricModelTrackingSupported()).to.be.true;

    // Modify element's geometry.
    props.id = elemId1;
    props.placement = { origin: new Point3d(2, 10, 0), angles: new YawPitchRollAngles() };
    withEditTxn(ivault, "change placement again without tracking", (txn) => txn.updateElement(props));
    expectNoChanges();

    // Restart tracking and undo everything.
    expect(ivault[_nativeDb].setGeometricModelTrackingEnabled(true).result).to.be.true;
    expect(ivault.txns.reverseSingleTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, updated: [elemId1] });

    expect(ivault.txns.reverseSingleTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, inserted: [elemId0] });

    expect(ivault.txns.reverseSingleTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, deleted: [elemId1] });

    expect(ivault.txns.reverseSingleTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, updated: [elemId0] });

    expect(ivault.txns.reverseSingleTxn()).to.equal(IVaultStatus.Success);
    expectNoChanges();

    expect(ivault.txns.reverseSingleTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, deleted: [elemId0] });

    // Redo everything.
    expect(ivault.txns.reinstateTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, inserted: [elemId0] });

    expect(ivault.txns.reinstateTxn()).to.equal(IVaultStatus.Success);
    expectNoChanges();

    expect(ivault.txns.reinstateTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, updated: [elemId0] });

    expect(ivault.txns.reinstateTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, inserted: [elemId1] });

    expect(ivault.txns.reinstateTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, deleted: [elemId0] });

    expect(ivault.txns.reinstateTxn()).to.equal(IVaultStatus.Success);
    expectChanges({ modelId, updated: [elemId1] });

    expect(ivault[_nativeDb].setGeometricModelTrackingEnabled(false).result).to.be.false;
  });
});
