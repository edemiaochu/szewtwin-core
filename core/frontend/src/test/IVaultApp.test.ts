/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SZEWTwinLocalization } from "@szewtwin/core-i18n";
import { EmptyLocalization } from "@szewtwin/core-common";
import { BasicUnitsProvider, UnitConversionProps, UnitProps } from "@szewtwin/core-quantity";
import { AccuDraw } from "../AccuDraw";
import { IVaultApp, IVaultAppOptions } from "../IVaultApp";
import { MockRender } from "../internal/render/MockRender";
import { IdleTool } from "../tools/IdleTool";
import { SelectionTool } from "../tools/SelectTool";
import { Tool } from "../tools/Tool";
import { PanViewTool, RotateViewTool } from "../tools/ViewTool";
import { SzewecStatus, DbResult, IVaultStatus } from "@szewtwin/core-szewec";

/** class to simulate overriding the default AccuDraw */
class TestAccuDraw extends AccuDraw { }

/** class to simulate overriding the Idle tool */
class TestIdleTool extends IdleTool { }

let testVal1: string;
let testVal2: string;

/** class to test immediate tool */
class TestImmediate extends Tool {
  public static override toolId = "Test.Immediate";
  constructor(val1: string, val2: string) {
    testVal1 = val1;
    testVal2 = val2;
    super();
  }
}

class AnotherImmediate extends Tool {
  public static override toolId = "Test.AnotherImmediate";
}

class ThirdImmediate extends Tool {
  public static override toolId = "Test.ThirdImmediate";
}

class FourthImmediate extends Tool {
  public static override toolId = "Test.FourthImmediate";
}

class TestRotateTool extends RotateViewTool { }
class TestSelectTool extends SelectionTool { }

class TestApp extends MockRender.App {
  public static override async startup(opts?: IVaultAppOptions): Promise<void> {
    opts = opts ? opts : {};
    opts.accuDraw = new TestAccuDraw();
    opts.localization = new SZEWTwinLocalization(this.supplyI18NOptions());
    await MockRender.App.startup(opts);

    const namespace = "TestApp";
    TestImmediate.register(namespace);
    AnotherImmediate.register(namespace);
    ThirdImmediate.register(namespace);
    FourthImmediate.register(namespace);
    TestIdleTool.register();
    TestRotateTool.register();
    TestSelectTool.register();
    IVaultApp.toolAdmin.onInitialized();

    // register an anonymous class with the toolId "Null.Tool"
    const testNull = class extends Tool {
      public static override toolId = "Null.Tool"; public override async run() {
        testVal1 = "fromNullTool";
        return true;
      }
    };
    testNull.register(namespace);
  }

  protected static supplyI18NOptions() { return { urlTemplate: `${window.location.origin}/locales/{{lng}}/{{ns}}.json` }; }
}

