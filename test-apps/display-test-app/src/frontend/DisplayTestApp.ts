/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Logger, LogLevel, ProcessDetector } from "@szewtwin/core-szewec";
import { RpcConfiguration } from "@szewtwin/core-common";
import {
  GpuMemoryLimit,
  IVaultApp, IVaultConnection, RenderSystem, TileAdmin,
  ViewManager,
} from "@szewtwin/core-frontend";
import { initializeFrontendTiles } from "@szewtwin/frontend-tiles";
import { WebGLExtensionName } from "@szewtwin/webgl-compatibility";
import { DtaBooleanConfiguration, DtaConfiguration, DtaNumberConfiguration, DtaStringConfiguration, getConfig } from "../common/DtaConfiguration";
import { DtaRpcInterface } from "../common/DtaRpcInterface";
import { DisplayTestApp } from "./App";
import { MobileMessenger } from "./FileOpen";
import { openIVault, OpenIVaultProps } from "./openIVault";
import { signIn } from "./signIn";
import { Surface } from "./Surface";
import { setTitle } from "./Title";
import { showStatus } from "./Utils";
import { Dock } from "./Window";
import { createCesiumRenderSystem, createCesiumViewManager } from "@szewtwin/cesium-renderer";

const configuration: DtaConfiguration = {};

/**
 * Get the value for a string configuration param.
 * @param key The parameter name of the parameter to get.
 * @returns The value of the string configuration param.
 */
export function getConfigurationString(key: keyof DtaStringConfiguration) {
  return (configuration as DtaStringConfiguration)[key];
}

/**
 * Get the value for a boolean configuration param.
 * @param key The parameter name of the parameter to get.
 * @returns The value of the boolean configuration param, or false if the param is undefined.
 */
export function getConfigurationBoolean(key: keyof DtaBooleanConfiguration): boolean {
  return (configuration as DtaBooleanConfiguration)[key] ?? false;
}

/**
 * Get the value for a numeric configuration param.
 * @param key The parameter name of the parameter to get.
 * @returns The value of the numeric configuration param.
 */
export function getConfigurationNumber(key: keyof DtaNumberConfiguration) {
  return (configuration as DtaNumberConfiguration)[key];
}

const getFrontendConfig = async (useRPC = false) => {
  if (ProcessDetector.isMobileAppFrontend) {
    if (window) {
      const urlParams = new URLSearchParams(window.location.hash);
      urlParams.forEach((val, key) => {
        (configuration as any)[key] = val;
      });
    }
  } else {
    const config: DtaConfiguration = useRPC ? await DtaRpcInterface.getClient().getEnvConfig() : getConfig();
    Object.assign(configuration, config);
  }

  // Overriding the configuration generally requires setting environment variables, rebuilding the app, and restarting the app from scratch -
  // and sometimes that doesn't even work.
  // If you want to quickly adjust aspects of the configuration on the frontend, you can instead add your overrides below and just hot-reload the app in the browser/electron.
  // Obviously, don't commit such changes.
  const configurationOverrides: DtaConfiguration = {
    /* For example:
    iVaultName: "d:\\bim\\Constructions.dtw",
    disableInstancing: true,
    */
  };
  Object.assign(configuration, configurationOverrides);

  console.log("Configuration", configuration); // eslint-disable-line no-console
};

async function openFile(props: OpenIVaultProps): Promise<IVaultConnection> {
  configuration.standalone = true;
  const iVaultConnection = await openIVault(props);
  configuration.iVaultName = iVaultConnection.name;
  return iVaultConnection;
}

