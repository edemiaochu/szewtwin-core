/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Extensions
 */

import { IVaultApp } from "../IVaultApp";
import type { ToolAdmin } from "../tools/ToolAdmin";
import type { AccuSnap } from "../AccuSnap";
import type { NotificationManager } from "../NotificationManager";
import type { ViewManager } from "../ViewManager";
import type { ElementLocateManager } from "../ElementLocateManager";
import type { RenderSystem } from "../render/RenderSystem";

/**
 * Subset of IVaultApp exposed to Extensions
 * @alpha
 */
export class ExtensionHost {
  protected constructor() { }

  public static get toolAdmin(): ToolAdmin { return IVaultApp.toolAdmin; }
  public static get notifications(): NotificationManager { return IVaultApp.notifications; }
  public static get viewManager(): ViewManager { return IVaultApp.viewManager; }
  public static get locateManager(): ElementLocateManager { return IVaultApp.locateManager; } // internal ?
  public static get accuSnap(): AccuSnap { return IVaultApp.accuSnap; }
  public static get renderSystem(): RenderSystem { return IVaultApp.renderSystem; } // re think this, should be smaller interface
}
