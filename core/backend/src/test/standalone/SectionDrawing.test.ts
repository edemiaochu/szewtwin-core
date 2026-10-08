/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Id64 } from "@szewtwin/core-szewec";
import { Transform } from "@szewtwin/core-geometry";
import { RelatedElement, SectionDrawingProps, SectionType } from "@szewtwin/core-common";
import { Drawing, SectionDrawing } from "../../Element";
import { DocumentListModel, DrawingModel, SectionDrawingModel } from "../../Model";
import { SnapshotDb } from "../../IVaultDb";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { withEditTxn } from "../../EditTxn";

describe("SectionDrawing", () => {
  let ivault: SnapshotDb;
  let documentListModelId: string;
  before(() => {
    const iVaultPath = IVaultTestUtils.prepareOutputFile("SectionDrawing", "SectionDrawing.dtw");
    ivault = SnapshotDb.createEmpty(iVaultPath, { rootSubject: { name: "SectionDrawingTest" } });
    documentListModelId = withEditTxn(ivault, (txn) => DocumentListModel.insert(txn, SnapshotDb.rootSubjectId, "DocumentList"));
  });

  after(() => {
    ivault.close();
  });

  it("should round-trip through JSON", () => {
    // Insert a SectionDrawing
    const drawingId = withEditTxn(ivault, (txn) => txn.insertElement({
      classFullName: SectionDrawing.classFullName,
      model: documentListModelId,
      code: Drawing.createCode(ivault, documentListModelId, "SectionDrawingRoundTrip"),
    }));
    expect(Id64.isValidId64(drawingId)).to.be.true;

    const model = ivault.models.createModel({
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: drawingId },
    });
    const modelId = withEditTxn(ivault, (txn) => txn.insertModel(model.toJSON()));
    expect(Id64.isValidId64(modelId)).to.be.true;

    let drawing = ivault.elements.getElement<SectionDrawing>(drawingId);
    expect(drawing instanceof SectionDrawing).to.be.true;

    // Expect default values
    expect(Id64.isValidId64(drawing.spatialView.id)).to.be.false;
    expect(drawing.sectionType).to.equal(SectionType.Section);
    expect(drawing.jsonProperties.drawingToSpatialTransform).to.be.undefined;
    expect(drawing.jsonProperties.sheetToSpatialTransform).to.be.undefined;
    expect(drawing.drawingToSpatialTransform).to.be.undefined;
    expect(drawing.sheetToSpatialTransform).to.be.undefined;

    // Modify values
    const drawingToSpatial = Transform.createTranslationXYZ(1, 2, 3);
    const sheetToSpatial = Transform.createTranslationXYZ(4, 5, 6);
    drawing.spatialView = new RelatedElement({ id: "0x123" });
    drawing.sectionType = SectionType.Elevation;
    drawing.drawingToSpatialTransform = drawingToSpatial;
    drawing.sheetToSpatialTransform = sheetToSpatial;

    // Expect updated values
    const expectProps = (json: SectionDrawingProps | SectionDrawing) => {
      expect(json.spatialView).not.to.be.undefined;
      expect(json.spatialView?.id).to.equal("0x123");
      expect(json.sectionType).to.equal(SectionType.Elevation);
      expect(Transform.fromJSON(json.jsonProperties?.drawingToSpatialTransform).isAlmostEqual(drawingToSpatial)).to.be.true;
      expect(Transform.fromJSON(json.jsonProperties?.sheetToSpatialTransform).isAlmostEqual(sheetToSpatial)).to.be.true;
    };

    const props = drawing.toJSON();
    expectProps(props);

    // Persist changes
    withEditTxn(ivault, (txn) => txn.updateElement(props));

    // Obtain persistent element
    drawing = ivault.elements.getElement<SectionDrawing>(drawingId);

    // Expect persistent values
    expectProps(drawing);
    expectProps(drawing.toJSON());
  });

  it("should create a SectionDrawing and SectionDrawingModel on insert", () => {
    const sectionDrawingId = withEditTxn(ivault, (txn) => SectionDrawing.insert(txn, documentListModelId, "SectionDrawingInsert"));

    expect(Id64.isValidId64(sectionDrawingId)).to.be.true;

    const insertedSectionDrawing = ivault.elements.getElement(sectionDrawingId);

    expect(insertedSectionDrawing instanceof SectionDrawing).to.be.true;

    const insertedSectionDrawingModel = ivault.models.getModel(sectionDrawingId);

    expect(insertedSectionDrawingModel.className).to.equal("SectionDrawingModel");
    expect(insertedSectionDrawingModel instanceof SectionDrawingModel).to.be.true;
  });
});
