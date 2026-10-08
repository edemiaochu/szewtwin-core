/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Logging
 */

/** Logger categories used by this package
 * @note All logger categories in this package start with the `core-backend` prefix.
 * @see [Logger]($szewec)
 * @public
 */
export enum BackendLoggerCategory {
  /** The logger category used by API related to authorization */
  Authorization = "core-backend.Authorization",

  /** The logger category used by the following classes:
   * - [[CodeSpecs]]
   */
  CodeSpecs = "core-backend.CodeSpecs",

  /** The logger category used by the following classes:
   * - [[CustomViewState3dCreator]]
   */
  CustomViewState3dCreator = "core-backend.CustomViewState3dCreator",

  /** The logger category used by the [[DevTools]] class and related classes.
   * @internal
   */
  DevTools = "core-backend.DevTools",

  /** The logger category used by the following classes:
   * - [[ChangeSummaryManager]]
   * - [[DMDb]]
   * - [[DMSqlStatement]]
   */
  DMDb = "core-backend.DMDb",

  /** The logger category used by the following classes:
   * - [[Functional]]
   */
  Functional = "core-backend.Functional",

  /** The logger category used by the following classes:
   * - [[LinearReferencing]]
   */
  LinearReferencing = "core-backend.LinearReferencing",

  /** The logger category used by the following classes:
   * - BriefcaseManager
   * - [[IVaultDb]]
   */
  IVaultDb = "core-backend.IVaultDb",

  /** The logger category used by the following classes:
   * - [[IVaultHost]]
   */
  IVaultHost = "core-backend.IVaultHost",

  /** The logger category used by the following classes:
   * - TileRequestMemoizer
   */
  IVaultTileRequestRpc = "core-backend.IVaultTileRequestRpc",

  /** The logger category used by the following classes:
   * - IVaultTileRpcImpl (Tile Uploading)
   */
  IVaultTileUpload = "core-backend.IVaultTileUpload",

  /** The logger category used by the following classes:
   * - TileStorage (tile upload/download)
   */
  IVaultTileStorage = "core-backend.IVaultTileStorage",

  /** The logger category used by the following classes:
   * - [[Relationship]]
   */
  Relationship = "core-backend.Relationship",

  /** The logger category used by the following classes:
   * - [[Schemas]]
   */
  Schemas = "core-backend.Schemas",

  /** The logger category used by the following classes:
   * - [[PromiseMemoizer]]
   */
  PromiseMemoizer = "core-backend.PromiseMemoizer",
  /** The logger category used by the following classes:
   * - [[EventSink]]
   */
  EventSink = "core-backend.EventSink",

  /** The logger category used by the following classes:
   * - [[StashManager]]
   * - [[StashError]]
   * @internal
   */
  StashManager = "core-backend.StashManager",

  /** The logger category used by the following classes:
   * - [[NativeHost]], [[NativeAppStorage]]
   * @internal
   */
  NativeApp = "core-backend.NativeApp",

  /** The logger category used by the following classes:
   * - [[ViewStateHydrator]]
   * @internal
   */
  ViewStateHydrator = "core-backend.ViewStateHydrator",

  /** @internal */
  Workspace = "core-backend.Workspace",
}
