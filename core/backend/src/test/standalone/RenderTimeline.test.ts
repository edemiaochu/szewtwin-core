/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Id64, Id64String, OpenMode } from "@szewtwin/core-szewec";
import { Code, IVault, RenderSchedule, RenderTimelineProps } from "@szewtwin/core-common";
import { GenericSchema, IVaultJsFs, RenderTimeline, StandaloneDb } from "../../core-backend";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { withEditTxn } from "../../EditTxn";

describe("RenderTimeline", () => {
  before(() => {
    GenericSchema.registerSchema();
  });

  function makeScriptProps(): RenderSchedule.ScriptProps {
    return [{
      modelId: "0x123",
      elementTimelines: [{
        batchId: 1,
        elementIds: ["0xabc", "0xdef"],
        visibilityTimeline: [{ time: 42, value: 50 }],
      }],
    }];
  }

  function insertTimeline(ivault: StandaloneDb, scriptProps?: RenderSchedule.ScriptProps): Id64String {
    const script = JSON.stringify(scriptProps ?? makeScriptProps());
    const props: RenderTimelineProps = {
      model: IVault.dictionaryId,
      classFullName: RenderTimeline.classFullName,
      code: Code.createEmpty(),
      script,
    };
    return withEditTxn(ivault, (txn) => txn.insertElement(props));
  }

  function createIVault(name: string): StandaloneDb {
    const props = {
      rootSubject: {
        name,
      },
      enableTransactions: true,
    };
    const filename = IVaultTestUtils.prepareOutputFile("RenderTimeline", `${name}.bim`);
    return StandaloneDb.createEmpty(filename, props);
  }

  it("requires BisCore >= 1.0.13", () => {
    const filename = IVaultTestUtils.prepareOutputFile("RenderTimeline.SchemaTooOld", "testIvault.bim");
    const seedFileName = IVaultTestUtils.resolveAssetFile("testIvault.bim");
    IVaultJsFs.copySync(seedFileName, filename);

    const ivault = StandaloneDb.openFile(filename, OpenMode.ReadWrite);
    expect(() => insertTimeline(ivault)).to.throw("dmClass not found");
    ivault.close();
  });

  it("creates, queries, and updates", () => {
    const ivault = createIVault("CRUD");
    const timelineId = insertTimeline(ivault);
    expect(Id64.isValid(timelineId)).to.be.true;

    let timeline = ivault.elements.getElement<RenderTimeline>(timelineId);
    expect(timeline).instanceof(RenderTimeline);
    expect(timeline.scriptProps).to.deep.equal(makeScriptProps());
    expect(timeline.description).to.equal("");

    timeline.description = "My timeline";
    const scriptProps = makeScriptProps();
    scriptProps.push(makeScriptProps()[0]);
    timeline.scriptProps = scriptProps;

    withEditTxn(ivault, (txn) => timeline.update(txn));
    timeline = ivault.elements.getElement<RenderTimeline>(timelineId);
    expect(timeline.description).to.equal("My timeline");
    expect(timeline.scriptProps).to.deep.equal(scriptProps);

    ivault.close();
  });
});


