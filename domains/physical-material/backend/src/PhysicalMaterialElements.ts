/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PhysicalMaterial
 */

import { IVaultDb, PhysicalMaterial } from "@szewtwin/core-backend";
import { DefinitionElementProps } from "@szewtwin/core-common";

/** Aggregate is a bis:PhysicalMaterial representing a broad category of coarse to medium grained particulate material typically used in construction as
 * well as base material under foundations, roadways, and railways.
 * @public
 */
export class Aggregate extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Aggregate"; }
  public constructor(props: DefinitionElementProps, iVault: IVaultDb) { super(props, iVault); }
}

/** Aluminum is a bis:PhysicalMaterial representing aluminum (atomic symbol Al) or one of its alloys.
 * @public
 */
export class Aluminum extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Aluminum"; }
  public constructor(props: DefinitionElementProps, iVault: IVaultDb) { super(props, iVault); }
}

/** Asphalt is a bis:PhysicalMaterial representing a mixture of a bituminous binder and aggregates. Asphalt is typically used for roadway surfacing.
 * @public
 */
export class Asphalt extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Asphalt"; }
  public constructor(props: DefinitionElementProps, iVault: IVaultDb) { super(props, iVault); }
}

/** Concrete is a bis:PhysicalMaterial representing a mixture of hydraulic cement, aggregates, water and optionally other materials.
 * @public
 */
export class Concrete extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Concrete"; }
  public constructor(props: DefinitionElementProps, iVault: IVaultDb) { super(props, iVault); }
}

/** Steel is a bis:PhysicalMaterial representing an alloy of iron, carbon and other elements.
 * @public
 */
export class Steel extends PhysicalMaterial {
  /** @internal */
  public static override get className(): string { return "Steel"; }
  public constructor(props: DefinitionElementProps, iVault: IVaultDb) { super(props, iVault); }
}