describe("IVaultApp", () => {
  beforeAll(async () => {
    await TestApp.startup();
    await IVaultApp.localization.registerNamespace("TestApp");  // we must wait for the localization read to finish.
  });
  afterAll(async () => TestApp.shutdown());

  it("TestApp should override correctly", async () => {
    expect(IVaultApp.accuDraw).toBeInstanceOf(TestAccuDraw);
    expect(IVaultApp.toolAdmin.idleTool).toBeInstanceOf(TestIdleTool);
    expect(await IVaultApp.tools.run("Test.Immediate", "test1", "test2")).toBe(true);
    expect(testVal1).toBe("test1");
    expect(testVal2).toBe("test2");
    expect(await IVaultApp.tools.run("Not.Found")).toBe(false);
    expect(await IVaultApp.tools.run("View.Pan")).toBe(true);
    expect(IVaultApp.toolAdmin.viewTool).toBeInstanceOf(PanViewTool);
    expect(await IVaultApp.tools.run("Null.Tool")).toBe(true);
    expect(testVal1).toBe("fromNullTool");
  });

  it("Should get localized keyin, flyover, and description for tools", async () => {
    expect(TestImmediate.keyin).toBe("Localized TestImmediate Keyin");
    expect(TestImmediate.flyover).toBe("Localized TestImmediate Flyover");
    expect(TestImmediate.description).toBe("Test of an Immediate Command");

    expect(AnotherImmediate.keyin).toBe("Localized AnotherImmediate keyin and flyover");
    expect(AnotherImmediate.flyover).toBe("Localized AnotherImmediate keyin and flyover");
    expect(AnotherImmediate.description).toBe("Another Immediate Command description");

    expect(ThirdImmediate.keyin).toBe("Localized ThirdImmediate Keyin");
    expect(ThirdImmediate.flyover).toBe("ThirdImmediate flyover and description");
    expect(ThirdImmediate.description).toBe("ThirdImmediate flyover and description");

    expect(FourthImmediate.keyin).toBe("Localized FourthImmediate keyin, flyover, and description");
    expect(FourthImmediate.flyover).toBe("Localized FourthImmediate keyin, flyover, and description");
    expect(FourthImmediate.description).toBe("Localized FourthImmediate keyin, flyover, and description");

    // here we are testing to make sure we can override the Select command but the keyin comes from the superclass because the toolId is not overridden
    const selTool = IVaultApp.tools.create("Select")!;
    expect(selTool).toBeInstanceOf(TestSelectTool);
    expect(selTool.keyin).toBe("select elements");
  });

  it("Should do localizations", () => {
    // we have "TrivialTest.Test1" as the key in TestApp.json
    expect(IVaultApp.localization.getLocalizedString("TestApp:TrivialTests.Test1")).toBe("Localized Trivial Test 1");
    expect(IVaultApp.localization.getLocalizedString("TestApp:TrivialTests.Test2")).toBe("Localized Trivial Test 2");
    expect(IVaultApp.localization.getLocalizedString("LocateFailure.NoElements")).toBe("No Elements Found");

    // there is no key for TrivialTest.Test3
    expect(IVaultApp.localization.getLocalizedString("TestApp:TrivialTests.Test3")).toBe("TrivialTests.Test3");

    // Should properly substitute the values in localized strings with interpolations
    expect(IVaultApp.localization.getLocalizedString("TestApp:SubstitutionTests.Test1", { varA: "Variable1", varB: "Variable2" })).toBe("Substitute Variable1 and Variable2");
    expect(IVaultApp.localization.getLocalizedString("TestApp:SubstitutionTests.Test2", { varA: "Variable1", varB: "Variable2" })).toBe("Reverse substitute Variable2 and Variable1");

    expect(IVaultApp.translateStatus(IVaultStatus.AlreadyOpen)).toBe("Already open");
    expect(IVaultApp.translateStatus(IVaultStatus.DuplicateCode)).toBe("Duplicate code");
    expect(IVaultApp.translateStatus(DbResult.BE_SQLITE_ERROR_AlreadyOpen)).toBe("Database already open");
    expect(IVaultApp.translateStatus(SzewecStatus.ERROR)).toBe("Error");
    expect(IVaultApp.translateStatus(SzewecStatus.SUCCESS)).toBe("Success");
    expect(IVaultApp.translateStatus(101)).toBe("DbResult.BE_SQLITE_DONE");
    expect(IVaultApp.translateStatus(11111)).toBe("Status: 11111");
    expect(IVaultApp.translateStatus(undefined as any)).toBe("Illegal value");
  });

  it("Should support WebGL", () => {
    expect(IVaultApp.hasRenderSystem).toBe(true);
    let canvas = document.getElementById("WebGLTestCanvas") as HTMLCanvasElement;
    if (null === canvas) {
      canvas = document.createElement("canvas");
      if (null !== canvas) {
        canvas.id = "WebGLTestCanvas";
        document.body.appendChild(document.createTextNode("WebGL tests"));
        document.body.appendChild(canvas);
      }
    }
    canvas.width = 300;
    canvas.height = 150;
    expect(canvas).not.toBeUndefined();
    if (undefined !== canvas) {
      const context = canvas.getContext("webgl");
      expect(context).not.toBeNull();
      expect(context).not.toBeUndefined();
    }
  });

  it("Should create mock render system without WebGL", () => {
    expect(IVaultApp.hasRenderSystem).toBe(true);
    expect(IVaultApp.renderSystem).toBeInstanceOf(MockRender.System);
  });
});


