/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { Id64, Id64String } from "@szewtwin/core-szewec";
import { ElementAspectProps, ExternalSourceAspectProps, IVault, SubCategoryAppearance } from "@szewtwin/core-common";
import { withEditTxn } from "../../EditTxn";
import {
  Element, ElementAspect, ElementMultiAspect, ElementUniqueAspect, ExternalSourceAspect, PhysicalElement, SnapshotDb, SpatialCategory,
} from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";

describe("ElementAspect", () => {

  let iVault: SnapshotDb;

  before(() => {
    // NOTE: see ElementAspectTests.PresentationRuleScenarios in BldPlatform\Tests\BldProject\NonPublished\ElementAspect_Test.cpp for how ElementAspectTest.dtw was created
    const seedFileName = IVaultTestUtils.resolveAssetFile("ElementAspectTest.dtw");
    const testFileName = IVaultTestUtils.prepareOutputFile("ElementAspect", "ElementAspectTest.dtw");
    iVault = IVaultTestUtils.createSnapshotFromSeed(testFileName, seedFileName);
  });

  after(() => {
    iVault.close();
  });

  it("should be able to get aspects from test file", () => {
    const element = iVault.elements.getElement("0x17");
    assert.exists(element);
    assert.isTrue(element instanceof PhysicalElement);

    const aspect1: ElementAspect = iVault.elements.getAspects(element.id, "BldPlatformTest:TestUniqueAspectNoHandler")[0];
    assert.exists(aspect1);
    assert.isTrue(aspect1 instanceof ElementUniqueAspect);
    assert.equal(aspect1.classFullName, "BldPlatformTest:TestUniqueAspectNoHandler");
    assert.equal(aspect1.asAny.testUniqueAspectProperty, "Aspect1-Updated");
    assert.equal(aspect1.asAny.length, 1);
    assert.equal(JSON.stringify(aspect1), `{"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"Aspect1-Updated","length":1,"element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}`);

    // Test getAspects with dot separator
    const aspect1DotSeparator: ElementAspect = iVault.elements.getAspects(element.id, "BldPlatformTest.TestUniqueAspectNoHandler")[0];
    assert.exists(aspect1DotSeparator);
    assert.isTrue(aspect1DotSeparator instanceof ElementUniqueAspect);
    assert.equal(aspect1DotSeparator.classFullName, "BldPlatformTest:TestUniqueAspectNoHandler");
    assert.equal(aspect1DotSeparator.asAny.testUniqueAspectProperty, "Aspect1-Updated");
    assert.equal(aspect1DotSeparator.asAny.length, 1);
    assert.equal(JSON.stringify(aspect1DotSeparator), `{"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"Aspect1-Updated","length":1,"element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}`);

    // cross-check getAspects against getAspect
    const aspect1X: ElementAspect = iVault.elements.getAspect(aspect1.id);
    assert.exists(aspect1X);
    assert.isTrue(aspect1X instanceof ElementUniqueAspect);
    assert.equal(aspect1X.classFullName, "BldPlatformTest:TestUniqueAspectNoHandler");
    assert.equal(aspect1X.asAny.testUniqueAspectProperty, "Aspect1-Updated");
    assert.equal(aspect1X.asAny.length, 1);
    assert.equal(JSON.stringify(aspect1X), `{"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"Aspect1-Updated","length":1,"element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}`);

    const aspect2: ElementAspect = iVault.elements.getAspects(element.id, "BldPlatformTest:TestUniqueAspect")[0];
    assert.exists(aspect2);
    assert.isTrue(aspect2 instanceof ElementUniqueAspect);
    assert.equal(aspect2.classFullName, "BldPlatformTest:TestUniqueAspect");
    assert.equal(aspect2.asAny.testUniqueAspectProperty, "Aspect2-Updated");
    assert.isUndefined(aspect2.asAny.length);
    assert.equal(JSON.stringify(aspect2), `{"classFullName":"BldPlatformTest:TestUniqueAspect","id":"0x1","testUniqueAspectProperty":"Aspect2-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}`);

    // Test getAspects with dot separator
    const aspect2DotSeparator: ElementAspect = iVault.elements.getAspects(element.id, "BldPlatformTest.TestUniqueAspect")[0];
    assert.exists(aspect2DotSeparator);
    assert.isTrue(aspect2DotSeparator instanceof ElementUniqueAspect);
    assert.equal(aspect2DotSeparator.classFullName, "BldPlatformTest:TestUniqueAspect");
    assert.equal(aspect2DotSeparator.asAny.testUniqueAspectProperty, "Aspect2-Updated");
    assert.isUndefined(aspect2DotSeparator.asAny.length);
    assert.equal(JSON.stringify(aspect2DotSeparator), `{"classFullName":"BldPlatformTest:TestUniqueAspect","id":"0x1","testUniqueAspectProperty":"Aspect2-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}`);

    // cross-check getAspects against getAspect
    const aspect2X: ElementAspect = iVault.elements.getAspect(aspect2.id);
    assert.exists(aspect2X);
    assert.isTrue(aspect2X instanceof ElementUniqueAspect);
    assert.equal(aspect2X.classFullName, "BldPlatformTest:TestUniqueAspect");
    assert.equal(aspect2X.asAny.testUniqueAspectProperty, "Aspect2-Updated");
    assert.isUndefined(aspect2X.asAny.length);
    assert.equal(JSON.stringify(aspect2X), `{"classFullName":"BldPlatformTest:TestUniqueAspect","id":"0x1","testUniqueAspectProperty":"Aspect2-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}`);

    const uniqueAspects: ElementUniqueAspect[] = iVault.elements.getAspects(element.id, ElementUniqueAspect.classFullName);
    assert.equal(uniqueAspects.length, 2);
    uniqueAspects.forEach((aspect) => {
      assert.isTrue(aspect.classFullName === aspect1.classFullName || aspect.classFullName === aspect2.classFullName);
      // cross-check against getting the aspects individually
      const aspectX: ElementAspect = iVault.elements.getAspect(aspect.id);
      assert.exists(aspectX);
      assert.equal(aspectX.schemaName, aspect.schemaName);
      assert.equal(aspectX.className, aspect.className);
    });
    assert.equal(JSON.stringify(uniqueAspects), `[{"classFullName":"BldPlatformTest:TestUniqueAspect","id":"0x1","testUniqueAspectProperty":"Aspect2-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}},
    {"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"Aspect1-Updated","length":1,"element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}]`.replace(/\s+/g, ""));

    const multiAspectsA: ElementAspect[] = iVault.elements.getAspects(element.id, "BldPlatformTest:TestMultiAspectNoHandler");
    assert.exists(multiAspectsA);
    assert.isArray(multiAspectsA);
    assert.equal(multiAspectsA.length, 2);
    multiAspectsA.forEach((aspect) => {
      assert.isTrue(aspect instanceof ElementMultiAspect);
      assert.equal(aspect.schemaName, "BldPlatformTest");
      assert.equal(aspect.className, "TestMultiAspectNoHandler");
      assert.exists(aspect.asAny.testMultiAspectProperty);
      // cross-check against getting the aspects individually
      const aspectX: ElementAspect = iVault.elements.getAspect(aspect.id);
      assert.exists(aspectX);
      assert.equal(aspectX.schemaName, aspect.schemaName);
      assert.equal(aspectX.className, aspect.className);
      assert.exists(aspectX.asAny.testMultiAspectProperty);
      assert.equal(aspectX.asAny.testMultiAspectProperty, aspect.asAny.testMultiAspectProperty);
    });
    assert.equal(JSON.stringify(multiAspectsA), `[{"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}}]`.replace(/\s+/g, ""));

    // Test getAspects with dot separator
    const multiAspectsADotSeparator: ElementAspect[] = iVault.elements.getAspects(element.id, "BldPlatformTest.TestMultiAspectNoHandler");
    assert.exists(multiAspectsADotSeparator);
    assert.isArray(multiAspectsADotSeparator);
    assert.equal(multiAspectsADotSeparator.length, 2);
    multiAspectsADotSeparator.forEach((aspect) => {
      assert.isTrue(aspect instanceof ElementMultiAspect);
      assert.equal(aspect.schemaName, "BldPlatformTest");
      assert.equal(aspect.className, "TestMultiAspectNoHandler");
      assert.exists(aspect.asAny.testMultiAspectProperty);
      // cross-check against getting the aspects individually
      const aspectX: ElementAspect = iVault.elements.getAspect(aspect.id);
      assert.exists(aspectX);
      assert.equal(aspectX.schemaName, aspect.schemaName);
      assert.equal(aspectX.className, aspect.className);
      assert.exists(aspectX.asAny.testMultiAspectProperty);
      assert.equal(aspectX.asAny.testMultiAspectProperty, aspect.asAny.testMultiAspectProperty);
    });
    assert.equal(JSON.stringify(multiAspectsADotSeparator), `[{"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}}]`.replace(/\s+/g, ""));

    const multiAspectsB: ElementAspect[] = iVault.elements.getAspects(element.id, "BldPlatformTest:TestMultiAspect");
    assert.exists(multiAspectsB);
    assert.isArray(multiAspectsB);
    assert.equal(multiAspectsB.length, 2);
    multiAspectsB.forEach((aspect) => {
      assert.isTrue(aspect instanceof ElementMultiAspect);
      assert.equal(aspect.schemaName, "BldPlatformTest");
      assert.equal(aspect.className, "TestMultiAspect");
      assert.exists(aspect.asAny.testMultiAspectProperty);
      // cross-check against getting the aspects individually
      const aspectX: ElementAspect = iVault.elements.getAspect(aspect.id);
      assert.isTrue(aspectX instanceof ElementMultiAspect);
      assert.equal(aspectX.schemaName, "BldPlatformTest");
      assert.equal(aspectX.className, "TestMultiAspect");
      assert.exists(aspectX.asAny.testMultiAspectProperty);
    });
    assert.equal(JSON.stringify(multiAspectsB), `[{"classFullName":"BldPlatformTest:TestMultiAspect","id":"0x2","testMultiAspectProperty":"Aspect5-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BldPlatformTest:TestMultiAspect","id":"0x3","testMultiAspectProperty":"Aspect6-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}}]`.replace(/\s+/g, ""));

    const multiAspects: ElementAspect[] = iVault.elements.getAspects(element.id, ElementMultiAspect.classFullName);
    assert.equal(multiAspects.length, 4);
    multiAspects.forEach((aspect) => {
      assert.isTrue(aspect.classFullName === multiAspectsA[0].classFullName || aspect.classFullName === multiAspectsB[0].classFullName);
      // cross-check against getting the aspects individually
      const aspectX: ElementAspect = iVault.elements.getAspect(aspect.id);
      assert.exists(aspectX);
      assert.equal(aspectX.schemaName, aspect.schemaName);
      assert.equal(aspectX.className, aspect.className);
    });
    assert.equal(JSON.stringify(multiAspects), `[{"classFullName":"BldPlatformTest:TestMultiAspect","id":"0x2","testMultiAspectProperty":"Aspect5-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BldPlatformTest:TestMultiAspect","id":"0x3","testMultiAspectProperty":"Aspect6-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}}]`.replace(/\s+/g, ""));

    const rootSubject = iVault.elements.getRootSubject();
    assert.equal(0, iVault.elements.getAspects(rootSubject.id, "BldPlatformTest:TestUniqueAspect").length, "Don't expect BldPlatformTest:TestUniqueAspect aspects on the root Subject");
    assert.equal(0, iVault.elements.getAspects(rootSubject.id, "BldPlatformTest:TestMultiAspect").length, "Don't expect BldPlatformTest:TestMultiAspect aspects on the root Subject");
    assert.equal(0, iVault.elements.getAspects(rootSubject.id).length, "Don't expect any aspects on the root Subject");

    // The 'Element' property is introduced by ElementUniqueAspect and ElementMultiAspect, but is not available at the ElementAspect base class.
    // Since we're now using instance queries to query ElementUniqueAspect and ElementMultiAspect directly in getAspects(), we can provide ElementAspect to the function as well.
    const aspectList = `[{"classFullName":"BldPlatformTest:TestMultiAspect","id":"0x2","testMultiAspectProperty":"Aspect5-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BldPlatformTest:TestMultiAspect","id":"0x3","testMultiAspectProperty":"Aspect6-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestUniqueAspect","id":"0x1","testUniqueAspectProperty":"Aspect2-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}},
    {"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"Aspect1-Updated","length":1,"element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}]`.replace(/\s+/g, "");

    const aspects: ElementAspect[] = iVault.elements.getAspects(element.id, ElementAspect.classFullName);
    assert.equal(aspects.length, 6);
    assert.equal(JSON.stringify(aspects), aspectList);

    const allAspects: ElementAspect[] = iVault.elements.getAspects(element.id);
    assert.equal(allAspects.length, 6);
    assert.equal(JSON.stringify(allAspects), aspectList);
  });

  it("should be able to insert, update, and delete MultiAspects", () => {
    const element: Element = iVault.elements.getElement("0x17");
    assert.exists(element);
    assert.isTrue(element instanceof PhysicalElement);

    interface Props extends ElementAspectProps { testMultiAspectProperty: string }
    const aspectProps: Props = {
      classFullName: "BldPlatformTest:TestMultiAspectNoHandler",
      element: { id: element.id },
      testMultiAspectProperty: "MultiAspectInsertTest1",
    };
    withEditTxn(iVault, (txn) => txn.insertAspect(aspectProps));
    let aspects: ElementAspect[] = iVault.elements.getAspects(element.id, aspectProps.classFullName);
    assert.isAtLeast(aspects.length, 1);
    assert.equal(JSON.stringify(aspects), `[{"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x21","testMultiAspectProperty":"MultiAspectInsertTest1","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}}]`.replace(/\s+/g, ""));
    const numAspects = aspects.length;

    let found: boolean = false;
    let foundIndex: number = -1;
    for (const aspect of aspects) {
      foundIndex++;
      if (aspect.asAny.testMultiAspectProperty === aspectProps.testMultiAspectProperty) {
        found = true;
        break;
      }
    }
    assert.isTrue(found);

    aspects[foundIndex].asAny.testMultiAspectProperty = "MultiAspectInsertTest1-Updated";
    withEditTxn(iVault, (txn) => txn.updateAspect(aspects[foundIndex].toJSON()));

    const aspectsUpdated: ElementAspect[] = iVault.elements.getAspects(element.id, aspectProps.classFullName);
    assert.equal(aspectsUpdated.length, aspects.length);
    assert.equal(aspectsUpdated[foundIndex].asAny.testMultiAspectProperty, "MultiAspectInsertTest1-Updated");
    // Check if aspect was updated
    assert.equal(JSON.stringify(aspectsUpdated), `[{"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x21","testMultiAspectProperty":"MultiAspectInsertTest1-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsMultiAspects"}}]`.replace(/\s+/g, ""));

    withEditTxn(iVault, (txn) => txn.deleteAspect(aspects[foundIndex].id));
    aspects = iVault.elements.getAspects(element.id, aspectProps.classFullName);
    assert.equal(numAspects, aspects.length + 1);
    // Check if aspect was deleted
    assert.equal(JSON.stringify(aspects), `[{"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x4","testMultiAspectProperty":"Aspect3-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}},
    {"classFullName":"BldPlatformTest:TestMultiAspectNoHandler","id":"0x5","testMultiAspectProperty":"Aspect4-Updated","element":{"id":"0x17","relClassName":"BldPlatformTest.TestElement"}}]`.replace(/\s+/g, ""));
  });

  it("should be able to insert, update, and delete UniqueAspects", () => {
    const element: Element = iVault.elements.getElement("0x17");
    assert.exists(element);
    assert.isTrue(element instanceof PhysicalElement);

    const aspectProps = {
      classFullName: "BldPlatformTest:TestUniqueAspectNoHandler",
      element: { id: element.id },
      testUniqueAspectProperty: "UniqueAspectInsertTest1",
    };
    withEditTxn(iVault, (txn) => txn.insertAspect(aspectProps));
    const aspects: ElementAspect[] = iVault.elements.getAspects(element.id, aspectProps.classFullName);
    assert.isTrue(aspects.length === 1);
    assert.equal(aspects[0].asAny.testUniqueAspectProperty, aspectProps.testUniqueAspectProperty);
    assert.equal(JSON.stringify(aspects), `[{"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"UniqueAspectInsertTest1","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}]`);

    aspects[0].asAny.testUniqueAspectProperty = "UniqueAspectInsertTest1-Updated";
    withEditTxn(iVault, (txn) => txn.updateAspect(aspects[0].toJSON()));
    const aspectsUpdated: ElementAspect[] = iVault.elements.getAspects(element.id, aspectProps.classFullName);
    assert.equal(aspectsUpdated.length, 1);
    assert.equal(aspectsUpdated[0].asAny.testUniqueAspectProperty, "UniqueAspectInsertTest1-Updated");
    assert.equal(JSON.stringify(aspectsUpdated), `[{"classFullName":"BldPlatformTest:TestUniqueAspectNoHandler","id":"0x6","testUniqueAspectProperty":"UniqueAspectInsertTest1-Updated","element":{"id":"0x17","relClassName":"BisCore.ElementOwnsUniqueAspect"}}]`);

    withEditTxn(iVault, (txn) => txn.deleteAspect(aspects[0].id));
    try {
      const noAspects = iVault.elements.getAspects(element.id, aspectProps.classFullName);
      assert.equal(noAspects.length, 0);
      assert.isTrue(false, "Expected this line to be skipped");
    } catch (error) {
      assert.isTrue(error instanceof Error);
    }
  });

  it("should be able to insert ExternalSourceAspects", () => {
    const fileName = IVaultTestUtils.prepareOutputFile("ElementAspect", "ExternalSourceAspect.dtw");
    let iVaultDb = SnapshotDb.createEmpty(fileName, { rootSubject: { name: "ExternalSourceAspect" } });
    let elementId!: Id64String;
    let aspectProps!: ExternalSourceAspectProps;
    const aspectJson = withEditTxn(iVaultDb, (txn) => {
      elementId = SpatialCategory.insert(txn, IVault.dictionaryId, "Category", new SubCategoryAppearance());
      assert.isTrue(Id64.isValidId64(elementId));

      aspectProps = {
        classFullName: ExternalSourceAspect.classFullName,
        element: { id: elementId },
        scope: { id: IVault.rootSubjectId },
        identifier: "A",
        kind: "Letter",
        checksum: "1",
        version: "1.0",
      };
      const aspect = new ExternalSourceAspect(aspectProps, iVaultDb);
      expect(aspect).to.deep.subsetEqual(aspectProps, { normalizeClassNameProps: true });
      txn.insertAspect(aspectProps);
      return aspect.toJSON();
    });
    iVaultDb.close();
    iVaultDb = SnapshotDb.openFile(fileName);

    const aspects: ElementAspect[] = iVaultDb.elements.getAspects(elementId, aspectProps.classFullName);
    assert.equal(aspects.length, 1);
    assert.equal(JSON.stringify(aspects), `[{"classFullName":"BisCore:ExternalSourceAspect","id":"0x21","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"A","kind":"Letter","version":"1.0","checksum":"1","element":{"id":"0x11","relClassName":"BisCore.ElementOwnsMultiAspects"}}]`);
    expect(aspects[0]).to.deep.subsetEqual(aspectProps, { normalizeClassNameProps: true });

    expect(aspectJson).to.deep.subsetEqual(aspectProps, { normalizeClassNameProps: true });

    assert(aspectProps.scope !== undefined);
    const foundAspects = ExternalSourceAspect.findAllBySource(iVaultDb, aspectProps.scope.id, aspectProps.kind, aspectProps.identifier);
    assert.equal(foundAspects.length, 1);
    const foundAspect = foundAspects[0];
    assert.equal(foundAspect.aspectId, aspects[0].id);
    assert.equal(foundAspect.elementId, aspectProps.element.id);
  });

  it("should be able to insert multiple ExternalSourceAspects", () => {
    const fileName = IVaultTestUtils.prepareOutputFile("MultipleElementAspects", "ExternalSourceAspect.dtw");
    let iVaultDb = SnapshotDb.createEmpty(fileName, { rootSubject: { name: "MultipleExternalSourceAspects" } });
    let e1!: Id64String;
    let e2!: Id64String;

    const scopeId1 = IVault.rootSubjectId;
    const kind = "Letter";
    const kind2 = "Kind2";
    const { e1AspectProps, e2AspectProps } = withEditTxn(iVaultDb, (txn) => {
      e1 = SpatialCategory.insert(txn, IVault.dictionaryId, "Category1", new SubCategoryAppearance());
      e2 = SpatialCategory.insert(txn, IVault.dictionaryId, "Category2", new SubCategoryAppearance());
      const scopeId2 = e1;
      const aspectProps: ExternalSourceAspectProps = {
        classFullName: ExternalSourceAspect.classFullName,
        element: { id: "" },
        scope: { id: "" },
        identifier: "",
        kind,
      };
      const a: ExternalSourceAspectProps = { ...aspectProps, identifier: "A", scope: { id: scopeId1 } };
      const a2: ExternalSourceAspectProps = { ...aspectProps, identifier: "A", scope: { id: scopeId2 } };
      const b: ExternalSourceAspectProps = { ...aspectProps, identifier: "B", scope: { id: scopeId1 } };
      const c: ExternalSourceAspectProps = { ...aspectProps, identifier: "C", scope: { id: scopeId1 } };
      const ck2: ExternalSourceAspectProps = { ...aspectProps, identifier: "C", scope: { id: scopeId1 }, kind: kind2 };

      const e1Props: Array<ExternalSourceAspectProps> = [
        { ...a, element: { id: e1 } },
        { ...a, element: { id: e1 } }, // add a second aspect "A" in scope1
        { ...a2, element: { id: e1 } }, // add "A" in scope2
        { ...b, element: { id: e1 } },
        { ...ck2, element: { id: e1 } },
      ];
      const e2Props: Array<ExternalSourceAspectProps> = [
        { ...a, element: { id: e2 } }, // element2 also has an "A" in scope1
        { ...c, element: { id: e2 } },
      ];
      e1Props.forEach((aspect) => txn.insertAspect(aspect));
      e2Props.forEach((aspect) => txn.insertAspect(aspect));
      return { e1AspectProps: e1Props, e2AspectProps: e2Props };
    });
    iVaultDb.close();
    iVaultDb = SnapshotDb.openFile(fileName);

    const equalProps = (aspect: ElementAspect, wantProps: ExternalSourceAspectProps): boolean => {
      return (aspect.element.id === wantProps.element.id)
        && (aspect.asAny.scope.id === wantProps.scope.id)
        && (aspect.asAny.scope.relClassName.endsWith("ElementScopesExternalSourceIdentifier"))
        && (aspect.asAny.identifier === wantProps.identifier)
        && (aspect.asAny.kind === wantProps.kind)
        && (aspect.asAny.checksum === wantProps.checksum)
        && (aspect.asAny.version === wantProps.version);
    };
    const findInProps = (have: ElementAspect, wantArray: Array<ExternalSourceAspectProps>): boolean => {
      return wantArray.find((want) => equalProps(have, want)) !== undefined;
    };

    const e1Aspects: ElementAspect[] = iVaultDb.elements.getAspects(e1, ExternalSourceAspect.classFullName);
    assert.equal(e1Aspects.length, e1AspectProps.length);
    e1Aspects.forEach((x) => {
      assert.isTrue(findInProps(x, e1AspectProps));
    });
    assert.equal(JSON.stringify(e1Aspects), `[{"classFullName":"BisCore:ExternalSourceAspect","id":"0x21","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"A","kind":"Letter","element":{"id":"0x11","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BisCore:ExternalSourceAspect","id":"0x22","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"A","kind":"Letter","element":{"id":"0x11","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BisCore:ExternalSourceAspect","id":"0x23","scope":{"id":"0x11","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"A","kind":"Letter","element":{"id":"0x11","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BisCore:ExternalSourceAspect","id":"0x24","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"B","kind":"Letter","element":{"id":"0x11","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BisCore:ExternalSourceAspect","id":"0x25","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"C","kind":"Kind2","element":{"id":"0x11","relClassName":"BisCore.ElementOwnsMultiAspects"}}]`.replace(/\s+/g, ""));

    const e2Aspects: ElementAspect[] = iVaultDb.elements.getAspects(e2, ExternalSourceAspect.classFullName);
    assert.equal(e2Aspects.length, e2AspectProps.length);
    e2Aspects.forEach((x) => {
      assert.isTrue(findInProps(x, e2AspectProps));
    });
    assert.equal(JSON.stringify(e2Aspects), `[{"classFullName":"BisCore:ExternalSourceAspect","id":"0x26","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"A","kind":"Letter","element":{"id":"0x13","relClassName":"BisCore.ElementOwnsMultiAspects"}},
    {"classFullName":"BisCore:ExternalSourceAspect","id":"0x27","scope":{"id":"0x1","relClassName":"BisCore.ElementScopesExternalSourceIdentifier"},"identifier":"C","kind":"Letter","element":{"id":"0x13","relClassName":"BisCore.ElementOwnsMultiAspects"}}]`.replace(/\s+/g, ""));

    const allA = ExternalSourceAspect.findAllBySource(iVaultDb, scopeId1, kind, "A");
    assert.equal(allA.filter((x) => x.elementId === e1).length, 2, "there are two A's in scope 1 on e1");
    assert.equal(allA.filter((x) => x.elementId === e2).length, 1, "there is one A in scope 1 on e2");
    assert.equal(allA.length, 3);

    const allA2 = ExternalSourceAspect.findAllBySource(iVaultDb, e1, kind, "A");
    assert.equal(allA2.length, 1);
    assert.equal(allA2[0].elementId, e1, "there is one A in scope 2 on e1");

    const allB = ExternalSourceAspect.findAllBySource(iVaultDb, scopeId1, kind, "B");
    assert.equal(allB.length, 1);
    assert.equal(allB[0].elementId, e1, "there is one B on e1");

    const allC = ExternalSourceAspect.findAllBySource(iVaultDb, scopeId1, kind, "C");
    assert.equal(allC.length, 1);
    assert.equal(allC[0].elementId, e2, "there is one C of kind1 on e2");

    const allCK2 = ExternalSourceAspect.findAllBySource(iVaultDb, scopeId1, kind2, "C");
    assert.equal(allCK2.length, 1);
    assert.equal(allCK2[0].elementId, e1, "there is one C of kind 2 on e1");

    assert.equal(ExternalSourceAspect.findAllBySource(iVaultDb, scopeId1, kind, "<notfound>").length, 0);
  });

  it("should create ChannelRootAspect with correct relationship class", async () => {
    const iVaultDb = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("ElementAspect", "ChannelRootAspectTest.dtw"), { rootSubject: { name: "ChannelRootAspectTest" } });

    const testChannelKey = "test-channel";

    // Enable the test channel
    iVaultDb.channels.addAllowedChannel(testChannelKey);

    // Create a channel subject using insertChannelSubject with explicit txn
    const subjectId = withEditTxn(iVaultDb, (txn) => iVaultDb.channels.insertChannelSubject({
      subjectName: "Test Channel Subject",
      channelKey: testChannelKey,
      txn,
    }));
    assert.isTrue(Id64.isValidId64(subjectId), "Subject Id should be valid");

    // Get the ChannelRootAspect
    const aspects = iVaultDb.elements.getAspects(subjectId, "BisCore:ChannelRootAspect");
    assert.equal(aspects.length, 1, "Should be exactly one as it's a unique aspect");

    const aspect = aspects[0];
    assert.exists(aspect);
    assert.equal(aspect.classFullName, "BisCore:ChannelRootAspect", "Aspect class should be ChannelRootAspect");

    // Verify the relationship class
    expect(aspect.element.relClassName).to.equal("BisCore.ElementOwnsChannelRootAspect");
    assert.equal((aspect as any).owner, testChannelKey, "Channel owner should match the channel key");

    // Query the db to confirm the relationship class
    const reader = iVaultDb.createQueryReader("select dm_classname(Element.RelDMClassId) as relClassName from BisCore.ChannelRootAspect");
    expect(await reader.step()).to.be.true;
    expect(reader.current.relClassName).to.equal("BisCore:ElementOwnsChannelRootAspect");

    iVaultDb.close();
  });
});
