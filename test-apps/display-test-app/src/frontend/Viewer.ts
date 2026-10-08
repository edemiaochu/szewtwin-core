
/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64String } from "@szewtwin/core-szewec";
import { ClipPlane, ClipPrimitive, ClipVector, ConvexClipPlaneSet, Vector3d } from "@szewtwin/core-geometry";
import { ModelClipGroup, ModelClipGroups } from "@szewtwin/core-common";
import {
  IVaultApp, IVaultConnection, MarginOptions, MarginPercent, NotifyMessageDetails, openImageDataUrlInNewWindow, OutputMessagePriority,
  PaddingPercent, ScreenViewport, Tool, Viewport, ViewState,
} from "@szewtwin/core-frontend";
import { parseArgs } from "@szewtwin/frontend-devtools";
import { MarkupApp, MarkupData } from "@szewtwin/core-markup";
import { ClassificationsPanel } from "./ClassificationsPanel";
import { DebugWindow } from "./DebugWindow";
import { FeatureOverridesPanel } from "./FeatureOverrides";
import { CategoryPicker, ModelPicker } from "./IdPicker";
import { SavedViewPicker } from "./SavedViews";
import { CameraPathsMenu } from "./CameraPaths";
import { SectionsPanel } from "./SectionTools";
import { StandardRotations } from "./StandardRotations";
import { Surface } from "./Surface";
import { createTimeline } from "./Timeline";
import { setTitle } from "./Title";
import { createImageButton, createToolButton, ToolBar } from "./ToolBar";
import { ViewAttributesPanel } from "./ViewAttributes";
import { ViewList, ViewPicker } from "./ViewPicker";
import { Window } from "./Window";
import { openIVault, OpenIVaultProps } from "./openIVault";
import { HubPicker } from "./HubPicker";
import { RealityModelSettingsPanel } from "./RealityModelDisplaySettingsWidget";
import { ContoursPanel } from "./Contours";
import { GoogleMapsPanel } from "./GoogleMaps";
import { DtaConfiguration } from "../common/DtaConfiguration";
import { DtaRpcInterface } from "../common/DtaRpcInterface";
import { FormatSetFormatsProvider } from "@szewtwin/dmschema-metadata";


// cspell:ignore savedata topdiv savedview viewtop

async function zoomToSelectedElements(vp: Viewport, options?: MarginOptions) {
  const elems = vp.iVault.selectionSet.elements;
  if (0 < elems.size)
    await vp.zoomToElements(elems, { animateFrustumChange: true, ...options });
}

export class ZoomToSelectedElementsTool extends Tool {
  private _margin?: MarginPercent;
  private _padding?: PaddingPercent | number;

  public static override toolId = "ZoomToSelectedElements";
  public static override get maxArgs() { return 4; }

  public override async run(): Promise<boolean> {
    const vp = IVaultApp.viewManager.selectedView;
    if (undefined !== vp) {
      await zoomToSelectedElements(vp, {
        marginPercent: this._margin,
        paddingPercent: this._padding,
      });
    }

    return true;
  }

  public override async parseAndRun(...input: string[]): Promise<boolean> {
    const args = parseArgs(input);
    const padding = args.getFloat("p");
    if (undefined !== padding) {
      if (args.getBoolean("m"))
        this._margin = { left: padding, right: padding, top: padding, bottom: padding };
      else
        this._padding = padding;
    } else {
      const left = args.getFloat("l") ?? 0;
      const right = args.getFloat("r") ?? 0;
      const top = args.getFloat("t") ?? 0;
      const bottom = args.getFloat("b") ?? 0;
      if (undefined !== left || undefined !== right || undefined !== top || undefined !== bottom) {
        if (args.getBoolean("m"))
          this._margin = { left, right, top, bottom };
        else
          this._padding = { left, right, top, bottom };
      }
    }

    return this.run();
  }
}

