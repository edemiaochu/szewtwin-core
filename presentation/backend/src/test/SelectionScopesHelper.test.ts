/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import { DrawingGraphic, Element, IVaultDb } from "@szewtwin/core-backend";
import { Id64, Id64String } from "@szewtwin/core-szewec";
import { CodeProps, ElementProps, GeometricElement2dProps, ModelProps } from "@szewtwin/core-common";
import { InstanceKey } from "@szewtwin/presentation-common";
import { createTestDMInstanceKey } from "@szewtwin/presentation-common/test-utils";
import { SelectionScopesHelper } from "../presentation-backend/SelectionScopesHelper.js";
import { stubDMSqlReader } from "./Helpers.js";

describe("SelectionScopesHelper", () => {
  describe("getSelectionScopes", () => {
    it("returns expected selection scopes", async () => {
      const result = SelectionScopesHelper.getSelectionScopes();
      expect(result.map((s) => s.id)).to.deep.eq(["element", "assembly", "top-assembly" /* , "category", "model" */]);
    });
  });

  describe("computeSelection", () => {
    let elementIdCounter = 1;
    let ivaultMock: ReturnType<typeof stubIVault>;
    let ivault: IVaultDb;

    function stubIVault() {
      const elements = {
        tryGetElementProps: sinon.stub(),
        tryGetElement: sinon.stub(),
      };
      const models = {
        tryGetModelProps: sinon.stub(),
      };
      return {
        elements,
        models,
        createQueryReader: sinon.stub(),
      };
    }

    const createTestModelProps = (props?: Partial<ModelProps>): ModelProps => ({
      classFullName: "TestSchema:TestClass",
      id: "0x111",
      modeledElement: { relClassName: "TestSchema:TestRelationship", id: props?.id ?? "0x111" },
      ...props,
    });

    const createTestTopmostElementProps = (props?: Partial<ElementProps>): ElementProps => ({
      classFullName: "TestSchema:TestClass",
      code: createTestCode(),
      model: "0x222",
      id: "0x333",
      ...props,
    });

    const createTestElementProps = (parentId?: Id64String): ElementProps => {
      if (!parentId) {
        parentId = "0x444";
      }
      return {
        ...createTestTopmostElementProps(),
        parent: { relClassName: "TestSchema:TestRelationship", id: parentId },
      };
    };

    const createTransientElementId = () => Id64.fromLocalAndBriefcaseIds(159, 0xffffff);

    const createTestCode = (props?: Partial<CodeProps>): CodeProps => ({
      scope: "TestScope",
      spec: "ScopeSpec",
      ...props,
    });

    const setupIVaultForFunctionalKeyQuery = (props: { graphicalElementKey: InstanceKey; functionalElementKey?: InstanceKey }) => {
      const functionalKeyQueryIdentifier = "SELECT funcSchemaDef.Name || '.' || funcClassDef.Name funcElClassName, fe.DMInstanceId funcElId";
      ivaultMock.createQueryReader
        .withArgs(
          sinon.match((q) => typeof q === "string" && q.includes(functionalKeyQueryIdentifier)),
          sinon.match.any,
        )
        .returns(
          stubDMSqlReader([
            {
              funcElClassName: props.functionalElementKey?.className,
              funcElId: props.functionalElementKey?.id,
            },
          ]),
        );
    };

    const setupIVaultForElementProps = (props?: { key?: InstanceKey; parentKey?: InstanceKey }) => {
      const key = props?.key ?? createTestDMInstanceKey({ id: Id64.fromUint32Pair(elementIdCounter++, 999) });
      const elementProps = {
        ...(props?.parentKey ? createTestElementProps(props.parentKey.id) : createTestTopmostElementProps()),
        classFullName: key.className,
        id: key.id,
      };
      ivaultMock.elements.tryGetElementProps.withArgs(key.id).returns(elementProps);
      return { key, props: elementProps };
    };

    const setupIVaultDerivesFromClassQuery = (doesDeriveFromSuppliedClass: boolean) => {
      const classDerivesFromQueryIdentifier = "SELECT 1";
      ivaultMock.createQueryReader
        .withArgs(
          sinon.match((q) => typeof q === "string" && q.includes(classDerivesFromQueryIdentifier)),
          sinon.match.any,
        )
        .returns(stubDMSqlReader(doesDeriveFromSuppliedClass ? [{}] : []));
    };

    beforeEach(() => {
      ivaultMock = stubIVault();
      ivault = ivaultMock as unknown as IVaultDb;
    });

    afterEach(() => {
      elementIdCounter = 1;
      sinon.restore();
    });

    it("throws on invalid scopeId", async () => {
      await expect(SelectionScopesHelper.computeSelection({ ivault, elementIds: [], scope: { id: "invalid" } })).to.eventually.be.rejected;
    });

    describe("scope: 'element'", () => {
      it("returns element keys", async () => {
        const keys = [createTestDMInstanceKey({ id: "0x111" }), createTestDMInstanceKey({ id: "0x222" })];
        keys.forEach((key) => setupIVaultForElementProps({ key }));

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: keys.map((k) => k.id), scope: { id: "element" } });
        expect(result.size).to.eq(2);
        keys.forEach((key) => expect(result.has(key)));
      });

      it("skips non-existing element ids", async () => {
        const keys = [createTestDMInstanceKey()];
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: keys.map((k) => k.id), scope: { id: "element" } });
        expect(result.size).to.eq(0);
      });

      it("skips transient element ids", async () => {
        const keys = [createTestDMInstanceKey(), { className: "any:class", id: createTransientElementId() }];
        setupIVaultForElementProps({ key: keys[0] });

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: keys.map((k) => k.id), scope: { id: "element" } });
        expect(result.size).to.eq(1);
        expect(result.has(keys[0])).to.be.true;
      });

      it("handles invalid id", async () => {
        const validKeys = [createTestDMInstanceKey({ id: "0x111" }), createTestDMInstanceKey({ id: "0x222" })];
        setupIVaultForElementProps({ key: validKeys[0] });
        setupIVaultForElementProps({ key: validKeys[1] });

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [validKeys[0].id, "not an id", validKeys[1].id],
          scope: { id: "element" },
        });
        expect(result.size).to.eq(2);
        validKeys.forEach((key) => expect(result.has(key)));
      });

      it("returns nth parent key", async () => {
        const parent3 = setupIVaultForElementProps({ key: createTestDMInstanceKey() });
        const parent2 = setupIVaultForElementProps({ key: createTestDMInstanceKey(), parentKey: parent3.key });
        const parent1 = setupIVaultForElementProps({ key: createTestDMInstanceKey(), parentKey: parent2.key });
        const element = setupIVaultForElementProps({ key: createTestDMInstanceKey(), parentKey: parent1.key });
        setupIVaultForElementProps({ key: parent2.key });

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [element.key.id],
          scope: { id: "element", ancestorLevel: 2 },
        });
        expect(result.size).to.eq(1);
        expect(result.has(parent2.key)).to.be.true;
      });
    });

    describe("scope: 'assembly'", () => {
      it("returns parent keys", async () => {
        const parentKeys = [createTestDMInstanceKey({ id: "0x111" }), createTestDMInstanceKey({ id: "0x222" })];
        parentKeys.forEach((key) => setupIVaultForElementProps({ key }));
        const elementKeys = parentKeys.map((pk) => setupIVaultForElementProps({ parentKey: pk }).key);
        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: elementKeys.map(({ id }) => id),
          scope: { id: "assembly" },
        });
        expect(result.size).to.eq(2);
        parentKeys.forEach((key) => expect(result.has(key)).to.be.true);
      });

      it("does not duplicate keys", async () => {
        const { key: parentKey } = setupIVaultForElementProps();
        const elementKeys = [setupIVaultForElementProps({ parentKey }).key, setupIVaultForElementProps({ parentKey }).key];
        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: elementKeys.map(({ id }) => id),
          scope: { id: "assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(parentKey)).to.be.true;
      });

      it("returns element key if it has no parent", async () => {
        const key = createTestDMInstanceKey();
        setupIVaultForElementProps({ key });
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [key.id], scope: { id: "assembly" } });
        expect(result.size).to.eq(1);
        expect(result.has(key)).to.be.true;
      });

      it("skips non-existing element ids", async () => {
        const key = createTestDMInstanceKey();
        ivaultMock.elements.tryGetElementProps.withArgs(key.id).returns(undefined);
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [key.id], scope: { id: "assembly" } });
        expect(result.size).to.eq(0);
      });

      it("skips transient element ids", async () => {
        const { key: parentKey } = setupIVaultForElementProps();
        const { key: elementKey } = setupIVaultForElementProps({ parentKey });
        const ids = [elementKey.id, createTransientElementId()];
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: ids, scope: { id: "assembly" } });
        expect(result.size).to.eq(1);
        expect(result.has(parentKey)).to.be.true;
      });
    });

    describe("scope: 'top-assembly'", () => {
      it("returns topmost parent key", async () => {
        const { key: grandparentKey } = setupIVaultForElementProps();
        const { key: parentKey } = setupIVaultForElementProps({ parentKey: grandparentKey });
        const { key: elementKey } = setupIVaultForElementProps({ parentKey });

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementKey.id], scope: { id: "top-assembly" } });
        expect(result.size).to.eq(1);
        expect(result.has(grandparentKey)).to.be.true;
      });

      it("returns element key if it has no parent", async () => {
        const { key } = setupIVaultForElementProps();
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [key.id], scope: { id: "top-assembly" } });
        expect(result.size).to.eq(1);
        expect(result.has(key)).to.be.true;
      });

      it("skips non-existing element ids", async () => {
        const key = createTestDMInstanceKey();
        ivaultMock.elements.tryGetElementProps.withArgs(key.id).returns(undefined);
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [key.id], scope: { id: "top-assembly" } });
        expect(result.size).to.eq(0);
      });

      it("skips transient element ids", async () => {
        const { key: parentKey } = setupIVaultForElementProps();
        const { key: elementKey } = setupIVaultForElementProps({ parentKey });
        const ids = [elementKey.id, createTransientElementId()];
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: ids, scope: { id: "top-assembly" } });
        expect(result.size).to.eq(1);
        expect(result.has(parentKey)).to.be.true;
      });
    });

    describe("scope: 'category'", () => {
      it("returns category key", async () => {
        const category = createTestElementProps();
        const elementId = "0x123";
        const element = {
          id: elementId,
          classFullName: "TestSchema:TestClass",
          model: "0x123",
          category: category.id!,
          code: createTestCode(),
        } as DrawingGraphic;
        ivaultMock.elements.tryGetElement.withArgs(elementId).returns(element);
        ivaultMock.elements.tryGetElementProps.withArgs(category.id!).returns(category);

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "category" } });
        expect(result.size).to.eq(1);
        expect(result.has({ className: category.classFullName, id: element.category })).to.be.true;
      });

      it("skips categories of removed elements", async () => {
        const elementId = "0x123";
        ivaultMock.elements.tryGetElement.withArgs(elementId).returns(undefined);
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "category" } });
        expect(result.isEmpty).to.be.true;
      });

      it("skips removed categories", async () => {
        const categoryId = "0x123";
        const elementId = "0x123";
        const element = {
          id: elementId,
          classFullName: "TestSchema:TestClass",
          model: "0x123",
          category: categoryId,
          code: createTestCode(),
        } as DrawingGraphic;
        ivaultMock.elements.tryGetElement.withArgs(elementId).returns(element);
        ivaultMock.elements.tryGetElementProps.withArgs(categoryId).returns(undefined);

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "category" } });
        expect(result.isEmpty).to.be.true;
      });

      it("skips non-geometric elementProps", async () => {
        const elementId = "0x123";
        const element = {} as Element;
        ivaultMock.elements.tryGetElement.withArgs(elementId).returns(element);

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "category" } });
        expect(result.isEmpty).to.be.true;
      });

      it("skips transient element ids", async () => {
        const category = createTestElementProps();
        const elementId = "0x123";
        const element = {
          id: elementId,
          classFullName: "TestSchema:TestClass",
          model: "0x123",
          category: category.id!,
          code: createTestCode(),
        } as DrawingGraphic;
        ivaultMock.elements.tryGetElement.withArgs(elementId).returns(element);
        ivaultMock.elements.tryGetElementProps.withArgs(category.id!).returns(category);

        const ids = [elementId, createTransientElementId()];
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: ids, scope: { id: "category" } });
        expect(result.size).to.eq(1);
        expect(result.has({ className: category.classFullName, id: element.category })).to.be.true;
      });
    });

    describe("scope: 'model'", () => {
      it("returns model key", async () => {
        const model = createTestModelProps();
        const elementId = "0x123";
        const element = {
          id: elementId,
          classFullName: "TestSchema:TestClass",
          model: model.id!,
          category: "0x123",
          code: createTestCode(),
        } as GeometricElement2dProps;
        ivaultMock.elements.tryGetElementProps.withArgs(elementId).returns(element);
        ivaultMock.models.tryGetModelProps.withArgs(model.id!).returns(model);

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "model" } });
        expect(result.size).to.eq(1);
        expect(result.has({ className: model.classFullName, id: model.id! })).to.be.true;
      });

      it("skips models of removed elements", async () => {
        const elementId = "0x123";
        ivaultMock.elements.tryGetElementProps.withArgs(elementId).returns(undefined);
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "model" } });
        expect(result.isEmpty).to.be.true;
      });

      it("skips removed models", async () => {
        const modelId = "0x123";
        const elementId = "0x123";
        const element = {
          id: elementId,
          classFullName: "TestSchema:TestClass",
          model: modelId,
          category: "0x123",
          code: createTestCode(),
        } as GeometricElement2dProps;
        ivaultMock.elements.tryGetElementProps.withArgs(elementId).returns(element);
        ivaultMock.models.tryGetModelProps.withArgs(modelId).returns(undefined);

        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: [elementId], scope: { id: "model" } });
        expect(result.isEmpty).to.be.true;
      });

      it("skips transient element ids", async () => {
        const model = createTestModelProps();
        const elementId = "0x123";
        const element = {
          id: elementId,
          classFullName: "TestSchema:TestClass",
          model: model.id!,
          category: "0x123",
          code: createTestCode(),
        } as GeometricElement2dProps;
        ivaultMock.elements.tryGetElementProps.withArgs(elementId).returns(element);
        ivaultMock.models.tryGetModelProps.withArgs(model.id!).returns(model);

        const ids = [elementId, createTransientElementId()];
        const result = await SelectionScopesHelper.computeSelection({ ivault, elementIds: ids, scope: { id: "model" } });
        expect(result.size).to.eq(1);
        expect(result.has({ className: model.classFullName, id: model.id! })).to.be.true;
      });
    });

    describe("scope: 'functional-element'", () => {
      it("returns GeometricElement3d key if it doesn't have an associated functional element or parent", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns functional element key if GeometricElement3d has an associated functional element", async () => {
        const functionalElementKey = createTestDMInstanceKey({ id: "0x111" });
        const graphicalElementKey = createTestDMInstanceKey({ id: "0x222" });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-element" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("returns GeometricElement2d key if it doesn't have an associated functional element or parent", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns GeometricElement2d key if it has parents but none of them have related functional elements", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-element" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns functional element key if GeometricElement2d has an associated functional element", async () => {
        const functionalElementKey = createTestDMInstanceKey({ id: "0x111" });
        const graphicalElementKey = createTestDMInstanceKey({ id: "0x222" });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-element" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("returns functional element key of the first GeometricElement2d parent that has related functional element", async () => {
        const functionalElementKey = createTestDMInstanceKey();
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-element" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("skips transient element ids", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id, createTransientElementId()],
          scope: { id: "functional-element" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });
    });

    describe("scope: 'functional-assembly'", () => {
      it("returns GeometricElement3d key if it doesn't have a parent", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns GeometricElement3d parent key if it doesn't have a related functional element", async () => {
        const { key: graphicalParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalParentElementKey)).to.be.true;
      });

      it("returns functional element key of GeometricElement3d parent", async () => {
        const functionalElementKey = createTestDMInstanceKey();
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("returns GeometricElement2d key if it doesn't have an associated functional element or parent", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns first GeometricElement2d parent key if none of the parents have an associated functional element", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalParentElementKey)).to.be.true;
      });

      it("returns functional element key of the first GeometricElement2d parent that has a related functional element and the functional element has no parent", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        const { key: functionalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("returns functional parent element key of the first GeometricElement2d parent that has a related functional element", async () => {
        const { key: graphicalParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        const { key: functionalParentElementKey } = setupIVaultForElementProps();
        const { key: functionalElementKey } = setupIVaultForElementProps({ parentKey: functionalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalParentElementKey)).to.be.true;
      });
    });

    describe("scope: 'functional-top-assembly'", () => {
      it("returns GeometricElement3d key if it doesn't have a parent", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns topmost GeometricElement3d parent key if it doesn't have a related functional element", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalGrandParentElementKey)).to.be.true;
      });

      it("returns functional element key of the topmost GeometricElement3d parent", async () => {
        const functionalElementKey = createTestDMInstanceKey();
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(true);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("returns GeometricElement2d key if it doesn't have an associated functional element or parent", async () => {
        const { key: graphicalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalElementKey)).to.be.true;
      });

      it("returns topmost GeometricElement2d parent key if none of the parents have an associated functional element", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(graphicalGrandParentElementKey)).to.be.true;
      });

      it("returns functional element key of the first GeometricElement2d parent that has a related functional element and the functional element has no parent", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        const { key: functionalElementKey } = setupIVaultForElementProps();
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalElementKey)).to.be.true;
      });

      it("returns functional topmost parent element key of the first GeometricElement2d parent that has a related functional element", async () => {
        const { key: graphicalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: graphicalParentElementKey } = setupIVaultForElementProps({ parentKey: graphicalGrandParentElementKey });
        const { key: graphicalElementKey } = setupIVaultForElementProps({ parentKey: graphicalParentElementKey });
        const { key: functionalGrandParentElementKey } = setupIVaultForElementProps();
        const { key: functionalParentElementKey } = setupIVaultForElementProps({ parentKey: functionalGrandParentElementKey });
        const { key: functionalElementKey } = setupIVaultForElementProps({ parentKey: functionalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalParentElementKey });
        setupIVaultForFunctionalKeyQuery({ graphicalElementKey: graphicalGrandParentElementKey, functionalElementKey });
        setupIVaultDerivesFromClassQuery(false);

        const result = await SelectionScopesHelper.computeSelection({
          ivault,
          elementIds: [graphicalElementKey.id],
          scope: { id: "functional-top-assembly" },
        });
        expect(result.size).to.eq(1);
        expect(result.has(functionalGrandParentElementKey)).to.be.true;
      });
    });
  });
});
