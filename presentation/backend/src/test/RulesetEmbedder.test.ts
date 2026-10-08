/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import sinon from "sinon";
import { _nativeDb, BisCoreSchema, DefinitionModel, DefinitionPartition, EditTxn, IVaultDb, KnownLocations, Subject } from "@szewtwin/core-backend";
import { Id64String } from "@szewtwin/core-szewec";
import { BisCodeSpec, Code, CodeScopeSpec, CodeSpec, IVault, QueryBinder, QueryRowFormat } from "@szewtwin/core-common";
import { Ruleset } from "@szewtwin/presentation-common";
import { PresentationRules } from "../presentation-backend/domain/PresentationRulesDomain.js";
import * as RulesetElements from "../presentation-backend/domain/RulesetElements.js";
import { RulesetEmbedder } from "../presentation-backend/RulesetEmbedder.js";
import { normalizeVersion } from "../presentation-backend/Utils.js";
import { stubDMSqlReader } from "./Helpers.js";

describe("RulesetEmbedder", () => {
  const sandbox = sinon.createSandbox();
  let embedder: RulesetEmbedder;

  // ids
  const rootSubjectId = "0x1";
  const presentationRulesSubjectId = "0x123";
  const definitionPartitionId = "0x456";
  const modelId = "0x789";

  const rulesetCodeSpec = CodeSpec.create({} as unknown as IVault, PresentationRules.CodeSpec.Ruleset, CodeScopeSpec.Type.Model);
  const subjectCodeSpec = createCodeSpecWithId({ id: "0x999", specName: BisCodeSpec.subject, scopeType: CodeScopeSpec.Type.ParentElement });
  const informationPartitionCodeSpec = createCodeSpecWithId({
    id: "0x888",
    specName: BisCodeSpec.informationPartitionElement,
    scopeType: CodeScopeSpec.Type.ParentElement,
  });

  // elements/models
  const rootSubjectMock = {
    insert: sandbox.stub().returns(rootSubjectId),
    id: rootSubjectId,
    model: modelId,
  };
  const presentationRulesSubjectMock = {
    insert: sandbox.stub().returns(presentationRulesSubjectId),
    id: presentationRulesSubjectId,
    model: modelId,
  };
  const definitionPartitionMock = {
    insert: sandbox.stub().returns(definitionPartitionId),
    id: definitionPartitionId,
    model: modelId,
  };
  const rulesetModelMock = {
    insert: sandbox.stub().returns(modelId),
    id: modelId,
    model: modelId,
  };

  let ivaultMock: ReturnType<typeof stubIVault>;
  let ivault: IVaultDb;
  let txnMock: ReturnType<typeof stubEditTxn>;

  const onEntityUpdate = {
    onBeforeUpdate: sandbox.spy(),
    onAfterUpdate: sandbox.spy(),
  };

  const onEntityInsert = {
    onBeforeInsert: sandbox.spy(),
    onAfterInsert: sandbox.spy(),
  };

  beforeEach(async () => {
    sandbox.stub(KnownLocations, "nativeAssetsDir").get(() => "");
    BisCoreSchema.registerSchema();

    txnMock = stubEditTxn();
    ivaultMock = stubIVault();
    ivault = ivaultMock as unknown as IVaultDb;

    rootSubjectMock.insert.returns(rootSubjectId);
    presentationRulesSubjectMock.insert.returns(presentationRulesSubjectId);
    definitionPartitionMock.insert.returns(definitionPartitionId);
    rulesetModelMock.insert.returns(modelId);

    rulesetCodeSpec.iVault = ivault;
    subjectCodeSpec.iVault = ivault;
    informationPartitionCodeSpec.iVault = ivault;

    embedder = new RulesetEmbedder({ ivault });
  });

  afterEach(() => {
    sandbox.reset();
  });

  function createCodeSpecWithId(props: { id: Id64String; specName: string; scopeType: CodeScopeSpec.Type }): CodeSpec {
    const { id, specName, scopeType } = props;
    const spec = CodeSpec.create({} as unknown as IVault, specName, scopeType);
    spec.id = id;
    return spec;
  }

  function stubIVault() {
    const mock = {
      containsClass: sandbox.stub().returns(false),
      importSchemas: sandbox.stub().resolves(undefined),
      createQueryReader: sandbox.stub(),
      codeSpecs: {
        getByName: sandbox.stub(),
        hasName: sandbox.stub().returns(false),
        insert: sandbox.stub().returns(""),
      },
      elements: {
        createElement: sandbox.stub(),
        getElement: sandbox.stub(),
        tryGetElement: sandbox.stub(),
      },
      models: {
        createModel: sandbox.stub(),
        getSubModel: sandbox.stub(),
      },
    };

    mock.codeSpecs.getByName.withArgs(PresentationRules.CodeSpec.Ruleset).returns(rulesetCodeSpec);
    mock.codeSpecs.getByName.withArgs(BisCodeSpec.subject).returns(subjectCodeSpec);
    mock.codeSpecs.getByName.withArgs(BisCodeSpec.informationPartitionElement).returns(informationPartitionCodeSpec);
    mock.elements.getElement.withArgs(IVault.rootSubjectId).returns(rootSubjectMock);

    return mock;
  }

  function stubEditTxn() {
    const insertElement = sinon.stub(EditTxn.prototype, "insertElement");
    const updateElement = sinon.stub(EditTxn.prototype, "updateElement");
    const deleteElement = sinon.stub(EditTxn.prototype, "deleteElement");
    const start = sinon.stub(EditTxn.prototype, "start");
    const end = sinon.stub(EditTxn.prototype, "end");
    return { insertElement, updateElement, deleteElement, start, end };
  }

  function setupMocksForHandlingPrerequisites() {
    ivaultMock.codeSpecs.insert.returns("0x2025");
  }

  function setupMocksForGettingRulesetModel() {
    ivaultMock.containsClass.withArgs(RulesetElements.Ruleset.classFullName).returns(true);
    ivaultMock.models.getSubModel.withArgs(definitionPartitionId).returns(rulesetModelMock);
    ivaultMock.elements.tryGetElement
      .withArgs(new Code({ spec: subjectCodeSpec.id, scope: rootSubjectId, value: "PresentationRules" }))
      .returns(presentationRulesSubjectMock);
    ivaultMock.elements.tryGetElement
      .withArgs(DefinitionPartition.createCode(ivault, presentationRulesSubjectId, "PresentationRules"))
      .returns(definitionPartitionMock);
  }

  function setupMocksForCreatingRulesetModel() {
    ivaultMock.containsClass.withArgs(RulesetElements.Ruleset.classFullName).returns(true);
    ivaultMock.elements.tryGetElement.withArgs(new Code({ spec: subjectCodeSpec.id, scope: rootSubjectId, value: "PresentationRules" })).returns(undefined);
    ivaultMock.elements.getElement.withArgs(presentationRulesSubjectId).returns(presentationRulesSubjectMock);
    ivaultMock.elements.getElement.withArgs(definitionPartitionId).returns(definitionPartitionMock);

    const createSubjectProps = {
      classFullName: Subject.classFullName,
      model: modelId,
      code: new Code({
        spec: subjectCodeSpec.id,
        scope: rootSubjectId,
        value: "PresentationRules",
      }),
      parent: {
        id: rootSubjectId,
        relClassName: "BisCore:SubjectOwnsSubjects",
      },
    };
    ivaultMock.elements.createElement.withArgs(createSubjectProps).returns(presentationRulesSubjectMock);

    const createPartitionProps = {
      parent: {
        id: presentationRulesSubjectId,
        relClassName: "BisCore:SubjectOwnsPartitionElements",
      },
      model: modelId,
      code: DefinitionPartition.createCode(ivault, presentationRulesSubjectId, "PresentationRules"),
      classFullName: DefinitionPartition.classFullName,
    };
    ivaultMock.elements.createElement.withArgs(createPartitionProps).returns(definitionPartitionMock);

    const createModelProps = {
      modeledElement: definitionPartitionMock,
      name: "PresentationRules",
      classFullName: DefinitionModel.classFullName,
      isPrivate: true,
    };
    ivaultMock.models.createModel.withArgs(createModelProps).returns(rulesetModelMock);
  }

  function setupMocksForQueryingExistingRulesets(rulesetId: string, rulesets: Array<{ ruleset: Ruleset; elementId: Id64String }>) {
    const results = rulesets.map((entry) => ({
      id: entry.elementId,
      jsonProperties: JSON.stringify({ jsonProperties: entry.ruleset }),
      normalizedVersion: normalizeVersion(entry.ruleset.version),
    }));
    ivaultMock.createQueryReader
      .withArgs(sinon.match.any, QueryBinder.from({ rulesetId }), { rowFormat: QueryRowFormat.UseJsPropertyNames })
      .returns(stubDMSqlReader(results));
  }

  function setupMocksForInsertingNewRuleset(ruleset: Ruleset, rulesetElementId: string) {
    const definitionElementMock = {
      id: rulesetElementId,
      insert: sandbox.stub().returns(rulesetElementId),
    };
    ivaultMock.elements.createElement
      .withArgs({
        model: modelId,
        code: RulesetElements.Ruleset.createRulesetCode(ivault, modelId, ruleset),
        classFullName: RulesetElements.Ruleset.classFullName,
        jsonProperties: { jsonProperties: ruleset },
      })
      .returns(definitionElementMock);
    ivaultMock.elements.getElement.withArgs(rulesetElementId).returns(definitionElementMock);
  }

  describe("insertRuleset", () => {
    it("sets up prerequisites when inserting element", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForHandlingPrerequisites();
      setupMocksForCreatingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);
      ivaultMock.containsClass.withArgs(RulesetElements.Ruleset.classFullName).returns(false);

      await embedder.insertRuleset(ruleset);

      expect(ivaultMock.codeSpecs.insert).to.be.calledOnce;
      expect(rulesetModelMock.insert).to.be.calledOnce;
      expect(ivaultMock.importSchemas).to.be.calledOnce;
    });

    it("sets up prerequisites when inserting element and prerequisites are partially available", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      // mock that ruleset schema is present
      ivaultMock.containsClass.withArgs(RulesetElements.Ruleset.classFullName).returns(true);
      // mock that ruleset CodeSpec is not present
      ivaultMock.codeSpecs.hasName.withArgs(PresentationRules.CodeSpec.Ruleset).returns(false);
      ivaultMock.codeSpecs.insert.returns("0x2025");

      setupMocksForCreatingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      await embedder.insertRuleset(ruleset);

      expect(ivaultMock.codeSpecs.insert).to.be.calledOnce;
      expect(rulesetModelMock.insert).to.be.calledOnce;
      expect(ivaultMock.importSchemas).to.not.have.been.called;
    });

    it("calls `onElementInsert` and `onModelInsert` callbacks when creating RulesetModel", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForCreatingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      await embedder.insertRuleset(ruleset, { onEntityInsert });

      expect(onEntityInsert.onBeforeInsert.callCount).to.eq(4);
      expect(onEntityInsert.onAfterInsert.callCount).to.eq(4);
    });

    it("inserts a single ruleset", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { onEntityInsert });
      expect(insertId).to.eq(rulesetElementId);
      expect(onEntityInsert.onBeforeInsert).to.have.been.calledOnce;
      expect(onEntityInsert.onAfterInsert).to.have.been.calledOnce;
    });

    it("inserts into model under specified parent subject id", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };
      const parentSubjectId = "0x111";
      const rulesetElementId = "0x222";

      ivaultMock.elements.getElement.withArgs(parentSubjectId).returns(rootSubjectMock);
      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      embedder = new RulesetEmbedder({ ivault, parentSubjectId });
      const insertId = await embedder.insertRuleset(ruleset, { onEntityInsert });
      expect(insertId).to.eq(rulesetElementId);
      expect(onEntityInsert.onBeforeInsert).to.be.calledOnce;
      expect(onEntityInsert.onAfterInsert).to.be.calledOnce;
    });

    it("creates missing subject, partition and model under specified parent subject id", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };
      const parentSubjectId = "0x111";
      const rulesetElementId = "0x222";

      ivaultMock.elements.getElement.withArgs(parentSubjectId).returns(rootSubjectMock);
      setupMocksForCreatingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      embedder = new RulesetEmbedder({ ivault, parentSubjectId });
      const insertId = await embedder.insertRuleset(ruleset, { onEntityInsert });
      expect(insertId).to.eq(rulesetElementId);
      expect(onEntityInsert.onBeforeInsert).to.have.callCount(4);
      expect(onEntityInsert.onAfterInsert).to.have.callCount(4);
    });

    it("throws error if specified parent subject id is not found", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };
      const parentSubjectId = "0x111";
      const rulesetElementId = "0x222";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      embedder = new RulesetEmbedder({ ivault, parentSubjectId });
      await expect(embedder.insertRuleset(ruleset, { onEntityInsert })).to.be.rejected;
      expect(onEntityInsert.onBeforeInsert).not.to.be.called;
      expect(onEntityInsert.onAfterInsert).not.to.be.called;
    });

    it("skips inserting ruleset with same id", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset,
          elementId: rulesetElementId,
        },
      ]);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id" });
      expect(insertId).to.eq(rulesetElementId);
      expect(txnMock.insertElement).to.not.have.been.called;
    });

    it("doesn't skip inserting ruleset with different id", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id" });
      expect(insertId).to.eq(rulesetElementId);
    });

    it("skips inserting ruleset with same id and version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset,
          elementId: rulesetElementId,
        },
      ]);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-eq" });
      expect(insertId).to.eq(rulesetElementId);
      expect(txnMock.insertElement).to.not.have.been.called;
    });

    it("doesn't skip inserting ruleset with same id and different version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset: { ...ruleset, version: "4.5.6" },
          elementId: "0x456",
        },
      ]);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-eq" });
      expect(insertId).to.eq(rulesetElementId);
    });

    it("skips inserting ruleset with same id and lower version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset: { id: "test", version: "1.2.3", rules: [] },
          elementId: "0x111",
        },
        {
          ruleset: { id: "test", version: "4.5.6", rules: [] },
          elementId: "0x222",
        },
        {
          ruleset: { id: "test", version: "7.8.9", rules: [] },
          elementId: "0x333",
        },
      ]);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-gte" });
      expect(insertId).to.eq("0x333");
      expect(txnMock.insertElement).to.not.have.been.called;
    });

    it("doesn't skip inserting ruleset with same id and higher version", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };
      const rulesetElementId = "0x222";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset: { id: "test", version: "1.2.3", rules: [] },
          elementId: "0x111",
        },
      ]);
      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-gte" });
      expect(insertId).to.eq(rulesetElementId);
    });

    it("updates a duplicate ruleset with same id and version", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset,
          elementId: rulesetElementId,
        },
      ]);

      const rulesetElementMock = { id: rulesetElementId, update: sandbox.stub(), jsonProperties: {} };
      ivaultMock.elements.tryGetElement.withArgs(rulesetElementId).returns(rulesetElementMock);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "never", replaceVersions: "exact", onEntityUpdate });
      expect(insertId).to.eq(rulesetElementId);
      expect(rulesetElementMock.update).to.be.calledOnce;
      expect(onEntityUpdate.onBeforeUpdate).to.have.been.calledOnce;
      expect(onEntityUpdate.onAfterUpdate).to.have.been.calledOnce;
    });

    it("removes rulesets with same id", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x111";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset: { ...ruleset, version: "4.5.6" },
          elementId: "0x222",
        },
        {
          ruleset: { ...ruleset, version: "7.8.9" },
          elementId: "0x333",
        },
      ]);

      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { replaceVersions: "all" });
      expect(insertId).to.eq(rulesetElementId);
      expect(txnMock.deleteElement).to.be.calledOnce;
      expect(txnMock.deleteElement).to.be.calledWithExactly(["0x222", "0x333"]);
    });

    it("removes older rulesets with same id", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };
      const rulesetElementId = "0x222";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [
        {
          ruleset: { ...ruleset, version: "1.2.3" },
          elementId: "0x111",
        },
        {
          ruleset: { ...ruleset, version: "7.8.9" },
          elementId: "0x333",
        },
      ]);

      setupMocksForInsertingNewRuleset(ruleset, rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { replaceVersions: "all-lower" });
      expect(insertId).to.eq(rulesetElementId);
      expect(txnMock.deleteElement).to.be.calledOnce;
      expect(txnMock.deleteElement).to.be.calledWithExactly(["0x111"]);
    });
  });

  describe("getRulesets", () => {
    function setupMocksForQueryingAllRulesets(rulesets: Array<{ ruleset: Ruleset; elementId: Id64String }>) {
      rulesets.forEach((entry) => {
        const rulesetElementMock = { jsonProperties: { jsonProperties: entry.ruleset } };
        ivaultMock.elements.getElement.withArgs({ id: entry.elementId }).returns(rulesetElementMock);
      });
      ivaultMock.createQueryReader.withArgs(sinon.match.string).returns(stubDMSqlReader(rulesets.map((r) => ({ id: r.elementId }))));
    }

    it("checks for prerequisites before getting rulesets", async () => {
      ivaultMock.containsClass.withArgs(RulesetElements.Ruleset.classFullName).returns(false);
      const rulesets = await embedder.getRulesets();
      expect(rulesets.length).to.eq(0);
    });

    it("returns embedded rulesets", async () => {
      const ruleset1: Ruleset = { id: "test1", rules: [] };
      const ruleset2: Ruleset = { id: "test2", rules: [] };

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingAllRulesets([
        {
          ruleset: ruleset1,
          elementId: "0x123",
        },
        {
          ruleset: ruleset2,
          elementId: "0x456",
        },
      ]);
      const rulesets = await embedder.getRulesets();
      expect(rulesets).to.deep.eq([ruleset1, ruleset2]);
    });
  });
});