export class ModelClipTool extends Tool {
  public static override toolId = "ModelClip";
  public override async run(_args: any[]): Promise<boolean> {
    const view = IVaultApp.viewManager.selectedView?.view;
    if (!view || !view.isSpatialView() || view.modelSelector.models.size < 2)
      return true;

    const createClip = (vector: Vector3d) => {
      const plane = ClipPlane.createNormalAndPoint(vector, view.iVault.projectExtents.center)!;
      const planes = ConvexClipPlaneSet.createPlanes([plane]);
      const primitive = ClipPrimitive.createCapture(planes);
      return ClipVector.createCapture([primitive]);
    };

    const leftModels: string[] = [];
    const rightModels: string[] = [];
    let left = true;
    view.modelSelector.models.forEach((model) => {
      (left ? leftModels : rightModels).push(model);
      left = !left;
    });

    view.details.modelClipGroups = new ModelClipGroups([
      ModelClipGroup.create(createClip(Vector3d.unitX().negate()), rightModels),
      ModelClipGroup.create(createClip(Vector3d.unitZ().negate()), leftModels),
    ]);

    IVaultApp.viewManager.selectedView!.invalidateScene();
    return true;
  }
}

export class MarkupTool extends Tool {
  public static override toolId = "Markup";
  public static savedData?: MarkupData;
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override async run(wantSavedData: boolean): Promise<boolean> {
    const vp = IVaultApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    if (MarkupApp.isActive) {
      // NOTE: Because we don't have separate START and STOP buttons in the test app, exit markup mode only when the Markup Select tool is active, otherwise start the Markup Select tool...
      const startMarkupSelect = IVaultApp.toolAdmin.defaultToolId === MarkupApp.markupSelectToolId && (undefined === IVaultApp.toolAdmin.activeTool || MarkupApp.markupSelectToolId !== IVaultApp.toolAdmin.activeTool.toolId);
      if (startMarkupSelect) {
        await IVaultApp.toolAdmin.startDefaultTool();
        return true;
      }
      MarkupApp.props.result.maxWidth = 1500;
      MarkupApp.stop().then((markupData) => {
        if (wantSavedData)
          MarkupTool.savedData = markupData;
        if (undefined !== markupData.image)
          openImageDataUrlInNewWindow(markupData.image, "Markup");
      }).catch((_) => { });
    } else {
      MarkupApp.props.active.element.stroke = "white"; // as an example, set default color for elements
      MarkupApp.markupSelectToolId = "Markup.TestSelect"; // as an example override the default markup select tool to launch redline tools using key events
      await MarkupApp.start(vp, wantSavedData ? MarkupTool.savedData : undefined);
    }

    return true;
  }

  public override async parseAndRun(...args: string[]): Promise<boolean> {
    const wantSavedData = "savedata" === args[0]?.toLowerCase();
    return this.run(wantSavedData);
  }
}

export interface ViewerProps {
  iVault: IVaultConnection;
  defaultViewName?: string;
  disableEdges?: boolean;
  configuration: DtaConfiguration;
}

export class Viewer extends Window {
  public readonly views: ViewList;
  public readonly viewport: ScreenViewport;
  public readonly toolBar: ToolBar;
  public readonly disableEdges: boolean;
  private _ivault: IVaultConnection;
  private readonly _viewPicker: ViewPicker;
  private readonly _3dOnly: HTMLElement[] = [];
  private _isSavedView = false;
  private _debugWindow?: DebugWindow;
  private _configuration: DtaConfiguration;

  public static async create(surface: Surface, props: ViewerProps): Promise<Viewer> {
    const views = await ViewList.create(props.iVault, props.defaultViewName);
    const view = await views.getDefaultView(props.iVault);
    const viewer = new Viewer(surface, view, views, props);
    return viewer;
  }

  public clone(): Viewer {
    const view = this.viewport.view.clone();
    const viewer = new Viewer(Surface.instance, view, this.views, {
      iVault: view.iVault,
      disableEdges: this.disableEdges,
      configuration: this._configuration
    });

    if (!this.isDocked) {
      // Match dimensions
      viewer.container.style.width = this.container.style.width;
      viewer.container.style.height = this.container.style.height;

      // Offset position from top-left corner
      const style = getComputedStyle(this.container, null);
      const pxToNum = (propName: string) => parseFloat(style.getPropertyValue(propName).replace("px", "")) + 40;
      viewer.container.style.top = `${pxToNum("top")}px`;
      viewer.container.style.left = `${pxToNum("left")}px`;
    }

    return viewer;
  }

  private _maybeDisableEdges() {
    if (this.disableEdges && (this.viewport.viewFlags.visibleEdges || this.viewport.viewFlags.hiddenEdges)) {
      this.viewport.viewFlags = this.viewport.viewFlags.copy({ visibleEdges: false, hiddenEdges: false });
    }
  }

