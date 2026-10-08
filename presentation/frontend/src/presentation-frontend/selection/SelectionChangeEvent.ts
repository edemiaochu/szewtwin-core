/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module UnifiedSelection
 */

import { BeEvent } from "@szewtwin/core-szewec";
import { IVaultConnection } from "@szewtwin/core-frontend";
import { KeySet } from "@szewtwin/presentation-common";
import { ISelectionProvider } from "./ISelectionProvider.js";

/**
 * An interface for selection change listeners.
 * @public
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use `StorageSelectionChangesListener` from [@szewtwin/unified-selection](https://github.com/szewTwin/presentation/blob/master/packages/unified-selection/README.md) package instead.
 */
export declare type SelectionChangesListener = (args: SelectionChangeEventArgs, provider: ISelectionProvider) => void;

/**
 * An event broadcasted on selection changes
 * @public
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use `Event<StorageSelectionChangesListener>` from [@szewtwin/unified-selection](https://github.com/szewTwin/presentation/blob/master/packages/unified-selection/README.md) package instead.
 */
export class SelectionChangeEvent extends BeEvent<SelectionChangesListener> {}

/**
 * The type of selection change
 * @public
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use `StorageSelectionChangeType` from [@szewtwin/unified-selection](https://github.com/szewTwin/presentation/blob/master/packages/unified-selection/README.md) package instead.
 */
export enum SelectionChangeType {
  /** Added to selection. */
  Add,

  /** Removed from selection. */
  Remove,

  /** Selection was replaced. */
  Replace,

  /** Selection was cleared. */
  Clear,
}

/**
 * The event object that's sent when the selection changes.
 * @public
 * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use `StorageSelectionChangeEventArgs` from [@szewtwin/unified-selection](https://github.com/szewTwin/presentation/blob/master/packages/unified-selection/README.md) package instead.
 */
export interface SelectionChangeEventArgs {
  /** The name of the selection source which caused the selection change. */
  source: string;

  /** Level of the selection. See [selection levels documentation section]($docs/presentation/unified-selection/index#selection-levels). */
  level: number;

  /** The selection change type. */
  changeType: SelectionChangeType;

  /** Set of keys affected by this selection change event. */
  keys: Readonly<KeySet>;

  /** iVault connection with which the selection is associated with. */
  ivault: IVaultConnection;

  /** The timestamp of when the selection change happened */
  timestamp: Date;

  /** Id of the ruleset associated with the selection change. */
  rulesetId?: string;
}
