/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, Id64String } from "@szewtwin/core-szewec";
import { IVaultConnection } from "../../IVaultConnection";
import { BatchTableProperties } from "../../tile/internal";

/**
 * Mapping between transient IDs assigned to 3D tiles "features" and batch table properties (and visa versa).
 * these properties may be present in batched tile sets.
 */
export class BatchedTileIdMap implements BatchTableProperties {
  private readonly _iVault: IVaultConnection;
  private _featureMap?: Map<string, { id: Id64String, properties: any }>;
  private _idMap?: Map<Id64String, any>;

  public constructor(iVault: IVaultConnection) {
    this._iVault = iVault;
  }

  /** Obtains or allocates the Id64String corresponding to the supplied set of JSON properties. */
  public getBatchId(properties: any): Id64String {
    if (undefined === this._featureMap || undefined === this._idMap) {
      assert(undefined === this._featureMap && undefined === this._idMap);
      this._featureMap = new Map<string, { id: Id64String, properties: any }>();
      this._idMap = new Map<Id64String, any>();
    }

    const key = JSON.stringify(properties);
    let entry = this._featureMap.get(key);
    if (undefined === entry) {
      const id = this._iVault.transientIds.getNext();
      entry = { id, properties };
      this._featureMap.set(key, entry);
      this._idMap.set(id, properties);
    }

    return entry.id;
  }

  public getFeatureProperties(id: Id64String): Record<string, any> | undefined {
    const props = this._idMap?.get(id);
    return typeof props === "object" ? props : undefined;
  }

  public * entries(): Iterable<{ id: Id64String, properties: Record<string, any> }> {
    if (this._idMap) {
      for (const [id, properties] of this._idMap) {
        if (typeof properties === "object") {
          yield { id, properties };
        }
      }
    }
  }
}