  private constructor(surface: Surface, view: ViewState, views: ViewList, props: ViewerProps) {
    super(surface, { scrollbars: true });

    this._configuration = props.configuration;

    // Allow HTMLElements beneath viewport to be visible if background color has transparency.
    this.contentDiv.style.backgroundColor = "transparent";
    this.container.style.backgroundColor = "transparent";
    surface.element.appendChild(this.container);

    this.disableEdges = true === props.disableEdges;
    this._ivault = props.iVault;
    this.viewport = ScreenViewport.create(this.contentDiv, view);
    this.views = views;

    this._maybeDisableEdges();

    this.toolBar = new ToolBar(IVaultApp.makeHTMLElement("div", { className: "topdiv" }));

    this.toolBar.addItem(createToolButton({
      iconUnicode: "\ue90c", // properties
      tooltip: "Debug info",
      click: () => this.toggleDebugWindow(),
    }));

    this.toolBar.addItem(createToolButton({
      iconUnicode: "\ue9cc",
      tooltip: "Open iVault from disk",
      click: async () => {
        await this.selectIVault();
      },
    }));

    this.toolBar.addDropDown({
      iconUnicode: "\ue9e0", // cloud-download
      tooltip: "Open iVault from hub",
      createDropDown: async (container: HTMLElement) => {
        const picker = new HubPicker(container, async (iVaultId, szewTwinId) => {
          alert(`About to download and open hub iVault. Note that this could take quite some time without any feedback.`);
          await this.openIVault({
            iVaultId,
            szewTwinId,
            writable: this.surface.openReadWrite,
          });
          picker.close();
        });
        await picker.populate();
        return picker;
      },
    });

    this._viewPicker = new ViewPicker(this.toolBar.element, this.views);
    this._viewPicker.onSelectedViewChanged.addListener(async (id) => this.changeView(id));
    this._viewPicker.element.addEventListener("click", () => this.toolBar.close());

    this.toolBar.addDropDown({
      iconUnicode: "\ue90b", // "model"
      tooltip: "Models",
      only3d: true,
      createDropDown: async (container: HTMLElement) => {
        const picker = new ModelPicker(this.viewport, container);
        await picker.populate();
        return picker;
      },
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue901", // "categories"
      tooltip: "Categories",
      createDropDown: async (container: HTMLElement) => {
        const picker = new CategoryPicker(this.viewport, container);
        await picker.populate();
        return picker;
      },
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue90d", // "savedview"
      tooltip: "External saved views",
      createDropDown: async (container: HTMLElement) => {
        const picker = new SavedViewPicker(this.viewport, container, this);
        await picker.populate();
        return picker;
      },
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue932",
      tooltip: "Saved camera paths",
      createDropDown: async (container: HTMLElement) => {
        const picker = new CameraPathsMenu(this.viewport, container);
        await picker.populate();
        return picker;
      },
    });

    this.toolBar.addItem(createImageButton({
      src: "zoom.svg",
      click: async () => IVaultApp.tools.run("SVTSelect"),
      tooltip: "Element selection",
    }));

    this.toolBar.addItem(createToolButton({
      iconUnicode: "\ueb08",
      click: async () => IVaultApp.tools.run("Measure.Distance", IVaultApp.viewManager.selectedView!),
      tooltip: "Measure distance",
    }));

    this.toolBar.addDropDown({
      iconUnicode: "\ue90e",
      tooltip: "View settings",
      createDropDown: async (container: HTMLElement) => {
        const panel = new ViewAttributesPanel(this.viewport, container, this.disableEdges);
        await panel.populate();
        return panel;
      },
    });

    this.toolBar.addItem(createImageButton({
      src: "fit-to-view.svg",
      click: async () => IVaultApp.tools.run("View.Fit", this.viewport, true),
      tooltip: "Fit view",
    }));

    this.toolBar.addItem(createImageButton({
      src: "window-area.svg",
      click: async () => IVaultApp.tools.run("View.WindowArea", this.viewport),
      tooltip: "Window area",
    }));

    this.toolBar.addItem(createImageButton({
      src: "rotate-left.svg",
      click: async () => IVaultApp.tools.run("View.Rotate", this.viewport),
      tooltip: "Rotate",
    }));

    this.toolBar.addDropDown({
      iconUnicode: "\ue909", // "gyroscope"
      createDropDown: async (container: HTMLElement) => new StandardRotations(container, this.viewport),
      tooltip: "Standard rotations",
      only3d: true,
    });

    const walk = createImageButton({
      src: "walk.svg",
      click: async () => IVaultApp.tools.run("View.LookAndMove", this.viewport),
      tooltip: "Walk",
    });
    this._3dOnly.push(walk);
    this.toolBar.addItem(walk);

    this.toolBar.addItem(createToolButton({
      iconUnicode: "\ue982", // "undo"
      click: async () => IVaultApp.tools.run("View.Undo", this.viewport),
      tooltip: "View undo",
    }));

    this.toolBar.addItem(createToolButton({
      iconUnicode: "\ue983", // "redo"
      click: async () => IVaultApp.tools.run("View.Redo", this.viewport),
      tooltip: "View redo",
    }));

    this.toolBar.addDropDown({
      iconUnicode: "\ue931", // "animation"
      createDropDown: async (container: HTMLElement) => createTimeline(this.viewport, container, 10),
      tooltip: "Animation / solar time",
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue916", // "viewtop"
      tooltip: "Sectioning tools",
      createDropDown: async (container: HTMLElement) => new SectionsPanel(this.viewport, container),
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue9d8", // "property-data"
      tooltip: "Spatial Classification",
      only3d: true,
      createDropDown: async (container: HTMLElement) => {
        const panel = new ClassificationsPanel(this.viewport, container);
        await panel.populate();
        return panel;
      },
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue90a", // "isolate"
      createDropDown: async (container: HTMLElement) => new FeatureOverridesPanel(this.viewport, container),
      tooltip: "Override feature symbology",
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue923", // "pencil"  ###TODO where to get real icon?
      createDropDown: async (container: HTMLElement) => {
        const panel = new RealityModelSettingsPanel(this.viewport, container);
        await panel.populate();
        return panel;
      },
      tooltip: "Point cloud settings",
    });

    this.toolBar.addDropDown({
      iconUnicode: "\ue94b",
      createDropDown: async (container: HTMLElement) => {
        const panel = new ContoursPanel(this.viewport, container);
        return panel;
      },
      tooltip: "Contour display",
    });

    this.toolBar.addItem(createToolButton({
      iconUnicode: "\ue9cc",
      tooltip: "Load Format Set from JSON file",
      click: async () => {
        await this.loadFormatSetFromFile();
      },
    }));

    if(this._configuration.googleMapsUi) {
      this.toolBar.addDropDown({
        iconUnicode: "\ue9e8",
        createDropDown: async (container: HTMLElement) => {
          const panel = new GoogleMapsPanel(this.viewport, container);
          return panel;
        },
        tooltip: "Google Maps",
      });
    }

    this.updateTitle();
    this.updateActiveSettings();
  }

