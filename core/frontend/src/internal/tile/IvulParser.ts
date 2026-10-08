/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, Dictionary } from "@szewtwin/core-szewec";
import { RenderSchedule } from "@szewtwin/core-common";
import { createWorkerProxy, WorkerProxy } from "../../common/WorkerProxy";
import { IvulModel } from "../../common/ivul/IvulModel";
import { IvulParseError, IvulParserOptions, IvulTimeline, parseIvulDocument } from "../../common/ivul/ParseIvulDocument";
import { ParseIvulWorker } from "../../workers/IvulParser/Worker";
import { IVaultApp } from "../../IVaultApp";

/** An object that can parse binary iVul content into an iVul document on a worker thread.
 * Parsers are reference-counted. Their lifetimes are typically managed by an [[IvulDecoder]].
 * The caller is responsible for invoking [[release]] to decrement the reference count when they are finished using the parsing.
 * @see [[acquireIvulDecoder]] to acquire a decoder that uses a parser internally.
 * @see [[acquireIvulParser]] to obtain a parser directly (but you probably don't need to do that).
 */
export interface IvulParser {
  parse(options: IvulParserOptions): Promise<IvulModel.Document | IvulParseError>;
  release(): void;
}

/** Arguments supplied to [[acquireIvulParser]].
 */
export interface AcquireIvulParserArgs {
  timeline?: IvulTimeline;
  noWorker?: boolean;
}

type ParserProxy = WorkerProxy<ParseIvulWorker>;

export function acquireIvulParser(args: AcquireIvulParserArgs): IvulParser {
  const timeline = args.timeline;
  if (args.noWorker) {
    return {
      parse: async (options) => parseIvulDocument({
        ...options,
        timeline,
      }),
      release: () => undefined,
    };
  }

  if (!args.timeline) {
    if (!defaultParser) {
      const worker = createWorkerProxy<ParseIvulWorker>(`${IVaultApp.publicPath}scripts/parse-ivul-worker.js`);
      defaultParser = {
        parse: async (options) => worker.parse(options, [options.data.buffer]),
        release: () => undefined,
      };
    }

    return defaultParser;
  }

  let parser = parsersWithTimelines.get(args.timeline);
  if (!parser)
    parsersWithTimelines.set(args.timeline, parser = new ParserWithTimeline(args.timeline));

  assert(parser.refCount >= 0);
  ++parser.refCount;
  return parser;
}

let defaultParser: IvulParser | undefined;

class ParserWithTimeline implements IvulParser {
  public refCount = 0;
  private readonly _timeline: IvulTimeline;
  private readonly _worker: ParserProxy;

  public constructor(timeline: IvulTimeline) {
    this._timeline = timeline;
    this._worker = createWorkerProxy<ParseIvulWorker>(`${IVaultApp.publicPath}scripts/parse-ivul-worker.js`);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this._worker.setTimeline(timeline.toJSON());
  }

  public async parse(options: IvulParserOptions) {
    return this._worker.parse(options, [options.data.buffer]);
  }

  public release(): void {
    assert(this.refCount > 0);
    --this.refCount;
    if (this.refCount === 0) {
      parsersWithTimelines.delete(this._timeline);
      this._worker.terminate();
    }
  }
}

const parsersWithTimelines = new Dictionary<IvulTimeline, ParserWithTimeline>((lhs, rhs) => {
  if (lhs instanceof RenderSchedule.ModelTimeline)
    return rhs instanceof RenderSchedule.ModelTimeline ? lhs.compareTo(rhs) : -1;

  return rhs instanceof RenderSchedule.Script ? lhs.compareTo(rhs) : 1;
});
