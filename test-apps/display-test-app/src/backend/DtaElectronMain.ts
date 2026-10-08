/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { assert, Id64String } from "@szewtwin/core-szewec";
import { ElectronHost } from "@szewtwin/core-electron/lib/cjs/ElectronBackend";
import { CreateNewIVaultArgs, CreateNewIVaultResult, CreateSectionDrawingViewArgs, CreateSectionDrawingViewResult, dtaChannel, DtaIpcInterface } from "../common/DtaIpcInterface";
import { getRpcInterfaces, initializeDtaBackend, loadBackendConfig } from "./Backend";
import { IpcHandler } from "@szewtwin/core-backend";
import { getConfig } from "../common/DtaConfiguration";
import { createNewIVault } from "./CreateNewIVaultImpl";
import { createSectionDrawing } from "./SectionDrawingImpl";
import { Placement2dProps, TextAnnotationProps, TextStyleSettingsProps } from "@szewtwin/core-common";
import { deleteText, deleteTextStyle, insertText, insertTextStyle, setScaleFactor, updateText, updateTextStyle } from "./TextImpl";

const mainWindowName = "mainWindow";
const getWindowSize = (winSize?: string) => {
  if (undefined !== winSize) {
    const parts = winSize.split(",");
    if (parts.length === 2) {
      let width = Number.parseInt(parts[0], 10);
      let height = Number.parseInt(parts[1], 10);

      if (Number.isNaN(width))
        width = 1280;

      if (Number.isNaN(height))
        height = 1024;
      return { width, height, x: 100, y: 100 };
    }
  }

  return ElectronHost.getWindowSizeAndPositionSetting(mainWindowName);
};

class DtaHandler extends IpcHandler implements DtaIpcInterface {
  public get channelName() { return dtaChannel; }
  public async sayHello() {
    return "Hello from backend";
  }

  public async createNewIVault(args: CreateNewIVaultArgs): Promise<CreateNewIVaultResult> {
    return createNewIVault(args);
  }

  public async createSectionDrawing(args: CreateSectionDrawingViewArgs): Promise<CreateSectionDrawingViewResult> {
    return createSectionDrawing(args);
  }

  public async insertTextStyle(iVaultKey: string, name: string, settingProps: TextStyleSettingsProps): Promise<Id64String> {
    return insertTextStyle(iVaultKey, name, settingProps);
  }

  public async updateTextStyle(iVaultKey: string, name: string, newSettingProps: TextStyleSettingsProps): Promise<void> {
    return updateTextStyle(iVaultKey, name, newSettingProps);
  }

  public async deleteTextStyle(iVaultKey: string, name: string): Promise<void> {
    return deleteTextStyle(iVaultKey, name);
  }

  public async insertText(iVaultKey: string, categoryId: Id64String, modelId: Id64String, placement: Placement2dProps, defaultTextStyleId: Id64String, textAnnotationProps?: TextAnnotationProps): Promise<Id64String> {
    return insertText(iVaultKey, categoryId, modelId, placement, defaultTextStyleId, textAnnotationProps);
  }

  public async updateText(iVaultKey: string, elementId: Id64String, categoryId?: Id64String, placement?: Placement2dProps, defaultTextStyleId?: Id64String, textAnnotationProps?: TextAnnotationProps): Promise<void> {
    return updateText(iVaultKey, elementId, categoryId, placement, defaultTextStyleId, textAnnotationProps);
  }

  public async deleteText(iVaultKey: string, elementId: Id64String): Promise<void> {
    return deleteText(iVaultKey, elementId);
  }

  public async setScaleFactor(iVaultKey: string, modelId: Id64String, scaleFactor: number): Promise<void> {
    return setScaleFactor(iVaultKey, modelId, scaleFactor);
  }
}

/**
 * This is the function that gets called when we start display-test-app via `electron DtaElectronMain.js` from the command line.
 * It runs in the Electron main process and hosts the szewTwin.js backend (IVaultHost) code. It starts the render (frontend) process
 * that starts from the file "index.ts". That launches the szewTwin.js frontend (IVaultApp).
 */
const dtaElectronMain = async () => {
  // Need to load the config first to get the electron options
  loadBackendConfig();

  const opts = {
    webResourcesPath: path.join(__dirname, "..", "..", "lib"),
    iconName: "display-test-app.ico",
    rpcInterfaces: getRpcInterfaces(),
    ipcHandlers: [DtaHandler],
    developmentServer: process.env.NODE_ENV === "development",
  };

  await initializeDtaBackend(opts);

  const configuration = getConfig();

  // Restore previous window size, position and maximized state
  const sizeAndPosition = getWindowSize(configuration.windowSize);
  const maximizeWindow = undefined === sizeAndPosition || ElectronHost.getWindowMaximizedSetting(mainWindowName);

  // after backend is initialized, start display-test-app frontend process and open the window
  await ElectronHost.openMainWindow({ ...sizeAndPosition, show: !maximizeWindow, title: "Display Test App", storeWindowName: mainWindowName });
  assert(ElectronHost.mainWindow !== undefined);

  if (maximizeWindow) {
    ElectronHost.mainWindow.maximize(); // maximize before showing to avoid resize event on startup
    ElectronHost.mainWindow.show();
  }

  if (configuration.devTools)
    ElectronHost.mainWindow.webContents.toggleDevTools();

  // Handle custom keyboard shortcuts
  ElectronHost.app.on("web-contents-created", (_e, wc) => {
    wc.on("before-input-event", (event, input) => {
      // CTRL + SHIFT + I  ==> Toggle DevTools
      if (input.key === "I" && input.control && !input.alt && !input.meta && input.shift) {
        if (ElectronHost.mainWindow)
          ElectronHost.mainWindow.webContents.toggleDevTools();

        event.preventDefault();
      }
    });
  });

  // Custom orchestrator URL is used to define the iVaultBank URL.
  if (configuration.customOrchestratorUri) {
    ElectronHost.app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
      // (needed temporarily to use self-signed cert to communicate with iVaultBank via https)
      event.preventDefault();
      callback(true);
    });
  }
};

// execute this immediately when we load
dtaElectronMain(); // eslint-disable-line @typescript-eslint/no-floating-promises
