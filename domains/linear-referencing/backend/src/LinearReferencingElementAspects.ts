/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import { Id64String, JsonUtils } from "@szewtwin/core-szewec";
import { EditTxn, ElementMultiAspect, IVaultDb } from "@szewtwin/core-backend";
import { _implicitTxn } from "@szewtwin/core-backend/lib/cjs/internal/Symbols";
import { RelatedElement } from "@szewtwin/core-common";
import {
  DistanceExpressionProps, LinearlyReferencedAtLocationAspectProps, LinearlyReferencedFromToLocationAspectProps,
} from "@szewtwin/linear-referencing-common";
import {
  LinearlyReferencedAtPositionRefersToReferent, LinearlyReferencedFromPositionRefersToReferent, LinearlyReferencedToPositionRefersToReferent,
} from "./LinearReferencingRelationships";

/** Core structure carrying linearly-referenced information.
 * @beta
 */
export class DistanceExpression implements DistanceExpressionProps {
  public distanceAlongFromStart: number;
  public lateralOffsetFromILinearElement?: number;
  public verticalOffsetFromILinearElement?: number;
  public distanceAlongFromReferent?: number;

  constructor(props: DistanceExpressionProps) {
    this.distanceAlongFromStart = JsonUtils.asDouble(props.distanceAlongFromStart);
    this.lateralOffsetFromILinearElement = JsonUtils.asDouble(props.lateralOffsetFromILinearElement);
    this.verticalOffsetFromILinearElement = JsonUtils.asDouble(props.verticalOffsetFromILinearElement);
    this.distanceAlongFromReferent = JsonUtils.asDouble(props.distanceAlongFromReferent);
  }

  public static fromJSON(json: DistanceExpressionProps): DistanceExpression { return new DistanceExpression(json); }
}

/** Base class for multi-aspects carrying linearly-referenced locations.
 * @beta
 */
export class LinearlyReferencedLocation extends ElementMultiAspect {
  /** @internal */
  public static override get className(): string { return "LinearlyReferencedLocation"; }
}

/** Concrete multi-aspect class carrying 'at' linearly-referenced positions along a Linear-Element.
 * @beta
 */
export class LinearlyReferencedAtLocation extends LinearlyReferencedLocation {
  /** @internal */
  public static override get className(): string { return "LinearlyReferencedAtLocation"; }

  public atPosition: DistanceExpression;
  public fromReferent?: LinearlyReferencedAtPositionRefersToReferent;

  constructor(props: LinearlyReferencedAtLocationAspectProps, iVault: IVaultDb) {
    super(props, iVault);
    this.atPosition = DistanceExpression.fromJSON(props.atPosition);
    this.fromReferent = RelatedElement.fromJSON(props.fromReferent);
  }

  private static toProps(locatedElementId: Id64String, at: DistanceExpression, fromReferentId?: Id64String): LinearlyReferencedAtLocationAspectProps {
    const props: LinearlyReferencedAtLocationAspectProps = {
      classFullName: LinearlyReferencedAtLocation.classFullName,
      element: { id: locatedElementId },
      atPosition: at,
      fromReferent: (fromReferentId === undefined) ? undefined : new LinearlyReferencedAtPositionRefersToReferent(fromReferentId),
    };

    return props;
  }

  public static create(iVault: IVaultDb, locatedElementId: Id64String,
    at: DistanceExpression, fromReferentId?: Id64String): LinearlyReferencedAtLocation {
    return new LinearlyReferencedAtLocation(this.toProps(locatedElementId, at, fromReferentId), iVault);
  }

  /** Insert a new aspect using an explicit transaction.
   * @beta
   */
  public static insert(txn: EditTxn, locatedElementId: Id64String,
    at: DistanceExpression, fromReferentId?: Id64String): void;

  /** Insert a new aspect.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearlyReferencedAtLocation.insert(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insert(iVault: IVaultDb, locatedElementId: Id64String,
    at: DistanceExpression, fromReferentId?: Id64String): void;

  public static insert(txnOrIVault: EditTxn | IVaultDb, locatedElementId: Id64String,
    at: DistanceExpression, fromReferentId?: Id64String): void {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    txn.insertAspect(this.toProps(locatedElementId, at, fromReferentId));
  }
}

/** Concrete multi-aspect class carrying 'from-to' linearly-referenced positions along a Linear-Element.
 * @beta
 */
export class LinearlyReferencedFromToLocation extends LinearlyReferencedLocation {
  /** @internal */
  public static override get className(): string { return "LinearlyReferencedFromToLocation"; }

  public fromPosition: DistanceExpression;
  public fromPositionFromReferent?: LinearlyReferencedFromPositionRefersToReferent;
  public toPosition: DistanceExpression;
  public toPositionFromReferent?: LinearlyReferencedToPositionRefersToReferent;

  constructor(props: LinearlyReferencedFromToLocationAspectProps, iVault: IVaultDb) {
    super(props, iVault);
    this.fromPosition = DistanceExpression.fromJSON(props.fromPosition);
    this.toPosition = DistanceExpression.fromJSON(props.toPosition);
    this.fromPositionFromReferent = RelatedElement.fromJSON(props.fromPositionFromReferent);
    this.toPositionFromReferent = RelatedElement.fromJSON(props.toPositionFromReferent);
  }

  private static toProps(locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): LinearlyReferencedFromToLocationAspectProps {
    const props: LinearlyReferencedFromToLocationAspectProps = {
      classFullName: LinearlyReferencedFromToLocation.classFullName,
      element: { id: locatedElementId },
      fromPosition: from,
      fromPositionFromReferent: (fromReferentId === undefined) ? undefined : new LinearlyReferencedFromPositionRefersToReferent(fromReferentId),
      toPosition: to,
      toPositionFromReferent: (toReferentId === undefined) ? undefined : new LinearlyReferencedToPositionRefersToReferent(toReferentId),
    };

    return props;
  }

  public static create(iVault: IVaultDb, locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): LinearlyReferencedFromToLocation {
    return new LinearlyReferencedFromToLocation(this.toProps(locatedElementId, from, to, fromReferentId, toReferentId), iVault);
  }

  /** Insert a new aspect using an explicit transaction.
   * @beta
   */
  public static insert(txn: EditTxn, locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): void;

  /** Insert a new aspect.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearlyReferencedFromToLocation.insert(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insert(iVault: IVaultDb, locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): void;

  public static insert(txnOrIVault: EditTxn | IVaultDb, locatedElementId: Id64String,
    from: DistanceExpression, to: DistanceExpression, fromReferentId?: Id64String, toReferentId?: Id64String): void {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    txn.insertAspect(this.toProps(locatedElementId, from, to, fromReferentId, toReferentId));
  }
}