  private updateTitle(): void {
    let viewName = this.viewport.view.code.value;
    if (undefined === viewName || 0 === viewName.length)
      viewName = "UNNAMED";

    const id = !this._isSavedView ? this.viewport.view.id : "Saved View";
    const dim = this.viewport.view.is2d() ? "2d" : "3d";
    this.title = `[ ${this.viewport.viewportId} ] ${viewName} <${id}> (${dim})`;
  }

  private updateActiveSettings(): void {
    // NOTE: First category/model is fine for testing purposes...
    const view = this.viewport.view;
    if (!view.iVault.isBriefcaseConnection())
      return;

    const settings = view.iVault.editorToolSettings;
    if (undefined === settings.category || !view.viewsCategory(settings.category)) {
      settings.category = undefined;
      for (const catId of view.categorySelector.categories) {
        settings.category = catId;
        break;
      }
    }

    if (undefined === settings.model || !view.viewsModel(settings.model)) {
      settings.model = undefined;
      if (view.is2d()) {
        settings.model = view.baseModelId;
      } else if (view.isSpatialView()) {
        settings.model = undefined;
        for (const modId of view.modelSelector.models) {
          settings.model = modId;
          break;
        }
      }
    }
  }

  private async changeView(id: Id64String): Promise<void> {
    const view = await this.views.getView(id, this._ivault);
    await this.setView(view.clone());
    for (const control of this._3dOnly)
      control.style.display = this.viewport.view.is3d() ? "block" : "none";
  }