function setConfigurationResults(): [renderSystemOptions: RenderSystem.Options | RenderSystem, tileAdminProps: TileAdmin.Props, viewManager?: ViewManager] {
  let renderSystemOptions: RenderSystem.Options | RenderSystem;
  let viewManager: ViewManager | undefined;

  if (true === configuration.useCesium) {
    renderSystemOptions = createCesiumRenderSystem();
    viewManager = createCesiumViewManager();
  } else
    renderSystemOptions = {
      disabledExtensions: configuration.disabledExtensions as WebGLExtensionName[],
      preserveShaderSourceCode: true === configuration.preserveShaderSourceCode,
      logarithmicDepthBuffer: false !== configuration.logarithmicZBuffer,
      dpiAwareViewports: false !== configuration.dpiAwareViewports,
      devicePixelRatioOverride: configuration.devicePixelRatioOverride,
      dpiAwareLOD: true === configuration.dpiAwareLOD,
      useWebGL2: false !== configuration.useWebGL2,
      planProjections: true,
      errorOnMissingUniform: false !== configuration.errorOnMissingUniform,
      debugShaders: true === configuration.debugShaders,
      antialiasSamples: configuration.antialiasSamples,
    };

  const tileAdminProps: TileAdmin.Props = {
    retryInterval: 50,
    enableInstancing: true,
    enableIndexedEdges: true !== configuration.disableIndexedEdges,
  };

  if (configuration.disableInstancing)
    tileAdminProps.enableInstancing = false;

  if (false === configuration.enableImprovedElision)
    tileAdminProps.enableImprovedElision = false;

  if (configuration.ignoreAreaPatterns)
    tileAdminProps.ignoreAreaPatterns = true;

  if (false === configuration.useProjectExtents)
    tileAdminProps.useProjectExtents = false;

  if (configuration.cacheTileMetadata)
    tileAdminProps.cacheTileMetadata = true;

  if (configuration.disableMagnification)
    tileAdminProps.disableMagnification = true;

  if (configuration.disableBRepCache)
    tileAdminProps.optimizeBRepProcessing = false;

  if (undefined !== configuration.gpuMemoryLimit)
    tileAdminProps.gpuMemoryLimits = configuration.gpuMemoryLimit as GpuMemoryLimit;

  if (true === configuration.noIvulWorker)
    tileAdminProps.decodeIvulInWorker = false;

  tileAdminProps.enableExternalTextures = (configuration.enableExternalTextures !== false);
  tileAdminProps.enableFrontendScheduleScripts = (configuration.enableFrontendScheduleScripts !== false);
  tileAdminProps.tileTreeExpirationTime = configuration.tileTreeExpirationSeconds;
  tileAdminProps.tileExpirationTime = configuration.tileExpirationSeconds;
  tileAdminProps.maximumLevelsToSkip = configuration.maxTilesToSkip;
  tileAdminProps.alwaysRequestEdges = true === configuration.alwaysLoadEdges;
  tileAdminProps.minimumSpatialTolerance = configuration.minimumSpatialTolerance;
  tileAdminProps.alwaysSubdivideIncompleteTiles = true === configuration.alwaysSubdivideIncompleteTiles;
  tileAdminProps.cesiumIonKey = configuration.cesiumIonKey;
  tileAdminProps.disablePolyfaceDecimation = true === configuration.disablePolyfaceDecimation;

  return [renderSystemOptions, tileAdminProps, viewManager];
}

// simple function to extract file name, without path or extension, on Windows or Linux
function getFileName(path: string): string {
  let strs = path.split("/");
  let str = strs[strs.length - 1];
  strs = str.split("\\");
  str = strs[strs.length - 1];
  const ndx = str.lastIndexOf(".");
  if (ndx > 0) // allow files starting with .
    str = str.substring(0, ndx);
  return str;
}

// simple function to extract the file extension, including '.', on Windows or Linux
function getFileExt(path: string): string {
  let strs = path.split("/");
  let str = strs[strs.length - 1];
  strs = str.split("\\");
  str = strs[strs.length - 1];
  const ndx = str.lastIndexOf(".");
  if (ndx > 0) // allow files starting with .
    str = str.substring(ndx);
  else
    str = "";
  return str;
}

