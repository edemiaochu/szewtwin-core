/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "@szewec/icons-generic-webfont/dist/szewec-icons-generic-webfont.css";
import { GuidString, ProcessDetector } from "@szewtwin/core-szewec";
import { ElectronApp, ElectronAppOpts } from "@szewtwin/core-electron/lib/cjs/ElectronFrontend";
import { BrowserAuthorizationClient } from "@szewtwin/browser-authorization";
import { FrontendIVaultsAccess } from "@szewtwin/ivaults-access-frontend";
import { IVaultsClient } from "@szewtwin/ivaults-client-management";
import { FrontendDevTools } from "@szewtwin/frontend-devtools";
import { HyperModeling } from "@szewtwin/hypermodeling-frontend";
import {
  SzewecCloudRpcManager, SzewecCloudRpcParams, IVaultReadRpcInterface, IVaultTileRpcInterface,
} from "@szewtwin/core-common";
import { EditTools } from "@szewtwin/editor-frontend";
import {
  AccuDrawHintBuilder, AccuDrawViewportUI, AccuSnap, IVaultApp, IVaultConnection, IpcApp, LocalhostIpcApp, LocalHostIpcAppOpts, RenderSystem, SelectionTool,
  SnapMode, TileAdmin, Tool, ToolAdmin,
  ViewManager,
} from "@szewtwin/core-frontend";
import { MobileApp, MobileAppOpts } from "@szewtwin/core-mobile/lib/cjs/MobileFrontend";
import { RealityDataAccessClient, RealityDataClientOptions } from "@szewtwin/reality-data-client";
import { DtaConfiguration } from "../common/DtaConfiguration";
import { dtaChannel, DtaIpcInterface } from "../common/DtaIpcInterface";
import { DtaRpcInterface } from "../common/DtaRpcInterface";
import { ToggleAspectRatioSkewDecoratorTool } from "./AspectRatioSkewDecorator";
import { ApplyModelDisplayScaleTool } from "./DisplayScale";
import { ApplyModelTransformTool, ClearModelTransformsTool, DisableModelTransformsTool } from "./DisplayTransform";
import { ApplyModelClipTool } from "./ModelClipTools";
import { GenerateElementGraphicsTool, GenerateTileContentTool } from "./TileContentTool";
import { ViewClipByElementGeometryTool } from "./ViewClipByElementGeometryTool";
import { DisplayTestAppShortcutsUI, DrawingAidTestTool } from "./DrawingAidTestTool";
import { EditingScopeTool, MoveElementTool, PlaceLineStringTool, SetEditorToolSettingsTool } from "./EditingTools";
import { DynamicClassifierTool, DynamicClipMaskTool } from "./DynamicClassifierTool";
import { FenceClassifySelectedTool } from "./Fence";
import { RecordFpsTool } from "./FpsMonitor";
import { FrameStatsTool } from "./FrameStatsTool";
import { ChangeGridSettingsTool } from "./Grid";
import { IncidentMarkerDemoTool } from "./IncidentMarkerDemo";
import { MarkupSelectTestTool } from "./MarkupSelectTestTool";
import { Notifications } from "./Notifications";
import { OutputShadersTool } from "./OutputShadersTool";
import { PathDecorationTestTool } from "./PathDecorationTest";
import { GltfDecorationTool } from "./GltfDecoration";
import { TextDecorationTool } from "./TextDecoration";
import { ToggleShadowMapTilesTool } from "./ShadowMapDecoration";
import { signIn, signOut } from "./signIn";
import {
  CloneViewportTool, CloseIVaultTool, CloseWindowTool, CreateWindowTool, DockWindowTool, FocusWindowTool, MaximizeWindowTool, NewIVaultTool, OpenIVaultTool,
  ReopenIVaultTool, ResizeWindowTool, RestoreWindowTool, Surface,
} from "./Surface";
import { CreateSectionDrawingTool } from "./CreateSectionDrawingTool";
import { SyncViewportFrustaTool, SyncViewportsTool } from "./SyncViewportsTool";
import { TimePointComparisonTool } from "./TimePointComparison";
import { UiManager } from "./UiManager";
import { MarkupTool, ModelClipTool, ZoomToSelectedElementsTool } from "./Viewer";
import { MacroTool } from "./MacroTools";
import { RecordTileSizesTool } from "./TileSizeRecorder";
import { TerrainDrapeTool } from "./TerrainDrapeTool";
import { SaveImageTool } from "./SaveImageTool";
import { ToggleSecondaryIVaultTool } from "./TiledGraphics";
import { BingTerrainMeshProvider } from "./BingTerrainProvider";
import { AttachCustomRealityDataTool, registerRealityDataSourceProvider } from "./RealityDataProvider";
import { MapLayersFormats } from "@szewtwin/map-layers-formats";
import { OpenRealityModelSettingsTool } from "./RealityModelDisplaySettingsWidget";
import { ElectronRendererAuthorization } from "@szewtwin/electron-authorization/Renderer";
import { SZEWTwinLocalization } from "@szewtwin/core-i18n";
import { getConfigurationString } from "./DisplayTestApp";
import { AddSeequentRealityModel } from "./RealityDataModel";
import { SchemaFormatsProvider } from "@szewtwin/dmschema-metadata";
import { DMSchemaRpcInterface } from '@szewtwin/dmschema-rpcinterface-common';