  public async setView(view: ViewState, isSavedView = false): Promise<void> {
    this._isSavedView = isSavedView;
    this.viewport.changeView(view);
    this._maybeDisableEdges();
    this.updateTitle();
    this.updateActiveSettings();
    await this.toolBar.onViewChanged(this.viewport);
  }

  public async applySavedView(view: ViewState): Promise<void> {
    return this.setView(view, true);
  }

  private async openView(view: ViewState): Promise<void> {
    await this.setView(view);
    IVaultApp.viewManager.addViewport(this.viewport);
  }

  private async clearViews(): Promise<void> {
    await this.closeIVault();
    this.views.clear();
  }

  private async buildViewList(): Promise<void> {
    await this.views.populate(this._ivault);
    this._viewPicker.populate(this.views);
  }

  private async resetIVault(props: OpenIVaultProps): Promise<void> {
    const { fileName, iVaultId } = props;
    let newIVault: IVaultConnection;
    const sameFile = (fileName !== undefined && fileName === this._ivault.key) || (iVaultId !== undefined && iVaultId === this._ivault.iVaultId);
    if (!sameFile) {
      try {
        newIVault = await openIVault({ ...props, writable: this.surface.openReadWrite });
      } catch (err: any) {
        alert(err.toString());
        return;
      }
    }

    Surface.instance.onResetIVault(this);
    IVaultApp.viewManager.dropViewport(this.viewport, false);

    await this.clearViews();

    if (sameFile)
      newIVault = await openIVault({ ...props, writable: this.surface.openReadWrite });

    this._ivault = newIVault!;
    await this.buildViewList();
    const view = await this.views.getDefaultView(this._ivault);
    await this.openView(view);
  }

  public async openFile(fileName?: string): Promise<void> {
    return undefined !== fileName ? this.openIVault({ fileName, writable: this.surface.openReadWrite }) : this.selectIVault();
  }

  private async selectIVault(): Promise<void> {
    const fileName = await this.surface.selectFileName();
    return undefined !== fileName ? this.openIVault({ fileName, writable: this.surface.openReadWrite }) : Promise.resolve();
  }

  private async loadFormatSetFromFile(): Promise<void> {
    const filename = await this.surface.selectJsonConfigFilename();

    if (!filename) {
      return;
    }
    const formatSet = await DtaRpcInterface.getClient().getFormatSetFromFile(filename)

    const localFormatsProvider = new FormatSetFormatsProvider({
      formatSet
    });
    IVaultApp.formatsProvider = localFormatsProvider;
  }

  private async openIVault(props: OpenIVaultProps): Promise<void> {
    try {
      await this.resetIVault(props);
      setTitle(this._ivault);
    } catch {
      alert("Error - could not open file.");
    }
  }

  private async closeIVault(): Promise<void> {
    return this._ivault.close();
  }

  public override onFocus(): void {
    this._header.element.classList.add("viewport-header-focused");
    void IVaultApp.viewManager.setSelectedView(this.viewport);
  }

  public override onLoseFocus(): void {
    this._header.element.classList.remove("viewport-header-focused");
  }

  public onSelected(): void {
    this._header.element.classList.add("viewport-header-selected");
    this.container.classList.add("viewport-selected");
  }

  public onDeselected(): void {
    this._header.element.classList.remove("viewport-header-selected");
    this.container.classList.remove("viewport-selected");
  }

  public get windowId(): string { return this.viewport.viewportId.toString(); }

  public override onClosing(): void {
    this.toolBar[Symbol.dispose]();
    if (this._debugWindow) {
      this._debugWindow[Symbol.dispose]();
      this._debugWindow = undefined;
    }

    IVaultApp.viewManager.dropViewport(this.viewport, true);
  }

  public override onClosed(): void {
    if (undefined === IVaultApp.viewManager.selectedView) {
      IVaultApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Closing iVault..."));

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.closeIVault().then(() => IVaultApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "iVault closed.")));
    }
  }

  public toggleDebugWindow(): void {
    if (!this._debugWindow)
      this._debugWindow = new DebugWindow(this.viewport);

    this._debugWindow.toggle();
  }
}
