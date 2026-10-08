/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { Id64String } from "@szewtwin/core-szewec";
import { DefinitionElement, IVaultDb } from "@szewtwin/core-backend";
import { Code } from "@szewtwin/core-common";
import { Ruleset as PresentationRuleset } from "@szewtwin/presentation-common";
import { normalizeVersion } from "../Utils.js";
import { PresentationRules } from "./PresentationRulesDomain.js";

/** @internal */
export class Ruleset extends DefinitionElement {
  /**
   * Name of the `Ruleset` element class.
   */
  public static override get className(): string {
    return "Ruleset";
  }

  /**
   * Generates a unique code for a ruleset
   * @param iVaultDb DB the ruleset is supposed to be inserted into
   * @param modelId ID of a the model this ruleset should be created in
   * @param ruleset The ruleset code is being created for
   */
  public static createRulesetCode(iVaultDb: IVaultDb, modelId: Id64String, ruleset: PresentationRuleset) {
    let codeValue = ruleset.id;
    if (ruleset.version) {
      codeValue += `@${normalizeVersion(ruleset.version)}`;
    }

    return new Code({
      spec: iVaultDb.codeSpecs.getByName(PresentationRules.CodeSpec.Ruleset).id,
      scope: modelId.toString(),
      value: codeValue,
    });
  }
}