class DisplayTestAppAccuSnap extends AccuSnap {
  private readonly _activeSnaps: SnapMode[] = [SnapMode.NearestKeypoint];
  private _snapModeOverride?: SnapMode;

  public override get keypointDivisor() {
    return 2;
  }

  /** Called after a button event or whenever a new tool is installed. */
  public override synchSnapMode(): void {
    this._snapModeOverride = undefined;
  }

  public override getActiveSnapModes(): SnapMode[] {
    if (undefined === this._snapModeOverride)
      return this._activeSnaps;

    return [this._snapModeOverride];
  }

  public setActiveSnapModes(snaps: SnapMode[]): void {
    this._activeSnaps.length = snaps.length;
    for (let i = 0; i < snaps.length; i++)
      this._activeSnaps[i] = snaps[i];
  }

  /** Demonstrate how to override the active snap mode(s) for the next button event only.
   * Calling with undefined or the same value as the current override can be used to restore the original snap mode(s).
   * @note Should also update the UI to indicate when an override is active...
   */
  public setSnapModeOverride(snap?: SnapMode): void {
    this._snapModeOverride = (snap === this._snapModeOverride ? undefined : snap);
    IVaultApp.accuSnap.clear();
  }
}

class DisplayTestAppToolAdmin extends ToolAdmin {
  private _shortcuts?: DisplayTestAppShortcutsUI;

  /** Process shortcut key events */
  public override async processShortcutKey(keyEvent: KeyboardEvent, wentDown: boolean): Promise<boolean> {
    if (!wentDown || !AccuDrawHintBuilder.isEnabled)
      return false;

    if (undefined === this._shortcuts) {
      this._shortcuts = new DisplayTestAppShortcutsUI();
      this._shortcuts.populateDefaultShortcuts();
    }

    return this._shortcuts.processShortcutKey(keyEvent);
  }
}

class SVTSelectionTool extends SelectionTool {
  public static override toolId = "SVTSelect";
  protected override initSelectTool() {
    super.initSelectTool();

    // ###TODO Want to do this only if version comparison enabled, but meh.
    IVaultApp.locateManager.options.allowExternalIVaults = true;
  }
}

class SignInTool extends Tool {
  public static override toolId = "SignIn";
  public override async run(): Promise<boolean> {
    await signIn();
    return true;
  }
}

class SignOutTool extends Tool {
  public static override toolId = "SignOut";
  public override async run(): Promise<boolean> {
    await signOut();
    return true;
  }
}

class PushChangesTool extends Tool {
  public static override toolId = "PushChanges";
  public static override get maxArgs() { return 1; }
  public static override get minArgs() { return 1; }

  public override async run(description?: string): Promise<boolean> {
    if (!description || "string" !== typeof description)
      return false;

    const ivault = IVaultApp.viewManager.selectedView?.iVault;
    if (!ivault || !ivault.isBriefcaseConnection())
      return false;

    await ivault.pushChanges(description);
    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    return this.run(args[0]);
  }
}

class PullChangesTool extends Tool {
  public static override toolId = "PullChanges";

  public override async run(): Promise<boolean> {
    const ivault = IVaultApp.viewManager.selectedView?.iVault;
    if (!ivault || !ivault.isBriefcaseConnection())
      return false;

    await ivault.pullChanges();
    return true;
  }
}

export const dtaIpc = IpcApp.makeIpcProxy<DtaIpcInterface>(dtaChannel);

class RefreshTilesTool extends Tool {
  public static override toolId = "RefreshTiles";
  public static override get maxArgs() { return undefined; }

  public override async run(changedModelIds?: string[]): Promise<boolean> {
    if (undefined !== changedModelIds && 0 === changedModelIds.length)
      changedModelIds = undefined;

    IVaultApp.viewManager.refreshForModifiedModels(changedModelIds);
    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    return this.run(args);
  }
}

class PurgeTileTreesTool extends Tool {
  public static override toolId = "PurgeTileTrees";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return undefined; }

  public override async run(modelIds?: string[]): Promise<boolean> {
    const vp = IVaultApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    if (undefined !== modelIds && 0 === modelIds.length)
      modelIds = undefined;

    await vp.iVault.tiles.purgeTileTrees(modelIds);
    IVaultApp.viewManager.refreshForModifiedModels(modelIds);

    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    return this.run(args);
  }
}

