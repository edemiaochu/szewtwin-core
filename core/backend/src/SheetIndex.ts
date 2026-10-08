/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Elements
 */

import { BisCodeSpec, Code, CodeScopeProps, CodeSpec, ElementProps, EntityReferenceSet, IVaultError, RelatedElementProps, SheetIndexEntryProps, SheetIndexFolderProps, SheetIndexReferenceProps, SheetReferenceProps } from "@szewtwin/core-common";
import { InformationReferenceElement, Sheet } from "./Element";
import { EditTxn } from "./EditTxn";
import { IVaultDb } from "./IVaultDb";
import { Id64String, IVaultStatus } from "@szewtwin/core-szewec";
import { SheetIndexFolderOwnsEntries, SheetIndexOwnsEntries, SheetIndexReferenceRefersToSheetIndex, SheetReferenceRefersToSheet } from "./NavigationRelationship";
import { _implicitTxn } from "./internal/Symbols";

/** Arguments used to create a [[SheetIndexEntry]].
 * @beta
 */
export interface SheetIndexEntryCreateArgs {
  /** The iVault that will contain the sheet index entry. */
  iVaultDb: IVaultDb;
  /** The Id of the [[SheetIndexModel]] that will contain the sheet index entry. */
  sheetIndexModelId: Id64String;
  /** The [[SheetIndex]] or [[SheetIndexFolder]] that is parent to this SheetIndexEntry */
  parentId: Id64String;
  /** The name of the SheetIndexEntry */
  name: string;
  /** The priority of the SheetIndexEntry */
  priority: number;
}

/** Arguments supplied when creating a [[SheetIndexReference]].
 * @beta
 */
export interface SheetIndexReferenceCreateArgs extends SheetIndexEntryCreateArgs {
  /** The [[SheetIndex]] to which the reference refers. */
  sheetIndexId?: Id64String;
}

/** Arguments supplied when creating a [[SheetReference]].
 * @beta
 */
export interface SheetReferenceCreateArgs extends SheetIndexEntryCreateArgs {
  /** The [[Sheet]] to which the reference refers. */
  sheetId?: Id64String;
}

/** A [structured collection]($docs/bis/domains/drawings-sheets#sheet-index) of [[SheetIndexEntry]]s.
 * The sheet index is a tree whose leaf nodes refer to [[Sheet]]s, optionally grouped by [[SheetIndexFolder]]s and/or incorporating
 * sub-trees via [[SheetIndexReference]]s.
 * @beta
 */
export class SheetIndex extends InformationReferenceElement {
  public static override get className(): string { return "SheetIndex"; }

  /** Create a Code for a SheetIndex given a name that is meant to be unique within the scope of the specified SheetIndexModel.
   * @param iVault  The IVaultDb
   * @param scopeSheetIndexModelId The Id of the Model that contains the LinkElement and provides the scope for its name.
   * @param codeValue The SheetIndex name
   */
  public static createCode(iVault: IVaultDb, scopeSheetIndexModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iVault.codeSpecs.getByName(BisCodeSpec.sheetIndex);
    return new Code({ spec: codeSpec.id, scope: scopeSheetIndexModelId, value: codeValue });
  }

  /** Create a SheetIndex
   * @param iVaultDb The IVaultDb
   * @param modelId The Id of the Model that contains the SheetIndex and provides the scope for its name.
   * @param name The name (codeValue) of the SheetIndex
   * @returns The newly constructed SheetIndex
   * @throws [[IVaultError]] if there is a problem creating the SheetIndex
   */
  public static create(iVaultDb: IVaultDb, modelId: Id64String, name: string): SheetIndex {
    const props: ElementProps = {
      classFullName: this.classFullName,
      code: this.createCode(iVaultDb, modelId, name).toJSON(),
      model: modelId,
    };
    return new this(props, iVaultDb);
  }

  /** Insert a SheetIndex
   * @param iVaultDb The IVaultDb
   * @param modelId The Id of the Model that contains the SheetIndex and provides the scope for its name.
   * @param name The name (codeValue) of the SheetIndex
   * @returns The Id of the newly inserted SheetIndex
   * @throws [[IVaultError]] if there is a problem inserting the SheetIndex
   */
  public static insert(txn: EditTxn, modelId: Id64String, name: string): Id64String;
  /** @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use SheetIndex.insert(txn, ...) instead. */
  public static insert(iVaultDb: IVaultDb, modelId: Id64String, name: string): Id64String;
  public static insert(txnOrDb: EditTxn | IVaultDb, modelId: Id64String, name: string): Id64String {
    const txn = txnOrDb instanceof EditTxn ? txnOrDb : txnOrDb[_implicitTxn];
    const instance = this.create(txn.iVault, modelId, name);
    instance.id = instance.insert(txn);
    return instance.id;
  }
}

