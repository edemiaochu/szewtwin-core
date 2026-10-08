/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module LinearReferencing
 */

import { assert, DbResult, Id64String } from "@szewtwin/core-szewec";
import { DMSqlStatement, EditTxn, ElementAspect, IVaultDb, PhysicalElement, SpatialLocationElement } from "@szewtwin/core-backend";
import { _implicitTxn } from "@szewtwin/core-backend/lib/cjs/internal/Symbols";
import { Code, ElementProps, GeometricElement3dProps, IVaultError, PhysicalElementProps, RelatedElement } from "@szewtwin/core-common";
import {
  ComparisonOption, LinearLocationReference, LinearlyLocatedAttributionProps, LinearlyReferencedAtLocationAspectProps,
  LinearlyReferencedAtLocationProps, LinearlyReferencedFromToLocationAspectProps, LinearlyReferencedFromToLocationProps,
  LinearlyReferencedLocationType, QueryParams, ReferentElementProps,
} from "@szewtwin/linear-referencing-common";
import { LinearlyReferencedAtLocation, LinearlyReferencedFromToLocation } from "./LinearReferencingElementAspects";
import {
  ILinearLocationLocatesElement, ILinearlyLocatedAlongILinearElement, ILinearlyLocatedAttributesElement, IReferentReferencesElement,
} from "./LinearReferencingRelationships";

/** Base class for Spatial Location Element subclasses representing properties whose value is located along a Linear-Element and only applies to a portion of an Element.
 * @beta
 */
export abstract class LinearlyLocatedAttribution extends SpatialLocationElement {
  /** @internal */
  public static override get className(): string { return "LinearlyLocatedAttribution"; }

  public attributedElement?: ILinearlyLocatedAttributesElement;

  public constructor(props: LinearlyLocatedAttributionProps, iVault: IVaultDb) {
    super(props, iVault);
    this.attributedElement = RelatedElement.fromJSON(props.attributedElement);
  }

  public getLinearElementId(): Id64String | undefined {
    return LinearlyLocated.getLinearElementId(this.iVault, this.id);
  }
}

/** Base class for Spatial Location Element implementations that are linearly located along a Linear-Element.
 * @beta
 */
export abstract class LinearLocationElement extends SpatialLocationElement implements LinearlyLocatedBase {
  /** @internal */
  public static override get className(): string { return "LinearLocationElement"; }

  public constructor(props: GeometricElement3dProps, iVault: IVaultDb) {
    super(props, iVault);
  }

  public getLinearElementId(): Id64String | undefined {
    return LinearlyLocated.getLinearElementId(this.iVault, this.id);
  }
}

/** Linear Referencing Location attached to an Element not inherently Linearly Referenced.
 * @beta
 */
export class LinearLocation extends LinearLocationElement implements LinearlyLocatedBase {
  /** @internal */
  public static override get className(): string { return "LinearLocation"; }
  public constructor(props: GeometricElement3dProps, iVault: IVaultDb) {
    super(props, iVault);
  }

  private static toProps(modelId: Id64String, categoryId: Id64String): GeometricElement3dProps {
    const props: GeometricElement3dProps = {
      classFullName: LinearLocation.classFullName,
      category: categoryId,
      model: modelId,
      code: Code.createEmpty(),
    };

    return props;
  }

  public static create(iVault: IVaultDb, modelId: Id64String, categoryId: Id64String): LinearLocation {
    return new LinearLocation(this.toProps(modelId, categoryId), iVault);
  }

