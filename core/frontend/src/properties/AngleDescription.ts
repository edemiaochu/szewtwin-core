/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Properties
 */

import { IVaultApp } from "../IVaultApp";
import { QuantityType } from "../quantity-formatting/QuantityFormatter";
import { FormattedQuantityDescription } from "./FormattedQuantityDescription";

/**
 * Angle Property Description
 * @beta
 */
export class AngleDescription extends FormattedQuantityDescription {
  constructor(name?: string, displayLabel?: string, iconSpec?: string, kindOfQuantityName?: string) {
    const defaultName = "angle";
    super({
      name: name ?? defaultName,
      displayLabel: displayLabel ?? IVaultApp.localization.getLocalizedString("iVaultJs:Properties.Angle"),
      kindOfQuantityName: kindOfQuantityName ?? "DefaultToolsUnits.ANGLE",
      iconSpec,
    });
  }

  public get formatterQuantityType(): QuantityType { return QuantityType.Angle; }
  /**
   * @deprecated in 5.0 - will not be removed until after 2026-06-13. Use the `kindOfQuantityName` property instead.
   */
  public get quantityType(): string { return "Angle"; }

  public get parseError(): string { return IVaultApp.localization.getLocalizedString("iVaultJs:Properties.UnableToParseAngle"); }
}