/** The base class for all elements that can participate in a [[SheetIndex]] hierarchy.
 * @beta
*/
export abstract class SheetIndexEntry extends InformationReferenceElement {
  public static override get className(): string { return "SheetIndexEntry"; }
  /** Can be used to prioritize or order members within a SheetIndex or SheetIndexFolder. */
  public entryPriority: number;

  protected constructor(props: SheetIndexEntryProps, iVault: IVaultDb) {
    super(props, iVault);
    this.entryPriority = props.entryPriority;
  }

  public override toJSON(): SheetIndexEntryProps {
    return { ...super.toJSON(), entryPriority: this.entryPriority };
  }

  /** Create a Code for a Sheet Index Entry given a name that is meant to be unique within the scope of the specified SheetIndexModel.
   * @param iVault  The IVault
   * @param scopeModelId The Id of the [[SheetIndexModel]] that contains the [[SheetIndexEntry]] and provides the scope for its name.
   * @param codeValue The name of the entry
   */
  public static createCode(iVaultDb: IVaultDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iVaultDb.codeSpecs.getByName(BisCodeSpec.sheetIndexEntry);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  protected static createParentRelationshipProps(iVaultDb: IVaultDb, id: Id64String): RelatedElementProps {
    const parentElementProps = iVaultDb.elements.getElementProps(id);
    const isFolder = parentElementProps.classFullName === SheetIndexFolder.classFullName;
    const relClass = isFolder ? SheetIndexFolderOwnsEntries : SheetIndexOwnsEntries;
    return { id, relClassName: relClass.classFullName };
  }

  protected static createProps(arg: SheetIndexEntryCreateArgs) {
    const parent = this.createParentRelationshipProps(arg.iVaultDb, arg.parentId);
    const props: SheetIndexEntryProps = {
      classFullName: this.classFullName,
      model: arg.sheetIndexModelId,
      code: this.createCode(arg.iVaultDb, arg.sheetIndexModelId, arg.name),
      entryPriority: arg.priority,
      parent,
    };
    return props;
  }
}

/** A container used to group [[SheetIndexEntry]]s within a [[SheetIndex]].
 * @beta
 */
export class SheetIndexFolder extends SheetIndexEntry {
  public static override get className(): string { return "SheetIndexFolder"; }

  /** Create a new SheetIndexFolder
   * @returns The newly constructed SheetIndexFolder element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static create(arg: SheetIndexEntryCreateArgs) {
    const props: SheetIndexFolderProps = this.createProps(arg);
    return new this(props, arg.iVaultDb);
  }

  /** Create a new SheetIndexFolder
   * @returns The Id of the newly inserted SheetIndexFolder element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static insert(txn: EditTxn, arg: Omit<SheetIndexEntryCreateArgs, "iVaultDb">): Id64String;
  /** @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use SheetIndexFolder.insert(txn, ...) instead. */
  public static insert(arg: SheetIndexEntryCreateArgs): Id64String;
  public static insert(txnOrArg: EditTxn | SheetIndexEntryCreateArgs, arg?: Omit<SheetIndexEntryCreateArgs, "iVaultDb">): Id64String {
    const txn = txnOrArg instanceof EditTxn ? txnOrArg : txnOrArg.iVaultDb[_implicitTxn];
    const createArg = txnOrArg instanceof EditTxn ? arg! : {
      sheetIndexModelId: txnOrArg.sheetIndexModelId,
      parentId: txnOrArg.parentId,
      name: txnOrArg.name,
      priority: txnOrArg.priority,
    };
    const instance = this.create({ ...createArg, iVaultDb: txn.iVault });
    instance.id = instance.insert(txn);
    return instance.id;
  }
}

/** A node within one [[SheetIndex]] that incorporates another [[SheetIndex]] as a sub-tree.
 * @beta
*/
export class SheetIndexReference extends SheetIndexEntry {
  public static override get className(): string { return "SheetIndexReference"; }

  /** The bis:SheetIndex that this bis:SheetIndexReference is pointing to. */
  public sheetIndex?: SheetIndexReferenceRefersToSheetIndex;

  protected constructor(props: SheetIndexReferenceProps, iVault: IVaultDb) {
    super(props, iVault);
    if (props.sheetIndex) {
      const sheetIndex = iVault.elements.tryGetElement<SheetIndex>(props.sheetIndex.id);
      if (!sheetIndex)
        throw new IVaultError(IVaultStatus.NotFound, "SheetIndex not found");

      this.sheetIndex = new SheetIndexReferenceRefersToSheetIndex(props.sheetIndex.id);
    }
  }

  protected static createReferenceRelationshipProps(id: Id64String): RelatedElementProps {
    return { id, relClassName: SheetIndexReferenceRefersToSheetIndex.classFullName };
  }

  public override toJSON(): SheetIndexReferenceProps { // This override only specializes the return type
    return {
      ...super.toJSON(),
      sheetIndex: this.sheetIndex ? this.sheetIndex.toJSON() : undefined,
    };
  }