describe("IVaultApp startup tests", () => {
  afterEach(async () => {
    if (IVaultApp.initialized)
      await IVaultApp.shutdown();
  });

  it("Should normalize path correctly", async () => {
    await IVaultApp.startup({ publicPath: "assets" });
    expect(IVaultApp.publicPath).toBe("assets/");
    await IVaultApp.shutdown();
    await IVaultApp.startup({ publicPath: "assets/" });
    expect(IVaultApp.publicPath).toBe("assets/");
    await IVaultApp.shutdown();
    await IVaultApp.startup();
    expect(IVaultApp.publicPath).toBe("");
    await IVaultApp.shutdown();
  });
});

/**
 * A UnitsProvider that is NOT a BasicUnitsProvider (bypasses the early-exit in resetToUseInternalUnitsProvider)
 * but still delegates to BasicUnitsProvider for correct behaviour.
 */
class NonBundledUnitsProvider {
  private readonly _delegate = new BasicUnitsProvider();
  public async findUnit(unitLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<UnitProps> {
    return this._delegate.findUnit(unitLabel, schemaName, phenomenon, unitSystem);
  }
  public async getUnitsByFamily(phenomenon: string): Promise<UnitProps[]> {
    return this._delegate.getUnitsByFamily(phenomenon);
  }
  public async findUnitByName(name: string): Promise<UnitProps> {
    return this._delegate.findUnitByName(name);
  }
  public async getConversion(fromUnit: UnitProps, toUnit: UnitProps): Promise<UnitConversionProps> {
    return this._delegate.getConversion(fromUnit, toUnit);
  }
}

describe("Shutdown hardening — ToolAdmin and QuantityFormatter", () => {
  afterEach(async () => {
    if (IVaultApp.initialized)
      await IVaultApp.shutdown();
  });

  it("startPrimitiveTool does not emit activeToolChanged after toolAdmin.onShutDown clears _idleTool", async () => {
    await IVaultApp.startup({ localization: new EmptyLocalization() });

    // Simulate the race: onShutDown has cleared _idleTool but IVaultApp is still initialised.
    IVaultApp.toolAdmin.onShutDown();

    let toolChangedEmitted = false;
    const removeListener = IVaultApp.toolAdmin.activeToolChanged.addListener(() => { toolChangedEmitted = true; });

    // Must not throw and must not fire activeToolChanged (no valid idle tool exists).
    await IVaultApp.toolAdmin.startPrimitiveTool(undefined);

    expect(toolChangedEmitted).toBe(false);
    removeListener();
  });

  it("setUnitsProvider does not call startDefaultTool after IVaultApp.shutdown", async () => {
    await IVaultApp.startup({ localization: new EmptyLocalization() });
    const toolAdmin = IVaultApp.toolAdmin;
    const formatter = IVaultApp.quantityFormatter;

    // Install a non-default provider so resetToUseInternalUnitsProvider won't early-exit.
    await formatter.setUnitsProvider(new NonBundledUnitsProvider());

    await IVaultApp.shutdown();

    const startDefaultSpy = vi.spyOn(toolAdmin, "startDefaultTool");

    // Simulates the race: async units-provider reset fires after IVaultApp has shut down.
    await formatter.resetToUseInternalUnitsProvider();

    // startDefaultTool must NOT be called — IVaultApp is no longer initialised.
    expect(startDefaultSpy).not.toHaveBeenCalled();
  });
});