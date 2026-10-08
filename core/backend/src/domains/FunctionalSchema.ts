/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Schema
 */

import * as path from "path";
import { DbResult } from "@szewtwin/core-szewec";
import { IVaultError } from "@szewtwin/core-common";
import { ClassRegistry } from "../ClassRegistry";
import { IVaultDb } from "../IVaultDb";
import { KnownLocations } from "../IVaultHost";
import { Schema, Schemas } from "../Schema";
import * as elementsModule from "./FunctionalElements";
import { _nativeDb } from "../internal/Symbols";

/** @public */
export class FunctionalSchema extends Schema {
  public static override get schemaName(): string { return "Functional"; }
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "DMSchemas", "Domain", `${FunctionalSchema.schemaName}.dmschema.xml`); }
  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);
      ClassRegistry.registerModule(elementsModule, this);
    }
  }

  /** @public */
  public static async importSchema(iVaultDb: IVaultDb) {
    if (iVaultDb.isBriefcaseDb())
      await iVaultDb.acquireSchemaLock();

    const stat = iVaultDb[_nativeDb].importFunctionalSchema();
    if (DbResult.BE_SQLITE_OK !== stat) {
      throw new IVaultError(stat, "Error importing Functional schema");
    }
  }
}