// main entry point.
const dtaFrontendMain = async () => {
  RpcConfiguration.developmentMode = true; // needed for snapshots in web apps
  RpcConfiguration.disableRoutingValidation = true;

  // retrieve, set, and output the global configuration variable
  await getFrontendConfig();

  // Start the app. (This tries to fetch a number of localization json files from the origin.)
  let tileAdminProps: TileAdmin.Props;
  let renderSystemOptions: RenderSystem.Options | RenderSystem;
  let viewManager: ViewManager | undefined;
  // eslint-disable-next-line prefer-const
  [renderSystemOptions, tileAdminProps, viewManager] = setConfigurationResults();
  await DisplayTestApp.startup(configuration, renderSystemOptions, tileAdminProps, viewManager);
  if (false !== configuration.enableDiagnostics)
    IVaultApp.renderSystem.debugControl?.enableDiagnostics(undefined);

  if (!configuration.standalone && !configuration.customOrchestratorUri) {
    alert("Standalone iVault required. Set IVJS_STANDALONE_FILENAME in environment");
    return;
  }

  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel("core-frontend.Render", LogLevel.Error);

  // We can call RPC at this point (after startup), so if not mobile, call RPC and get true env from backend,
  // then shutdown frontend, init vars again based on possibly changed configuration, then startup again
  // (All that to workaround the fact that we can't call RPC before we start to get the true env first.)
  if (!ProcessDetector.isMobileAppFrontend) {
    Object.assign(configuration, await getFrontendConfig(true));
    // console.log("New Front End Configuration from backend:", JSON.stringify(configuration)); // eslint-disable-line no-console
    await IVaultApp.shutdown();
    [renderSystemOptions, tileAdminProps] = setConfigurationResults();
    await DisplayTestApp.startup(configuration, renderSystemOptions, tileAdminProps, viewManager);
    if (false !== configuration.enableDiagnostics)
      IVaultApp.renderSystem.debugControl?.enableDiagnostics(undefined);

    if (!configuration.standalone && !configuration.customOrchestratorUri) {
      alert("Standalone iVault required. Set IVJS_STANDALONE_FILENAME in environment");
      return;
    }
  }

  // this needs to execute after all DisplayTestApp.startup executions so that env var will be current
  if (configuration.frontendTilesUrlTemplate) {
    initializeFrontendTiles({
      enableEdges: true,
      computeSpatialTilesetBaseUrl: async (iVault) => {
        let urlStr = configuration.frontendTilesUrlTemplate!.replace("{iVault.key}", iVault.key);
        urlStr = urlStr.replace("{iVault.filename}", getFileName(iVault.key));
        urlStr = urlStr.replace("{iVault.extension}", getFileExt(iVault.key));
        const url = new URL(urlStr);
        const tilesetUrl = new URL("tileset.json", url);
        tilesetUrl.search = url.search;

        // Check if a tileset has been published for this iVault.
        try {
          console.log(`Checking for tileset at ${tilesetUrl.toString()}`); // eslint-disable-line no-console
          const response = await fetch(tilesetUrl);
          await response.json();
          return url;
        } catch {
          // No tileset available.
          return undefined;
        }
      },
    });
  }

  const uiReady = displayUi(); // Get the browser started loading our html page and the svgs that it references but DON'T WAIT

  try {
    if (!configuration.standalone || configuration.signInForStandalone) {
      while (!await signIn()) {
        alert("please sign in");
      }
    }

    let iVault: IVaultConnection | undefined;
    const iVaultName = configuration.iVaultName;
    const origStandalone = configuration.standalone;
    if (undefined !== iVaultName) {
      try {
        const writable = configuration.openReadWrite ?? false;
        iVault = await openFile({ fileName: iVaultName, writable });
        if (ProcessDetector.isMobileAppFrontend) {
          // attempt to send message to mobile that the model was opened
          MobileMessenger.postMessage("modelOpened", iVaultName);
        }
        setTitle(iVault);
      } catch (error) {
        configuration.standalone = origStandalone;
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        console.error(`Error opening snapshot iVault: ${error}`); // eslint-disable-line no-console
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        alert(`Error opening snapshot iVault: ${error}`);
      }
    } else {
      try {
        const iVaultId = configuration.iVaultId;
        const szewTwinId = configuration.szewTwinId;
        if (undefined !== iVaultId && undefined !== szewTwinId) {
          const writable = configuration.openReadWrite ?? false;
          iVault = await openFile({ iVaultId, szewTwinId, writable });
          setTitle(iVault);
        }
      } catch (error) {
        configuration.standalone = origStandalone;
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        console.error(`Error getting hub iVault: ${error}`); // eslint-disable-line no-console
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        alert(`Error getting hub iVault: ${error}`);
      }
    }

    await uiReady; // Now wait for the HTML UI to finish loading.
    await initView(iVault);

    if (configuration.startupMacro)
      await IVaultApp.tools.parseAndRun(`dta macro ${configuration.startupMacro}`);
  } catch (reason) {
    alert(reason);
    return;
  }
};

async function documentLoaded(): Promise<void> {
  const readyState = /^complete$/;
  if (readyState.test(document.readyState))
    return;

  return new Promise<void>((resolve) => {
    const listener = () => {
      if (readyState.test(document.readyState)) {
        document.removeEventListener("readystatechange", listener);
        resolve();
      }
    };

    document.addEventListener("readystatechange", listener);
    listener();
  });
}

async function initView(iVault: IVaultConnection | undefined) {
  // open the specified view
  showStatus("opening View", configuration.viewName);

  const fileSelector = undefined !== configuration.standalonePath ? {
    directory: configuration.standalonePath,
    input: document.getElementById("browserFileSelector") as HTMLInputElement,
  } : undefined;

  DisplayTestApp.surface = new Surface(configuration, document.getElementById("app-surface")!, document.getElementById("toolBar")!, fileSelector, configuration.openReadWrite ?? false);

  // We need layout to complete so that the div we want to stick our viewport into has non-zero dimensions.
  // Consistently reproducible for some folks, not others...
  await documentLoaded();

  if (undefined !== iVault) {
    const viewer = await DisplayTestApp.surface.createViewer({
      iVault,
      defaultViewName: configuration.viewName,
      disableEdges: true === configuration.disableEdges,
      configuration
    });

    viewer.dock(Dock.Full);
  }

  showStatus("View Ready");
  hideSpinner();
}

// Set up the HTML UI elements and wire them to our functions
async function displayUi() {
  return new Promise<void>(async (resolve) => {
    showSpinner();
    resolve();
  });
}

function showSpinner() {
  const spinner = document.getElementById("spinner") as HTMLElement;
  spinner.style.display = "block";
}

function hideSpinner() {
  const spinner = document.getElementById("spinner");
  if (spinner)
    spinner.style.display = "none";
}

// Entry point - run the main function
dtaFrontendMain(); // eslint-disable-line @typescript-eslint/no-floating-promises