  /** Create a new SheetIndexReference
   * @returns The newly constructed SheetIndexReference element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static create(arg: SheetIndexReferenceCreateArgs) {
    const props: SheetIndexReferenceProps = {
      ...this.createProps(arg),
      sheetIndex: arg.sheetIndexId ? this.createReferenceRelationshipProps(arg.sheetIndexId) : undefined,
    };
    return new this(props, arg.iVaultDb);
  }

  /** Create a new SheetIndexReference
   * @returns The Id of the newly inserted SheetIndexReference element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static insert(txn: EditTxn, arg: Omit<SheetIndexReferenceCreateArgs, "iVaultDb">): Id64String;
  /** @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use SheetIndexReference.insert(txn, ...) instead. */
  public static insert(arg: SheetIndexReferenceCreateArgs): Id64String;
  public static insert(txnOrArg: EditTxn | SheetIndexReferenceCreateArgs, arg?: Omit<SheetIndexReferenceCreateArgs, "iVaultDb">): Id64String {
    const txn = txnOrArg instanceof EditTxn ? txnOrArg : txnOrArg.iVaultDb[_implicitTxn];
    const createArg = txnOrArg instanceof EditTxn ? arg! : {
      sheetIndexModelId: txnOrArg.sheetIndexModelId,
      parentId: txnOrArg.parentId,
      name: txnOrArg.name,
      priority: txnOrArg.priority,
      sheetIndexId: txnOrArg.sheetIndexId,
    };
    const instance = this.create({ ...createArg, iVaultDb: txn.iVault });
    instance.id = instance.insert(txn);
    return instance.id;
  }

  /** @alpha */
  protected override collectReferenceIds(referenceIds: EntityReferenceSet): void {
    super.collectReferenceIds(referenceIds);
    if (this.sheetIndex)
      referenceIds.addElement(this.sheetIndex.id);
  }
}

/** A leaf node in a [[SheetIndex]] that refers to a specific [[Sheet]].
 * @beta
*/
export class SheetReference extends SheetIndexEntry {
  public static override get className(): string { return "SheetReference"; }

  /** The bis:Sheet that this bis:SheetReference is pointing to. */
  public sheet: SheetReferenceRefersToSheet | undefined;

  protected constructor(props: SheetReferenceProps, iVault: IVaultDb) {
    super(props, iVault);
    if (props.sheet) {
      const sheet = iVault.elements.tryGetElement<Sheet>(props.sheet.id);
      if (!sheet)
        throw new IVaultError(IVaultStatus.NotFound, "Sheet not found");

      this.sheet = new SheetReferenceRefersToSheet(sheet.id);
    }
  }

  protected static createReferenceRelationshipProps(id: Id64String): RelatedElementProps {
    return { id, relClassName: SheetIndexReferenceRefersToSheetIndex.classFullName };
  }

  public override toJSON(): SheetReferenceProps { // This override only specializes the return type
    return {
      ...super.toJSON(),
      sheet: this.sheet ? this.sheet.toJSON() : undefined,
    };
  }

  /** Create a new SheetReference
   * @returns The newly constructed SheetReference element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static create(arg: SheetReferenceCreateArgs) {
    const props: SheetReferenceProps = {
      ...this.createProps(arg),
      sheet: arg.sheetId ? this.createReferenceRelationshipProps(arg.sheetId) : undefined,
    };
    return new this(props, arg.iVaultDb);
  }

  /** Insert a new SheetReference
   * @returns The Id of the newly inserted SheetReference element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static insert(txn: EditTxn, arg: Omit<SheetReferenceCreateArgs, "iVaultDb">): Id64String;
  /** @deprecated in 5.1.9 - will not be removed until after 2027-05-04. Use SheetReference.insert(txn, ...) instead. */
  public static insert(arg: SheetReferenceCreateArgs): Id64String;
  public static insert(txnOrArg: EditTxn | SheetReferenceCreateArgs, arg?: Omit<SheetReferenceCreateArgs, "iVaultDb">): Id64String {
    const txn = txnOrArg instanceof EditTxn ? txnOrArg : txnOrArg.iVaultDb[_implicitTxn];
    const createArg = txnOrArg instanceof EditTxn ? arg! : {
      sheetIndexModelId: txnOrArg.sheetIndexModelId,
      parentId: txnOrArg.parentId,
      name: txnOrArg.name,
      priority: txnOrArg.priority,
      sheetId: txnOrArg.sheetId,
    };
    const instance = this.create({ ...createArg, iVaultDb: txn.iVault });
    instance.id = instance.insert(txn);
    return instance.id;
  }

  /** @alpha */
  protected override collectReferenceIds(referenceIds: EntityReferenceSet): void {
    super.collectReferenceIds(referenceIds);
    if (this.sheet)
      referenceIds.addModel(this.sheet.id);
  }
}
