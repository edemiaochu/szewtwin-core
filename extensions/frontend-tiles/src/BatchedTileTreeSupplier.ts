/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { comparePossiblyUndefined, compareStrings, CompressedId64Set, Logger } from "@szewtwin/core-szewec";
import { RenderSchedule } from "@szewtwin/core-common";
import {
  IVaultConnection, TileTree, TileTreeOwner, TileTreeSupplier,
} from "@szewtwin/core-frontend";
import { BatchedTilesetReader, BatchedTilesetSpec } from "./BatchedTilesetReader.js";
import { BatchedTileTree } from "./BatchedTileTree.js";
import { loggerCategory } from "./LoggerCategory.js";

/** @internal */
export interface BatchedTileTreeId {
  spec: BatchedTilesetSpec;
  script?: RenderSchedule.Script;
  /** A stringified representation of the [[ModelGroup]]s by which to structure the contents of the tiles.
   * Every unique combination of model groups has a corresponding unique string representation.
   * @see [[BatchedModelGroups.guid]].
   */
  modelGroups: string;
}

class BatchedTileTreeSupplier implements TileTreeSupplier {
  public compareTileTreeIds(lhs: BatchedTileTreeId, rhs: BatchedTileTreeId): number {
    return compareStrings(lhs.spec.baseUrl.toString(), rhs.spec.baseUrl.toString())
      || compareStrings(lhs.modelGroups, rhs.modelGroups)
      || comparePossiblyUndefined((x, y) => x.compareTo(y), lhs.script, rhs.script);
  }

  public async createTileTree(treeId: BatchedTileTreeId, iVault: IVaultConnection): Promise<TileTree | undefined> {
    const spec = treeId.spec;
    try {
      const modelGroups = treeId.modelGroups ? treeId.modelGroups.split("_").map((x) => CompressedId64Set.decompressSet(x)) : undefined;
      const reader = new BatchedTilesetReader(spec, iVault, modelGroups);
      const params = await reader.readTileTreeParams();

      params.script = treeId.script;
      return new BatchedTileTree(params);
    } catch (err) {
      Logger.logError(loggerCategory, err);
      return undefined;
    }
  }
}

const batchedTileTreeSupplier: TileTreeSupplier = new BatchedTileTreeSupplier();

/** @internal */
export function getBatchedTileTreeOwner(iVault: IVaultConnection, treeId: BatchedTileTreeId): TileTreeOwner {
  return iVault.tiles.getTileTreeOwner(treeId, batchedTileTreeSupplier);
}
