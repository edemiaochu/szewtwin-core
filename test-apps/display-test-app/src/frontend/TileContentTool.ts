/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, ByteStream, Guid } from "@szewtwin/core-szewec";
import { PersistentGraphicsRequestProps } from "@szewtwin/core-common";
import {
  IvulReader, IVaultApp, IVaultConnection, IVaultTileTree, Tool,
} from "@szewtwin/core-frontend";
import { parseArgs } from "@szewtwin/frontend-devtools";

export class GenerateTileContentTool extends Tool {
  public static override toolId = "GenerateTileContent";
  public static override get minArgs() { return 2; }
  public static override get maxArgs() { return 2; }

  public override async run(args?: { tree: IVaultTileTree, contentId: string }) {
    if (!args)
      return false;

    try {
      const { tree, contentId } = args;
      const bytes = await IVaultApp.tileAdmin.generateTileContent({ contentId, iVaultTree: tree });
      const stream = ByteStream.fromUint8Array(bytes);
      const { iVault, modelId, is3d, containsTransformNodes } = tree;
      const reader = IvulReader.create({
        stream, iVault, modelId, is3d, containsTransformNodes,
        system: IVaultApp.renderSystem,
        type: tree.batchType,
        loadEdges: false !== tree.edgeOptions,
        options: { tileId: contentId },
      });

      assert(undefined !== reader);
      await reader.read();
      return true;
    } catch (err) {
      if (err instanceof Error)
        alert(err.toString());

      return false;
    }
  }

  public override async parseAndRun(...input: string[]) {
    const iVault = IVaultApp.viewManager.selectedView?.iVault;
    if (!iVault)
      return false;

    const args = parseArgs(input);
    const contentId = args.get("c");
    const modelId = args.get("m");
    if (!contentId || !modelId)
      return false;

    for (const owner of iVault.tiles) {
      const tree = owner.owner.tileTree instanceof IVaultTileTree ? owner.owner.tileTree : undefined;
      if (tree?.modelId === modelId)
        return this.run({ tree, contentId });
    }

    return false;
  }
}

export class GenerateElementGraphicsTool extends Tool {
  public static override toolId = "GenerateElementGraphics";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override async run(props?: PersistentGraphicsRequestProps, iVault?: IVaultConnection): Promise<boolean> {
    if (!props || !iVault)
      return false;

    await IVaultApp.tileAdmin.requestElementGraphics(iVault, props);
    return true;
  }

  public override async parseAndRun(...input: string[]) {
    const args = parseArgs(input);
    const elementId = args.get("e");
    if (!elementId)
      return false;

    return this.run({
      id: Guid.createValue(),
      elementId,
      toleranceLog10: args.getInteger("t") ?? -2,
    }, IVaultApp.viewManager.selectedView?.iVault);
  }
}
