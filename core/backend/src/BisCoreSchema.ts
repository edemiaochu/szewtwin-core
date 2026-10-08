/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import * as path from "path";
import * as categoryMod from "./Category";
import { ClassRegistry } from "./ClassRegistry";
import * as elementMod from "./Element";
import * as aspectMod from "./ElementAspect";
import * as externalSourceMod from "./ExternalSource";
import { KnownLocations } from "./IVaultHost";
import * as materialMod from "./Material";
import * as modelMod from "./Model";
import * as linkMod from "./Relationship";
import { Schema, Schemas } from "./Schema";
import * as textureMod from "./Texture";
import * as viewMod from "./ViewDefinition";
import * as displayStyleMod from "./DisplayStyle";
import * as annotationsMod from "./annotations/TextAnnotationElement";
import * as elementDrivesTextAnnotation from "./annotations/ElementDrivesTextAnnotation";
import * as sheetIndex from "./SheetIndex";

/**
 * The [BisCore]($docs/bis/guide/fundamentals/schemas-domains.md) schema is the lowest level Schema in an iVault.
 *
 * It is automatically registered when [[IVaultHost.startup]] is called.
 *
 * Example:
 * ``` ts
 * [[include:BisCore.registerSchemaAndGetClass]]
 * ```
 * @public
 */
export class BisCoreSchema extends Schema {
  public static override get schemaName(): string { return "BisCore"; }
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "DMSchemas", "Bld", `${BisCoreSchema.schemaName}.dmschema.xml`); }

  /** @internal */
  public static registerSchema() {
    if (this === Schemas.getRegisteredSchema(this.schemaName))
      return;

    Schemas.unregisterSchema(this.schemaName);
    Schemas.registerSchema(this);

    // this list should include all backend .ts files with implementations of Entity-based classes. Order does not matter.
    [
      elementMod,
      aspectMod,
      modelMod,
      categoryMod,
      viewMod,
      linkMod,
      textureMod,
      materialMod,
      externalSourceMod,
      displayStyleMod,
      annotationsMod,
      sheetIndex,
      elementDrivesTextAnnotation,
    ].forEach((module) => ClassRegistry.registerModule(module, this));
  }
}
