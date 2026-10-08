/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert } from "@szewtwin/core-szewec";
import { RenderSchedule } from "@szewtwin/core-common";
import { collectTransferables, IvulModel } from "../../common/ivul/IvulModel";
import { IvulParseError, IvulParserOptions, IvulTimeline, parseIvulDocument } from "../../common/ivul/ParseIvulDocument";
import { registerWorker } from "../RegisterWorker";

let timeline: IvulTimeline | undefined;

/** Parses binary iVul content into an [[IvulModel.Document]].
 * @internal
 */
export interface ParseIvulWorker {
  /** The [[IvulTimeline]] to be applied  to the document's nodes. This must be called no more than once. It should be called before
   * any call to [[parse]].
   */
  setTimeline(timeline: RenderSchedule.ScriptProps | RenderSchedule.ModelTimelineProps): void;
  /** Parse the binary content into a document.
   * @note The [[Uint8Array]] containing the binary data is transferred from the caller to the worker - it will become unusable for the caller.
   */
  parse(options: IvulParserOptions): IvulModel.Document | IvulParseError;
}

registerWorker<ParseIvulWorker>({
  parse: async (options: IvulParserOptions) => {
    const result = await parseIvulDocument({
      ...options,
      data: options.data,
      timeline,
    });

    if (typeof result === "number")
      return result;

    return { result, transfer: collectTransferables(result) };
  },
  setTimeline: (arg: RenderSchedule.ScriptProps | RenderSchedule.ModelTimelineProps) => {
    assert(undefined === timeline, "setTimeline must be called only once");
    timeline = Array.isArray(arg) ? RenderSchedule.Script.fromJSON(arg) : RenderSchedule.ModelTimeline.fromJSON(arg);
  },
});
