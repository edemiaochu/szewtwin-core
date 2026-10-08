/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import type { ByteStream, Id64Set, Id64String } from "@szewtwin/core-szewec";
import { BatchType } from "@szewtwin/core-common";
import type { IVaultConnection } from "../../IVaultConnection";
import { RenderSystem } from "../../render/RenderSystem";
import type { IvulTimeline } from "../../common/ivul/ParseIvulDocument";
import { acquireIvulParser, IvulReaderResult, readIvulContent } from "../../tile/internal";
import { BatchOptions } from "../../common/render/BatchOptions";
import { LayerTileData } from "../render/webgl/MapLayerParams";

/** Arguments supplied to [[IvulDecoder.decode]].
 */
export interface IvulDecodeArgs {
  /** The encoded tile content. */
  stream: ByteStream;
  /** The render system used to create graphics from the tile content. */
  system: RenderSystem;
  isLeaf?: boolean;
  sizeMultiplier?: number;
  options?: BatchOptions | false;
  isCanceled?: () => boolean;
  /** An array of model groups. If supplied, the graphics associated with each group of models will be decoded into a separate GraphciBranch
   * with [[GraphicBranch.groupNodeId]] set to the index of the group to which the model belongs.
   */
  modelGroups?: Id64Set[];
  tileData?: LayerTileData;
}

/** An object that can decode graphics in iVul format.
 * @note decoders are reference-counted. When you are finished using one, call [[release]].
 * @see [[acquireIvulDecoder]] to acquire a decoder.
 * @internal
 */
export interface IvulDecoder {
  decode(args: IvulDecodeArgs): Promise<IvulReaderResult>;
  release(): void;
}

/** Arguments supplied to [[acquireIvulDecoder]].
 */
export interface AcquireIvulDecoderArgs {
  iVault: IVaultConnection;
  batchModelId: Id64String;
  is3d: boolean;
  type?: BatchType;
  omitEdges?: boolean;
  containsTransformNodes?: boolean;
  timeline?: IvulTimeline;
  noWorker?: boolean;
}

/** Acquire shared ownership of an [[IvulDecoder]].
 * Decoders are reference-counted, because they make use of reference-counted [[IvulParser]]s internally.
 * The caller of this function increments the reference count of the decoder and is responsible
 * for decrementing it by calling [[IvulDecoder.release]] when it is no longer needed. Typically, a decoder's lifetime is tied to the
 * lifetime of some `Disposable` object like a [[TileTree]] - acquired in the constructor, and released in the `[Symbol.dispose]` method.
 * @internal
 */
export function acquireIvulDecoder(args: AcquireIvulDecoderArgs): IvulDecoder {
  const parser = acquireIvulParser(args);
  return {
    release: () => parser.release(),
    decode: async (decodeArgs) => {
      return readIvulContent({
        ...args,
        ...decodeArgs,
        modelId: args.batchModelId,
        loadEdges: !args.omitEdges,
        parseDocument: async (parserOpts) => parser.parse(parserOpts),
      });
    },
  };
}