class ShutDownTool extends Tool {
  public static override toolId = "ShutDown";

  public override async run(_args: any[]): Promise<boolean> {
    DisplayTestApp.surface.closeAllViewers();
    const app = ElectronApp.isValid ? ElectronApp : IVaultApp;
    await app.shutdown();

    debugger; // eslint-disable-line no-debugger
    return true;
  }
}

class ExitTool extends Tool {
  public static override toolId = "Exit";

  public override async run(_args: any[]): Promise<boolean> {
    DisplayTestApp.surface.closeAllViewers();
    await DtaRpcInterface.getClient().terminate();
    return true;
  }
}

function createHubAccess(configuration: DtaConfiguration) {
  if (configuration.urlPrefix) {
    return new FrontendIVaultsAccess(new IVaultsClient({ api: { baseUrl: `https://${configuration.urlPrefix}api.szewec.com/ivaults` } }));
  } else {
    return new FrontendIVaultsAccess();
  }
}

export class DisplayTestApp {
  private static _surface?: Surface;
  public static get surface() { return this._surface!; }
  public static set surface(surface: Surface) { this._surface = surface; }
  private static _szewTwinId?: GuidString;
  public static get szewTwinId(): GuidString | undefined { return this._szewTwinId; }

  public static async startup(configuration: DtaConfiguration, renderSys: RenderSystem.Options | RenderSystem, tileAdmin: TileAdmin.Props, viewManager?: ViewManager): Promise<void> {
    let socketUrl = new URL(configuration.customOrchestratorUri || "http://localhost:3001");
    socketUrl = LocalhostIpcApp.buildUrlForSocket(socketUrl);
    const realityDataClientOptions: RealityDataClientOptions = {
      /** API Version. v1 by default */
      // version?: ApiVersion;
      /** API Url. Used to select environment. Defaults to "https://api.szewec.com/reality-management/reality-data" */
      baseUrl: `https://${import.meta.env.IVJS_URL_PREFIX ?? ""}api.szewec.com`,
    };
    const opts: ElectronAppOpts | LocalHostIpcAppOpts = {
      iVaultApp: {
        accuDraw: new AccuDrawViewportUI(),
        accuSnap: new DisplayTestAppAccuSnap(),
        notifications: new Notifications(),
        tileAdmin,
        toolAdmin: new DisplayTestAppToolAdmin(),
        uiAdmin: new UiManager(),
        realityDataAccess: new RealityDataAccessClient(realityDataClientOptions),
        renderSys,
        viewManager,
        rpcInterfaces: [
          DtaRpcInterface,
          IVaultReadRpcInterface,
          IVaultTileRpcInterface,
          DMSchemaRpcInterface
        ],
        /* eslint-disable @typescript-eslint/naming-convention */
        mapLayerOptions: {
          MapboxImagery: configuration.mapBoxKey
            ? { key: "access_token", value: configuration.mapBoxKey }
            : undefined,
          BingMaps: configuration.bingMapsKey
            ? { key: "key", value: configuration.bingMapsKey }
            : undefined,
          GoogleMaps: configuration.googleMapsKey
            ? { key: "key", value: configuration.googleMapsKey }
            : undefined,
        },
        /* eslint-enable @typescript-eslint/naming-convention */
        hubAccess: createHubAccess(configuration),
        localization: new SZEWTwinLocalization({ detectorOptions: { order: ["htmlTag"] } }),
      },
      localhostIpcApp: {
        socketUrl,
      },
    };

    this._szewTwinId = configuration.szewTwinId;

    if (ProcessDetector.isElectronAppFrontend) {
      // The electron package produces an exception every time getAccessToken is called, which is quite frequently.
      // It makes debugging with "pause on caught exceptions" infuriating.
      // ###TODO fix that in the client and remove this
      if (!configuration.noElectronAuth)
        opts.iVaultApp!.authorizationClient = new ElectronRendererAuthorization({
          clientId: getConfigurationString("oidcClientId") ?? "native-testId",
        });

      await ElectronApp.startup(opts);
    } else if (ProcessDetector.isMobileAppFrontend) {
      await MobileApp.startup(opts as MobileAppOpts);
    } else {
      const redirectUri = getConfigurationString("oidcRedirectUri") ?? "http://localhost:3000/signin-callback";
      const urlObj = new URL(redirectUri);
      if (urlObj.pathname === window.location.pathname) {
        const client = new BrowserAuthorizationClient({
          clientId: getConfigurationString("oidcClientId") ?? "ivaultjs-spa-test",
          scope: getConfigurationString("oidcScope") ?? "projects:read realitydata:read ivaults:read ivaults:modify ivaultaccess:read",
          redirectUri,
        });
        await client.handleSigninCallback();
      }

      const rpcParams: SzewecCloudRpcParams = { info: { title: "ui-test-app", version: "v1.0" }, uriPrefix: configuration.customOrchestratorUri || "http://localhost:3001" };
      if (opts.iVaultApp?.rpcInterfaces) // eslint-disable-line @typescript-eslint/no-deprecated
        SzewecCloudRpcManager.initializeClient(rpcParams, opts.iVaultApp.rpcInterfaces); // eslint-disable-line @typescript-eslint/no-deprecated
      await LocalhostIpcApp.startup(opts);
    }

    IVaultApp.applicationLogoCard =
      () => IVaultApp.makeLogoCard({ iconSrc: "DTA.png", iconWidth: 100, heading: "Display Test App", notice: "For internal testing" });

    IVaultConnection.onOpen.addListener((ivault: IVaultConnection) => {
      if (ivault.isBlankConnection()) return;

      const formatsProvider = new SchemaFormatsProvider(ivault.schemaContext, IVaultApp.quantityFormatter.activeUnitSystem);
      IVaultApp.formatsProvider = formatsProvider;
      IVaultApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener((args) => {
        formatsProvider.unitSystem = args.system;
      });

      IVaultConnection.onClose.addOnce(() => {
        IVaultApp.resetFormatsProvider();
      });
    });

    const svtToolNamespace = "SVTTools";
    await IVaultApp.localization.registerNamespace(svtToolNamespace);
    [
      ApplyModelClipTool,
      ApplyModelDisplayScaleTool,
      ApplyModelTransformTool,
      AttachCustomRealityDataTool,
      ChangeGridSettingsTool,
      ClearModelTransformsTool,
      CloneViewportTool,
      CloseIVaultTool,
      CloseWindowTool,
      CreateSectionDrawingTool,
      CreateWindowTool,
      DisableModelTransformsTool,
      DockWindowTool,
      DrawingAidTestTool,
      EditingScopeTool,
      ExitTool,
      FenceClassifySelectedTool,
      FocusWindowTool,
      FrameStatsTool,
      GenerateElementGraphicsTool,
      GenerateTileContentTool,
      GltfDecorationTool,
      IncidentMarkerDemoTool,
      PathDecorationTestTool,
      MacroTool,
      MarkupSelectTestTool,
      MarkupTool,
      MaximizeWindowTool,
      ModelClipTool,
      MoveElementTool,
      NewIVaultTool,
      OpenIVaultTool,
      OpenRealityModelSettingsTool,
      OutputShadersTool,
      PlaceLineStringTool,
      DynamicClassifierTool,
      DynamicClipMaskTool,
      PullChangesTool,
      PushChangesTool,
      PurgeTileTreesTool,
      AddSeequentRealityModel,
      RecordFpsTool,
      RecordTileSizesTool,
      RefreshTilesTool,
      ReopenIVaultTool,
      ResizeWindowTool,
      RestoreWindowTool,
      SaveImageTool,
      SetEditorToolSettingsTool,
      ShutDownTool,
      SignInTool,
      SignOutTool,
      SVTSelectionTool,
      SyncViewportFrustaTool,
      SyncViewportsTool,
      TerrainDrapeTool,
      TextDecorationTool,
      ToggleAspectRatioSkewDecoratorTool,
      ToggleSecondaryIVaultTool,
      TimePointComparisonTool,
      ToggleShadowMapTilesTool,
      ViewClipByElementGeometryTool,
      ZoomToSelectedElementsTool,
    ].forEach((tool) => tool.register(svtToolNamespace));

    IVaultApp.toolAdmin.defaultToolId = SVTSelectionTool.toolId;

    BingTerrainMeshProvider.register();

    const realityApiKey = import.meta.env.IVJS_REALITY_DATA_KEY;
    if (realityApiKey)
      registerRealityDataSourceProvider(realityApiKey);

    await FrontendDevTools.initialize();
    await HyperModeling.initialize();
    await EditTools.initialize();
    await MapLayersFormats.initialize();

    EditTools.registerProjectLocationTools();
  }

  public static setSnapModeOverride(snap: SnapMode): void {
    (IVaultApp.accuSnap as DisplayTestAppAccuSnap).setSnapModeOverride(snap);
  }

  public static setActiveSnapModes(snaps: SnapMode[]): void {
    (IVaultApp.accuSnap as DisplayTestAppAccuSnap).setActiveSnapModes(snaps);
  }

  public static setActiveSnapMode(snap: SnapMode): void { this.setActiveSnapModes([snap]); }
}