  /** Insert a new `LinearLocation` using an explicit transaction.
   * @beta
   */
  public static insertFromTo(txn: EditTxn, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String;
  /** Insert a new `LinearLocation`.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearLocation.insertFromTo(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insertFromTo(iVault: IVaultDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String;
  public static insertFromTo(txnOrIVault: EditTxn | IVaultDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const newId = LinearlyLocated.insertFromTo(txn, this.toProps(modelId, categoryId), linearElementId, fromToPosition);
    ILinearLocationLocatesElement.insert(txn, newId, locatedElementId);
    return newId;
  }

  /** Insert this `LinearLocation` using an explicit transaction.
   * @beta
   */
  public insertFromTo(txn: EditTxn, linearElementId: Id64String, fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String;
  /** Insert this `LinearLocation`.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearLocation.insertFromTo(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public insertFromTo(iVault: IVaultDb, linearElementId: Id64String, fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String;
  public insertFromTo(txnOrIVault: EditTxn | IVaultDb, linearElementId: Id64String, fromToPosition: LinearlyReferencedFromToLocationProps, locatedElementId: Id64String): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const newId = LinearlyLocated.insertFromTo(txn, this.toJSON(), linearElementId, fromToPosition);
    ILinearLocationLocatesElement.insert(txn, newId, locatedElementId);
    return newId;
  }

  /** Insert a new `LinearLocation` using an explicit transaction.
   * @beta
   */
  public static insertAt(txn: EditTxn, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String;
  /** Insert a new `LinearLocation`.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearLocation.insertAt(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insertAt(iVault: IVaultDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String;
  public static insertAt(txnOrIVault: EditTxn | IVaultDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const newId = LinearlyLocated.insertAt(txn, this.toProps(modelId, categoryId), linearElementId, atPosition);
    ILinearLocationLocatesElement.insert(txn, newId, locatedElementId);
    return newId;
  }

  /** Insert this `LinearLocation` using an explicit transaction.
   * @beta
   */
  public insertAt(txn: EditTxn, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String;
  /** Insert this `LinearLocation`.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearLocation.insertAt(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public insertAt(iVault: IVaultDb, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String;
  public insertAt(txnOrIVault: EditTxn | IVaultDb, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps, locatedElementId: Id64String): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const newId = LinearlyLocated.insertAt(txn, this.toJSON(), linearElementId, atPosition);
    ILinearLocationLocatesElement.insert(txn, newId, locatedElementId);
    return newId;
  }
}

/** Base class for Physical Elements that are inherently linearly located along a Linear-Element.
 * @beta
 */
export abstract class LinearPhysicalElement extends PhysicalElement {
  /** @internal */
  public static override get className(): string { return "LinearPhysicalElement"; }

  public constructor(props: PhysicalElementProps, iVault: IVaultDb) {
    super(props, iVault);
  }
}

/** Spatial Location Element that can play the role of a Referent (known location along a Linear-Element).
 * @beta
 */
export abstract class ReferentElement extends SpatialLocationElement implements LinearlyLocatedBase {
  /** @internal */
  public static override get className(): string { return "ReferentElement"; }

  public referencedElement?: IReferentReferencesElement;

  public constructor(props: ReferentElementProps, iVault: IVaultDb) {
    super(props, iVault);
    this.referencedElement = RelatedElement.fromJSON(props.referencedElement);
  }

  public getLinearElementId(): Id64String | undefined {
    return LinearlyLocated.getLinearElementId(this.iVault, this.id);
  }
}

/** Referent-implementation turning any bis:SpatialElement not inherently Linearly-Referenced into a Referent for Linear-Referencing purposes.
 * @beta
 */
export class Referent extends ReferentElement {
  /** @internal */
  public static override get className(): string { return "Referent"; }
  public constructor(props: ReferentElementProps, iVault: IVaultDb) {
    super(props, iVault);
  }

  private static toProps(modelId: Id64String, categoryId: Id64String, referencedElementId: Id64String): ReferentElementProps {
    const props: ReferentElementProps = {
      classFullName: LinearLocation.classFullName,
      category: categoryId,
      model: modelId,
      code: Code.createEmpty(),
      referencedElement: new IReferentReferencesElement(referencedElementId),
    };

    return props;
  }

  public static create(iVault: IVaultDb, modelId: Id64String, categoryId: Id64String, referencedElementId: Id64String): Referent {
    return new Referent(this.toProps(modelId, categoryId, referencedElementId), iVault);
  }

  /** Insert a new `Referent` using an explicit transaction.
   * @beta
   */
  public static insertAt(txn: EditTxn, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, referencedElementId: Id64String): Id64String;
  /** Insert a new `Referent`.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use Referent.insertAt(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insertAt(iVault: IVaultDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, referencedElementId: Id64String): Id64String;
  public static insertAt(txnOrIVault: EditTxn | IVaultDb, modelId: Id64String, categoryId: Id64String, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps, referencedElementId: Id64String): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    return LinearlyLocated.insertAt(txn, this.toProps(modelId, categoryId, referencedElementId), linearElementId, atPosition);
  }

  /** Insert this `Referent` using an explicit transaction.
   * @beta
   */
  public insertAt(txn: EditTxn, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps): Id64String;
  /** Insert this `Referent`.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use Referent.insertAt(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public insertAt(iVault: IVaultDb, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps): Id64String;
  public insertAt(txnOrIVault: EditTxn | IVaultDb, linearElementId: Id64String, atPosition: LinearlyReferencedAtLocationProps): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    return LinearlyLocated.insertAt(txn, this.toJSON(), linearElementId, atPosition);
  }
}

abstract class ECSQLGenImpl {
  public abstract genSelect(): string;
  public selectDistinct(): boolean {
    return false;
  }
  public abstract genFromJoin(): string;
  public abstract genWhere(bindVals?: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string;
  public abstract genOrderBy(): string;
}

class AtAndFromToECSQLGenImpl extends ECSQLGenImpl {
  public genSelect(): string {
    return "coalesce(AtLocation.AtPosition.DistanceAlongFromStart, FromToLocation.FromPosition.DistanceAlongFromStart) StartDistanceAlong, " +
      "coalesce(AtLocation.AtPosition.DistanceAlongFromStart, FromToLocation.ToPosition.DistanceAlongFromStart) StopDistanceAlong, " +
      "coalesce(AtLocation.DMInstanceId, FromToLocation.DMInstanceId) LocationAspectId ";
  }
  public override selectDistinct(): boolean {
    return true;
  }
  public genFromJoin(): string {
    return "LEFT JOIN LinearReferencing.LinearlyReferencedAtLocation AtLocation ON LinearlyLocated.InstanceId = AtLocation.Element.Id " +
      "LEFT JOIN LinearReferencing.LinearlyReferencedFromToLocation FromToLocation ON LinearlyLocated.InstanceId = FromToLocation.Element.Id ";
  }
  public genWhere(bindVals: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string {
    const fromCompOp: string = (inclusiveFrom === undefined || inclusiveFrom) ? ">=" : ">";
    const toCompOp: string = (inclusiveTo === undefined || inclusiveTo) ? "<=" : "<";

    let dmSql = "";
    if (from !== undefined && to !== undefined) {
      dmSql += "(AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? AND AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ?) OR (FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? AND FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ?) " + "OR (FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? AND FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ?) OR (FromToLocation.FromPosition.DistanceAlongFromStart <= ? AND FromToLocation.ToPosition.DistanceAlongFromStart >= ?) ";

      bindVals.push(from);
      bindVals.push(to);
      bindVals.push(from);
      bindVals.push(to);
      bindVals.push(from);
      bindVals.push(to);
      bindVals.push(from);
      bindVals.push(to);
    } else if (from !== undefined) {
      dmSql += "AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? OR FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? ";

      bindVals.push(from);
      bindVals.push(from);
      bindVals.push(from);
    } else if (to !== undefined) {
      dmSql += "AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ? OR FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ? ";

      bindVals.push(to);
      bindVals.push(to);
      bindVals.push(to);
    } else {
      dmSql += "(AtLocation.AtPosition.DistanceAlongFromStart IS NOT NULL) OR ";
      dmSql += "(FromToLocation.FromPosition.DistanceAlongFromStart IS NOT NULL) ";
    }

    return dmSql;
  }
  public genOrderBy(): string {
    return "coalesce(AtLocation.AtPosition.DistanceAlongFromStart, FromToLocation.FromPosition.DistanceAlongFromStart)";
  }
}

class FromToECSQLGenImpl extends ECSQLGenImpl {
  public genSelect(): string {
    return "FromToLocation.FromPosition.DistanceAlongFromStart StartDistanceAlong, FromToLocation.ToPosition.DistanceAlongFromStart StopDistanceAlong, FromToLocation.DMInstanceId LocationAspectId ";
  }
  public genFromJoin(): string {
    return "INNER JOIN LinearReferencing.LinearlyReferencedFromToLocation FromToLocation ON LinearlyLocated.InstanceId = FromToLocation.Element.Id ";
  }
  public genWhere(bindVals: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string {
    const fromCompOp: string = (inclusiveFrom === undefined || inclusiveFrom) ? ">=" : ">";
    const toCompOp: string = (inclusiveTo === undefined || inclusiveTo) ? "<=" : "<";

    let dmSql = "";
    if (from !== undefined && to !== undefined) {
      dmSql += "AND ((FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? AND FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ?) OR (FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? AND FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ?) OR (FromToLocation.FromPosition.DistanceAlongFromStart <= ? AND FromToLocation.ToPosition.DistanceAlongFromStart >= ?)) ";

      bindVals.push(from);
      bindVals.push(to);
      bindVals.push(from);
      bindVals.push(to);
      bindVals.push(from);
      bindVals.push(to);
    } else if (from !== undefined) {
      dmSql += "AND (FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ?)";

      bindVals.push(from);
      bindVals.push(from);
    } else if (to !== undefined) {
      dmSql += "AND (FromToLocation.FromPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ? OR FromToLocation.ToPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ?) ";

      bindVals.push(to);
      bindVals.push(to);
    } else {
      dmSql += "FromToLocation.FromPosition.DistanceAlongFromStart IS NOT NULL ";
    }

    return dmSql;
  }
  public genOrderBy(): string {
    return "FromToLocation.FromPosition.DistanceAlongFromStart";
  }
}

class AtECSQLGenImpl extends ECSQLGenImpl {
  public genSelect(): string {
    return "AtLocation.AtPosition.DistanceAlongFromStart StartDistanceAlong, AtLocation.AtPosition.DistanceAlongFromStart StopDistanceAlong, AtLocation.DMInstanceId LocationAspectId ";
  }
  public genFromJoin(): string {
    return "INNER JOIN LinearReferencing.LinearlyReferencedAtLocation AtLocation ON LinearlyLocated.InstanceId = AtLocation.Element.Id ";
  }
  public genWhere(bindVals: any[], from?: number, inclusiveFrom?: boolean, to?: number, inclusiveTo?: boolean): string {
    const fromCompOp: string = (inclusiveFrom === undefined || inclusiveFrom) ? ">=" : ">";
    const toCompOp: string = (inclusiveTo === undefined || inclusiveTo) ? "<=" : "<";

    let dmSql = "";
    if (from !== undefined && to !== undefined) {
      dmSql += "AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? AND AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ? ";

      bindVals.push(from);
      bindVals.push(to);
    } else if (from !== undefined) {
      dmSql += "AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += fromCompOp;
      dmSql += " ? ";

      bindVals.push(from);
    } else if (to !== undefined) {
      dmSql += "AtLocation.AtPosition.DistanceAlongFromStart ";
      dmSql += toCompOp;
      dmSql += " ? ";

      bindVals.push(to);
    } else
      dmSql += "AtLocation.AtPosition.DistanceAlongFromStart IS NOT NULL ";

    return dmSql;
  }
  public genOrderBy(): string {
    return "AtLocation.AtPosition.DistanceAlongFromStart";
  }
}

class QueryLinearLocationsECSQLGen {
  private readonly _params: QueryParams;
  private _dmSql: string;

  private _addSelectClause(impl: ECSQLGenImpl): void {
    let select = "SELECT ";

    if (impl.selectDistinct())
      select += "DISTINCT ";

    select += "LinearlyLocated.InstanceId LinearlyLocatedId, printf('%s:%s', meta.DMSchemaDef.Name, meta.DMClassDef.Name) LinearlyLocatedClassFullName, ";
    select += impl.genSelect();

    this._dmSql += select;
  }

  private _parseClassFullName(classFullName: string): [string, string] | undefined {
    const parts = classFullName.split(":");
    if (parts.length !== 2)
      return undefined;

    return [parts[0], parts[1]];
  }

  private _genLinearlyLocated(): string {
    return "meta.DMSchemaDef JOIN meta.DMClassDef USING meta.SchemaOwnsClasses JOIN " +
      "(SELECT coalesce(Located.TargetDMInstanceId, Along.SourceDMInstanceId) InstanceId, " +
      "coalesce(Located.TargetDMClassId, Along.SourceDMClassId) ClassId " +
      "FROM LinearReferencing.ILinearlyLocatedAlongILinearElement Along LEFT JOIN " +
      "LinearReferencing.ILinearLocationLocatesElement Located ON Along.SourceDMInstanceId = Located.SourceDMInstanceId " +
      "WHERE Along.TargetDMInstanceId = ?) LinearlyLocated ON meta.DMClassDef.DMInstanceId = LinearlyLocated.ClassId ";
  }

  private _addFromClause(impl: ECSQLGenImpl/* bvector<double>& bindVals */): void {
    let from = "FROM ";
    from += this._genLinearlyLocated();
    from += impl.genFromJoin();

    this._dmSql += from;
  }

  private _addWhereClause(impl: ECSQLGenImpl, bindVals: any[]) {
    let where = "WHERE ";

    where += impl.genWhere(
      bindVals,
      this._params.fromDistanceAlong,
      (this._params.fromComparisonOption === undefined ||
        this._params.fromComparisonOption === ComparisonOption.Inclusive),
      this._params.toDistanceAlong,
      (this._params.toComparisonOption === undefined ||
        this._params.toComparisonOption === ComparisonOption.Inclusive));

    if (this._params.linearlyLocatedClassFullNames !== undefined) {
      if (where.length > 6)
        where += "AND ";

      if (1 === this._params.linearlyLocatedClassFullNames.length) {
        const classFullName = this._params.linearlyLocatedClassFullNames[0];
        const schemaNameClassName = this._parseClassFullName(classFullName);
        if (schemaNameClassName === undefined)
          throw new IVaultError(0, "Invalid full class name");

        where += `meta.DMSchemaDef.Name='${schemaNameClassName[0]}' AND meta.DMClassDef.Name='${schemaNameClassName[1]}' `;
      } else if (1 < this._params.linearlyLocatedClassFullNames.length) {
        where += "(";
        for (const classFullName of this._params.linearlyLocatedClassFullNames) {
          if (classFullName === undefined)
            continue;

          const schemaNameClassName = this._parseClassFullName(classFullName);
          if (schemaNameClassName === undefined)
            continue;

          where += `(meta.DMSchemaDef.Name='${schemaNameClassName[0]}' AND meta.DMClassDef.Name='${schemaNameClassName[1]}') OR `;
        }

        where = where.substring(0, where.length - 4); // Removing last OR
        where += ") ";
      }
    }

    this._dmSql += where;
  }

  private _addOrderByClause(impl: ECSQLGenImpl): void {
    let orderBy = "ORDER BY ";
    orderBy += impl.genOrderBy();

    this._dmSql += orderBy;
  }

  private _createImpl(): ECSQLGenImpl {
    if (this._params.linearlyReferencedLocationTypeFilter === undefined ||
      this._params.linearlyReferencedLocationTypeFilter === LinearlyReferencedLocationType.Any) {
      return new AtAndFromToECSQLGenImpl();
    } else if (this._params.linearlyReferencedLocationTypeFilter === LinearlyReferencedLocationType.FromTo) {
      return new FromToECSQLGenImpl();
    } else {
      return new AtECSQLGenImpl();
    }
  }

  public constructor(params: QueryParams) {
    this._params = params;
    this._dmSql = "";
  }

  public generate(linearElementId: Id64String): [string, any[]] {
    this._dmSql = "";
    const impl = this._createImpl();

    const bindVals: any[] = [linearElementId];
    this._addSelectClause(impl);
    this._addFromClause(impl);
    this._addWhereClause(impl, bindVals);
    this._addOrderByClause(impl);

    return [this._dmSql, bindVals];
  }
}

/** A class offering services for LinearlyLocated elements.
 * @beta
 */
export class LinearlyLocated {
  private static insertBasic(txn: EditTxn, elProps: ElementProps, linearElementId: Id64String): Id64String {
    const newId = txn.insertElement(elProps);

    const linearlyLocatedAlongLinearElement =
      ILinearlyLocatedAlongILinearElement.create(txn.iVault, newId, linearElementId);
    linearlyLocatedAlongLinearElement.insert(txn);

    return newId;
  }

  /** Insert a new LinearlyLocated element into an iVault at a specific location along an existing Linear-Element.
   * @param txn The EditTxn used to perform inserts.
   * @param elProps The properties of the new element.
   * @param linearElementId The Id of the Linear-Element along which the new LinearlyLocated will be inserted.
   * @param atPosition Linear position.
   * @returns The newly inserted element's Id.
   * @throws [[IVaultError]] if unable to insert the element.
   */
  public static insertAt(txn: EditTxn, elProps: ElementProps, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps): Id64String;
  /** Insert a new LinearlyLocated element into an iVault at a specific location along an existing Linear-Element.
   * @param iVault The iVault to insert the new element into.
   * @param elProps The properties of the new element.
   * @param linearElementId The Id of the Linear-Element along which the new LinearlyLocated will be inserted.
   * @param atPosition Linear position.
   * @returns The newly inserted element's Id.
   * @throws [[IVaultError]] if unable to insert the element.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearlyLocated.insertAt(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insertAt(iVault: IVaultDb, elProps: ElementProps, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps): Id64String;
  public static insertAt(txnOrIVault: EditTxn | IVaultDb, elProps: ElementProps, linearElementId: Id64String,
    atPosition: LinearlyReferencedAtLocationProps): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const newId: Id64String = this.insertBasic(txn, elProps, linearElementId);
    LinearlyReferencedAtLocation.insert(txn, newId, atPosition.atPosition,
      atPosition.fromReferent === undefined ? undefined : atPosition.fromReferent.id);
    return newId;
  }

  /** Insert a new LinearlyLocated element into an iVault at a specific from-to location along an existing Linear-Element.
   * @param txn The EditTxn used to perform inserts.
   * @param elProps The properties of the new element.
   * @param linearElementId The Id of the Linear-Element along which the new LinearlyLocated will be inserted.
   * @param fromToPosition Linear position.
   * @returns The newly inserted element's Id.
   * @throws [[IVaultError]] if unable to insert the element.
   */
  public static insertFromTo(txn: EditTxn, elProps: ElementProps, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps): Id64String;
  /** Insert a new LinearlyLocated element into an iVault at a specific from-to location along an existing Linear-Element.
   * @param iVault The iVault to insert the new element into.
   * @param elProps The properties of the new element.
   * @param linearElementId The Id of the Linear-Element along which the new LinearlyLocated will be inserted.
   * @param fromToPosition Linear position.
   * @returns The newly inserted element's Id.
   * @throws [[IVaultError]] if unable to insert the element.
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearlyLocated.insertFromTo(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static insertFromTo(iVault: IVaultDb, elProps: ElementProps, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps): Id64String;
  public static insertFromTo(txnOrIVault: EditTxn | IVaultDb, elProps: ElementProps, linearElementId: Id64String,
    fromToPosition: LinearlyReferencedFromToLocationProps): Id64String {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const newId: Id64String = this.insertBasic(txn, elProps, linearElementId);
    LinearlyReferencedFromToLocation.insert(txn, newId,
      fromToPosition.fromPosition, fromToPosition.toPosition,
      fromToPosition.fromPositionFromReferent === undefined ? undefined : fromToPosition.fromPositionFromReferent.id,
      fromToPosition.toPositionFromReferent === undefined ? undefined : fromToPosition.toPositionFromReferent.id);
    return newId;
  }

  private static getLinearLocations<T>(iVault: IVaultDb, linearlyLocatedElementId: Id64String, fullClassName: string): T[] {
    const aspects: ElementAspect[] =
      iVault.elements.getAspects(linearlyLocatedElementId, fullClassName);

    if (aspects.length === 0)
      return [];

    const retVal: T[] = [];
    for (const aspect of aspects) {
      const linearAspect = (aspect as unknown) as T;
      retVal.push(linearAspect);
    }

    return retVal;
  }

  private static queryFirstLinearLocationAspectId(iVault: IVaultDb, linearlyLocatedElementId: Id64String, className: string): Id64String | undefined {
    let aspectId: Id64String | undefined;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.withPreparedStatement(`SELECT DMInstanceId FROM LinearReferencing.${className} WHERE Element.Id=? LIMIT 1`, (stmt: DMSqlStatement) => {
      stmt.bindId(1, linearlyLocatedElementId);
      if (stmt.step() === DbResult.BE_SQLITE_ROW)
        aspectId = stmt.getValue(0).getId();
    });

    return aspectId;
  }

  /** Query for LinearlyReferenced AtLocation aspects owned by the specified LinearlyLocated Element.
   * @param iVault The iVault to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query aspects about.
   * @returns Returns an array of LinearlyReferencedAtLocation.
   * @throws [[IVaultError]]
   */
  public static getAtLocations(iVault: IVaultDb, linearlyLocatedElementId: Id64String): LinearlyReferencedAtLocation[] {
    return this.getLinearLocations<LinearlyReferencedAtLocation>(
      iVault, linearlyLocatedElementId, "LinearReferencing:LinearlyReferencedAtLocation");
  }

  /** Query for the single LinearlyReferenced AtLocation aspect owned by the specified LinearlyLocated Element. If more than one aspect is expected, use [[getAtLocations]] instead.
   * @param iVault The iVault to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query about.
   * @returns Returns an LinearlyReferencedAtLocation or undefined is none is found.
   * @throws [[IVaultError]]
   */
  public static getAtLocation(iVault: IVaultDb, linearlyLocatedElementId: Id64String): LinearlyReferencedAtLocation | undefined {
    const linearLocations = this.getAtLocations(iVault, linearlyLocatedElementId);
    if (linearLocations.length === 0)
      return undefined;
    else {
      assert(linearLocations.length === 1);
      return linearLocations[0];
    }
  }

  /** Update an existing LinearlyReferencedAtLocation aspect within the iVault.
   * @param iVault The iVault to update.
   * @param linearlyLocatedElementId The Id of the owning Linearly Located Element.
   * @param linearLocationProps The properties to use to update the LinearlyReferencedAtLocation aspect.
   * @param aspectId The Id of the aspect to update. If not known, the first aspectId will be looked-up.
   * @throws [[IVaultError]]
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearlyLocated.updateAtLocation(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static updateAtLocation(iVault: IVaultDb, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedAtLocationProps,
    aspectId?: Id64String): void;

  public static updateAtLocation(txn: EditTxn, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedAtLocationProps,
    aspectId?: Id64String): void;
  public static updateAtLocation(txnOrIVault: EditTxn | IVaultDb, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedAtLocationProps,
    aspectId?: Id64String): void {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const iVault = txn.iVault;
    let linearLocAspectId: Id64String;
    if (aspectId !== undefined)
      linearLocAspectId = aspectId;
    else {
      const queriedAspectId = this.queryFirstLinearLocationAspectId(iVault, linearlyLocatedElementId, "LinearlyReferencedAtLocation");
      if (queriedAspectId === undefined)
        throw new Error("LinearlyReferencedAtLocation aspect not found");

      linearLocAspectId = queriedAspectId;
    }

    const linearLocationAspectProps: LinearlyReferencedAtLocationAspectProps = {
      id: linearLocAspectId,
      element: { id: linearlyLocatedElementId },
      classFullName: "LinearReferencing:LinearlyReferencedAtLocation",
      atPosition: linearLocationProps.atPosition,
      fromReferent: linearLocationProps.fromReferent,
    };

    txn.updateAspect(linearLocationAspectProps);
  }

  /** Update an existing LinearlyReferencedFromToLocation aspect within the iVault.
   * @param iVault The iVault to update.
   * @param linearlyLocatedElementId The Id of the owning Linearly Located Element.
   * @param linearLocationProps The properties to use to update the LinearlyReferencedFromToLocation aspect.
   * @param aspectId The Id of the aspect to update. If not known, the first aspectId will be looked-up.
   * @throws [[IVaultError]]
   * @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use LinearlyLocated.updateFromToLocation(txn, ...) instead, within an explicit EditTxn scope (or via withEditTxn). See EditTxn documentation for migration help.
   */
  public static updateFromToLocation(iVault: IVaultDb, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedFromToLocationProps,
    aspectId?: Id64String): void;

  public static updateFromToLocation(txn: EditTxn, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedFromToLocationProps,
    aspectId?: Id64String): void;
  public static updateFromToLocation(txnOrIVault: EditTxn | IVaultDb, linearlyLocatedElementId: Id64String, linearLocationProps: LinearlyReferencedFromToLocationProps,
    aspectId?: Id64String): void {
    const txn = txnOrIVault instanceof EditTxn ? txnOrIVault : txnOrIVault[_implicitTxn];
    const iVault = txn.iVault;
    let linearLocAspectId: Id64String;
    if (aspectId !== undefined)
      linearLocAspectId = aspectId;
    else {
      const queriedAspectId = this.queryFirstLinearLocationAspectId(iVault, linearlyLocatedElementId, "LinearlyReferencedFromToLocation");
      if (queriedAspectId === undefined)
        throw new Error("LinearlyReferencedFromToLocation aspect not found");

      linearLocAspectId = queriedAspectId;
    }

    const linearLocationAspectProps: LinearlyReferencedFromToLocationAspectProps = {
      id: linearLocAspectId,
      element: { id: linearlyLocatedElementId, relClassName: "LinearReferencing:ILinearlyLocatedOwnsFromToLocations" },
      classFullName: "LinearReferencing:LinearlyReferencedFromToLocation",
      fromPosition: linearLocationProps.fromPosition,
      fromPositionFromReferent: linearLocationProps.fromPositionFromReferent,
      toPosition: linearLocationProps.toPosition,
      toPositionFromReferent: linearLocationProps.toPositionFromReferent,
    };

    txn.updateAspect(linearLocationAspectProps);
  }

  /** Query for the Id of the Linear-Element along which the specified LinearlyLocated Element is located.
   * @param iVault The iVault to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query a Linear-Element for.
   * @returns Returns the Id of the Linear-Element or undefined is none is assigned.
   */
  public static getLinearElementId(iVault: IVaultDb, linearlyLocatedElementId: Id64String): Id64String | undefined {
    let linearElementId: Id64String | undefined;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.withPreparedStatement("SELECT TargetDMInstanceId FROM LinearReferencing.ILinearlyLocatedAlongILinearElement WHERE SourceDMInstanceId = ?", (stmt: DMSqlStatement) => {
      stmt.bindId(1, linearlyLocatedElementId);

      if (DbResult.BE_SQLITE_ROW === stmt.step())
        linearElementId = stmt.getValue(0).getId();
      else
        linearElementId = undefined;
    });

    return linearElementId;
  }

  /** Query for LinearlyReferenced FromToLocation aspects owned by the specified LinearlyLocated Element.
   * @param iVault The iVault to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query aspects about.
   * @returns Returns an array of LinearlyReferencedFromToLocation.
   * @throws [[IVaultError]]
   */
  public static getFromToLocations(iVault: IVaultDb, linearlyLocatedElementId: Id64String): LinearlyReferencedFromToLocation[] {
    return this.getLinearLocations<LinearlyReferencedFromToLocation>(
      iVault, linearlyLocatedElementId, "LinearReferencing:LinearlyReferencedFromToLocation");
  }

  /** Query for the single LinearlyReferenced FromToLocation aspect owned by the specified LinearlyLocated Element. If more than one aspect is expected, use [[getFromToLocations]] instead.
   * @param iVault The iVault to query from.
   * @param linearlyLocatedElementId The id of the LinearlyLocated Element to query about.
   * @returns Returns an LinearlyReferencedFromToLocation or undefined is none is found.
   * @throws [[IVaultError]]
   */
  public static getFromToLocation(iVault: IVaultDb, linearlyLocatedElementId: Id64String): LinearlyReferencedFromToLocation | undefined {
    const linearLocations = this.getFromToLocations(iVault, linearlyLocatedElementId);
    if (linearLocations.length === 0)
      return undefined;
    else {
      assert(linearLocations.length === 1);
      return linearLocations[0];
    }
  }
}

/** Base interface to optionally be implemented by Elements inherently Linearly-Located. Implementors should choose the
 * appropriate sub-interface rather than implementing LinearlyLocatedBase directly.
 * @beta
 */
export interface LinearlyLocatedBase {
  getLinearElementId(): Id64String | undefined;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always a single at-position.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedSingleAt extends LinearlyLocatedBase {
  getAtLocation(): LinearlyReferencedAtLocation | undefined;
  updateAtLocation(linearLocation: LinearlyReferencedAtLocationProps, aspectId?: Id64String): void;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always at-positions.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedMultipleAt extends LinearlyLocatedBase {
  getAtLocations(): LinearlyReferencedAtLocation[];
  updateAtLocation(linearLocation: LinearlyReferencedAtLocationProps, aspectId: Id64String): void;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always a single from-to-position.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedSingleFromTo extends LinearlyLocatedBase {
  getFromToLocation(): LinearlyReferencedFromToLocation | undefined;
  updateFromToLocation(linearLocation: LinearlyReferencedFromToLocationProps, aspectId?: Id64String): void;
}

/** Interface to optionally be implemented by Elements inherently Linearly-Located whose linear-locations are always from-to-positions.
 * It also provides convenient APIs for callers to reach Linear-Referencing data stored on aspects. Classes implementing this interface should
 * make use of the services provided by [LinearlyLocated]($linear-referencing-backend).
 * @beta
 */
export interface LinearlyLocatedMultipleFromTo extends LinearlyLocatedBase {
  getFromToLocations(): LinearlyReferencedFromToLocation[];
  updateFromToLocation(linearLocation: LinearlyReferencedFromToLocationProps, aspectId: Id64String): void;
}

/** A class offering services for linearly-located data along a Linear-Element.
 * @beta
 */
export class LinearElement {
  /** Query for LinearLocationReferences based on specified query parameters.
   * @returns Returns an array of LinearLocationReferences.
   * @throws [[IVaultError]]
   */
  public static queryLinearLocations(iVault: IVaultDb, linearElementId: Id64String, queryParams: QueryParams): LinearLocationReference[] {
    const dmSqlGen = new QueryLinearLocationsECSQLGen(queryParams);
    const ecsqlAndBindVals = dmSqlGen.generate(linearElementId);

    const linearLocationRefs: LinearLocationReference[] = [];
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    iVault.withPreparedStatement(ecsqlAndBindVals[0], (stmt: DMSqlStatement) => {
      stmt.bindValues(ecsqlAndBindVals[1]);

      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        const linearLocationRef: LinearLocationReference = {
          linearlyLocatedId: stmt.getValue(0).getId(),
          linearlyLocatedClassFullName: stmt.getValue(1).getString(),
          startDistanceAlong: stmt.getValue(2).getDouble(),
          stopDistanceAlong: stmt.getValue(3).getDouble(),
          locationAspectId: stmt.getValue(4).getId(),
        };

        linearLocationRefs.push(linearLocationRef);
      }
    });

    return linearLocationRefs;
  }
}
