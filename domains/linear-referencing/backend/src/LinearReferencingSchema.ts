/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import * as path from "node:path";
import { ClassRegistry, KnownLocations, Schema, Schemas } from "@szewtwin/core-backend";
import * as aspectsModule from "./LinearReferencingElementAspects";
import * as elementsModule from "./LinearReferencingElements";
import * as relationshipsModule from "./LinearReferencingRelationships";

/** Schema for the LinearReferencing domain.
 * [Linear referencing](https://en.wikipedia.org/wiki/Linear_referencing) is the method of storing geographic locations by using relative positions along a measured linear feature.
 * @beta
 */
export class LinearReferencingSchema extends Schema {
  public static override get schemaName(): string { return "LinearReferencing"; }
    /**
   * TODO: Currently the schema file comes from a hardcoded path assuming its delivered with ivaultjs-native
   * Look to add a dependency on @szewec/linear-referencing-schema and using require.resolve to obtain the path
   */
  public static get schemaFilePath(): string { return path.join(KnownLocations.nativeAssetsDir, "DMSchemas", "Domain", "LinearReferencing.dmschema.xml"); }
  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);

      ClassRegistry.registerModule(elementsModule, this);
      ClassRegistry.registerModule(aspectsModule, this);
      ClassRegistry.registerModule(relationshipsModule, this);
    }
  }
}
