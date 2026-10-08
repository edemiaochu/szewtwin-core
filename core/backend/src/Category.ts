/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */

import { Id64, Id64String, JsonUtils } from "@szewtwin/core-szewec";
import {
  BisCodeSpec, CategoryProps, Code, CodeScopeProps, CodeSpec, ElementProps, Rank, SubCategoryAppearance, SubCategoryProps,
} from "@szewtwin/core-common";
import { DefinitionElement } from "./Element";
import { EditTxn } from "./EditTxn";
import { IVaultDb } from "./IVaultDb";
import { CategoryOwnsSubCategories } from "./NavigationRelationship";
import { CustomHandledProperty, DeserializeEntityArgs, DMSqlRow } from "./Entity";
import { _implicitTxn } from "./internal/Symbols";

/** Defines the appearance for graphics in Geometric elements
 * @public @preview
 */
export class SubCategory extends DefinitionElement {
  public static override get className(): string { return "SubCategory"; }
  /** The Appearance parameters for this SubCategory */
  public appearance: SubCategoryAppearance;
  /** Optional description of this SubCategory. */
  public description?: string;

  protected constructor(props: SubCategoryProps, iVault: IVaultDb) {
    super(props, iVault);
    this.appearance = new SubCategoryAppearance(props.appearance);
    this.description = JsonUtils.asString(props.description);
  }

  /**
   * SubCategory custom HandledProps include 'description' and 'properties'.
   * @inheritdoc
   * @beta
   */
  protected static override readonly _customHandledProps: CustomHandledProperty[] = [
    { propertyName: "description", source: "Class" },
    { propertyName: "properties", source: "Class" },
  ];

  /**
   * SubCategory deserializes 'description' and 'properties'.
   * @inheritdoc
   * @beta
   */
  public static override deserialize(props: DeserializeEntityArgs): SubCategoryProps {
    const elProps = super.deserialize(props) as SubCategoryProps;
    elProps.description = JsonUtils.asString(props.row.description);
    if (props.row.properties !== '') {
      elProps.appearance = JSON.parse(props.row.properties) as SubCategoryAppearance.Props;
    } else {
      elProps.appearance = undefined;
    }
    return elProps;
  }

  /**
   * SubCategory serialize 'description' and 'properties'.
   * @inheritdoc
   * @beta
   */
  public static override serialize(props: SubCategoryProps, iVault: IVaultDb): DMSqlRow {
    const inst = super.serialize(props, iVault);
    if (props.description !== undefined) {
      inst.description = props.description;
    }
    if (props.appearance !== undefined) {
      inst.properties = JSON.stringify(props.appearance);
    }
    return inst;
  }

  public override toJSON(): SubCategoryProps {
    const val = super.toJSON() as SubCategoryProps;
    val.appearance = this.appearance.toJSON();
    if (this.description && this.description.length > 0)
      val.description = this.description;
    return val;
  }

  /** Get the SubCategory's name (its Code value). */
  public getSubCategoryName(): string { return this.code.value; }
  /** Get the Id of the SubCategory. */
  public getSubCategoryId(): Id64String { return this.id; }
  /** Get the Id of this SubCategory's parent Category. */
  public getCategoryId(): Id64String { return this.parent ? this.parent.id : Id64.invalid; }
  /** Check if this is the default SubCategory of its parent Category. */
  public get isDefaultSubCategory(): boolean { return IVaultDb.getDefaultSubCategoryId(this.getCategoryId()) === this.getSubCategoryId(); }

  /** Create a Code for a SubCategory given a name that is meant to be unique within the scope of the specified parent Category.
   * @param iVault  The IVault
   * @param parentCategoryId The Id of the parent Category that owns the SubCategory and provides the scope for its name.
   * @param codeValue The name of the SubCategory
   */
  public static createCode(iVault: IVaultDb, parentCategoryId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iVault.codeSpecs.getByName(BisCodeSpec.subCategory);
    return new Code({ spec: codeSpec.id, scope: parentCategoryId, value: codeValue });
  }

  /** Create a new SubCategory
   * @param iVaultDb The iVault
   * @param parentCategoryId Create the new SubCategory as a child of this [[Category]]
   * @param name The name of the SubCategory
   * @param appearance The appearance settings to use for this SubCategory
   * @returns The newly constructed SubCategory element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static create(iVaultDb: IVaultDb, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props | SubCategoryAppearance): SubCategory {
    if (appearance instanceof SubCategoryAppearance)
      appearance = appearance.toJSON();

    const parentCategory = iVaultDb.elements.getElement<Category>(parentCategoryId);
    const subCategoryProps: SubCategoryProps = {
      classFullName: this.classFullName,
      model: parentCategory.model,
      parent: new CategoryOwnsSubCategories(parentCategoryId),
      code: this.createCode(iVaultDb, parentCategoryId, name),
      appearance,
    };
    return new SubCategory(subCategoryProps, iVaultDb);
  }

  /**
   * Insert a new SubCategory
   * @param txn The EditTxn to use
   * @param parentCategoryId Insert the new SubCategory as a child of this Category
   * @param name The name of the SubCategory
   * @param appearance The appearance settings to use for this SubCategory
   * @returns The Id of the newly inserted SubCategory element.
   * @throws [[IVaultError]] if unable to insert the element.
   * @beta
   */
  public static insert(txn: EditTxn, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String;
  /**
   * Insert a new SubCategory
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use SubCategory.insert(txn, ...) instead.
   */
  public static insert(iVaultDb: IVaultDb, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String;
  public static insert(txnOrDb: EditTxn | IVaultDb, parentCategoryId: Id64String, name: string, appearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String {
    const txn = txnOrDb instanceof EditTxn ? txnOrDb : txnOrDb[_implicitTxn];
    const subCategory = this.create(txn.iVault, parentCategoryId, name, appearance);
    return subCategory.insert(txn);
  }
}

/** A Category element is the target of the `category` member of [[GeometricElement]].
 * @public @preview
 */
export class Category extends DefinitionElement {
  public static override get className(): string { return "Category"; }
  public rank: Rank = Rank.User;
  public description?: string;

  protected constructor(props: CategoryProps, iVault: IVaultDb) {
    super(props, iVault);
    this.rank = JsonUtils.asInt(props.rank);
    this.description = JsonUtils.asString(props.description);
  }

  /**
   * Category custom HandledProps include 'rank' and 'description'.
   * @inheritdoc
   * @beta
   */
  protected static override readonly _customHandledProps: CustomHandledProperty[] = [
    { propertyName: "rank", source: "Class" },
    { propertyName: "description", source: "Class" },
  ];

  /**
   * Category deserializes 'rank' and 'description'.
   * @inheritdoc
   * @beta
   */
  public static override deserialize(props: DeserializeEntityArgs): CategoryProps {
    const elProps = super.deserialize(props) as CategoryProps;
    elProps.description = JsonUtils.asString(props.row.description);
    elProps.rank = JsonUtils.asInt(props.row.rank);
    return elProps;
  }

  /**
   * Category serialize 'rank' and 'description'.
   * @inheritdoc
   * @beta
   */
  public static override serialize(props: CategoryProps, iVault: IVaultDb): DMSqlRow {
    const inst = super.serialize(props, iVault);
    if (undefined !== props.description) {
      inst.description = props.description;
    }
    inst.rank = props.rank;
    return inst;
  }
  public override toJSON(): CategoryProps {
    const val = super.toJSON() as CategoryProps;
    val.rank = this.rank;
    if (this.description && this.description.length > 0)
      val.description = this.description;
    return val;
  }

  /** Get the Id of the default SubCategory for this Category. */
  public myDefaultSubCategoryId(): Id64String { return IVaultDb.getDefaultSubCategoryId(this.id); }

  /**
   * Set the appearance of the default SubCategory for this Category
   * @beta
   */
  public setDefaultAppearance(txn: EditTxn, props: SubCategoryAppearance.Props | SubCategoryAppearance): void;
  /**
   * Set the appearance of the default SubCategory for this Category
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use Category.setDefaultAppearance(txn, ...) instead.
   */
  public setDefaultAppearance(props: SubCategoryAppearance.Props | SubCategoryAppearance): void;
  public setDefaultAppearance(txnOrProps: EditTxn | SubCategoryAppearance.Props | SubCategoryAppearance, props?: SubCategoryAppearance.Props | SubCategoryAppearance): void {
    let txn: EditTxn;
    let appearance: SubCategoryAppearance.Props | SubCategoryAppearance;
    if (txnOrProps instanceof EditTxn) {
      txn = txnOrProps;
      if (props === undefined)
        throw new Error("Invalid argument");
      appearance = props;
    } else {
      txn = this.iVault[_implicitTxn];
      appearance = txnOrProps;
    }
    if (appearance instanceof SubCategoryAppearance)
      appearance = appearance.toJSON();

    const subCat = this.iVault.elements.getElement<SubCategory>(this.myDefaultSubCategoryId());
    subCat.appearance = new SubCategoryAppearance(appearance);
    subCat.update(txn);
  }
}

/** Categorizes 2d GeometricElements.
 * @public @preview
 */
export class DrawingCategory extends Category {
  public static override get className(): string { return "DrawingCategory"; }

  protected constructor(opts: ElementProps, iVault: IVaultDb) { super(opts, iVault); }

  /** Get the name of the CodeSpec that is used by DrawingCategory objects. */
  public static getCodeSpecName(): string { return BisCodeSpec.drawingCategory; }

  /** Looks up the CategoryId of a DrawingCategory by model and name */
  public static queryCategoryIdByName(iVault: IVaultDb, scopeModelId: Id64String, categoryName: string): Id64String | undefined {
    const code: Code = DrawingCategory.createCode(iVault, scopeModelId, categoryName);
    return iVault.elements.queryElementIdByCode(code);
  }

  /** Create a Code for a DrawingCategory given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iVault  The IVault
   * @param scopeModelId The Id of the DefinitionModel that contains the DrawingCategory and provides the scope for its name.
   * @param codeValue The name of the category
   * @return A drawing category Code
   */
  public static createCode(iVault: IVaultDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iVault.codeSpecs.getByName(DrawingCategory.getCodeSpecName());
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /** Create a new DrawingCategory
   * @param iVaultDb The iVault
   * @param definitionModelId The [[DefinitionModel]]
   * @param name The name of the DrawingCategory
   * @returns The newly constructed DrawingCategory element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static create(iVaultDb: IVaultDb, definitionModelId: Id64String, name: string): DrawingCategory {
    const categoryProps: CategoryProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iVaultDb, definitionModelId, name),
      isPrivate: false,
    };
    return new DrawingCategory(categoryProps, iVaultDb);
  }

  /**
   * Insert a new DrawingCategory
   * @param txn The EditTxn to use
   * @param definitionModelId Insert the new DrawingCategory into this [[DefinitionModel]]
   * @param name The name of the DrawingCategory
   * @param defaultAppearance The appearance settings to use for the default SubCategory of this DrawingCategory
   * @returns The Id of the newly inserted DrawingCategory element.
   * @throws [[IVaultError]] if unable to insert the element.
   * @beta
   */
  public static insert(txn: EditTxn, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String;
  /**
   * Insert a new DrawingCategory
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use DrawingCategory.insert(txn, ...) instead.
   */
  public static insert(iVaultDb: IVaultDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String;
  public static insert(txnOrDb: EditTxn | IVaultDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String {
    const txn = txnOrDb instanceof EditTxn ? txnOrDb : txnOrDb[_implicitTxn];
    const category = this.create(txn.iVault, definitionModelId, name);
    category.id = category.insert(txn);
    category.setDefaultAppearance(txn, defaultAppearance);
    return category.id;
  }
}

/** Categorizes SpatialElements. See [how to create a SpatialCategory]($docs/learning/backend/CreateElements.md#SpatialCategory).
 * @public @preview
 */
export class SpatialCategory extends Category {
  public static override get className(): string { return "SpatialCategory"; }
  protected constructor(opts: ElementProps, iVault: IVaultDb) { super(opts, iVault); }

  /** Get the name of the CodeSpec that is used by SpatialCategory objects. */
  public static getCodeSpecName(): string { return BisCodeSpec.spatialCategory; }

  /** Looks up the CategoryId of a SpatialCategory by model and name */
  public static queryCategoryIdByName(iVault: IVaultDb, scopeModelId: Id64String, categoryName: string): Id64String | undefined {
    const code: Code = SpatialCategory.createCode(iVault, scopeModelId, categoryName);
    return iVault.elements.queryElementIdByCode(code);
  }

  /** Create a Code for a SpatialCategory given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iVault  The IVault
   * @param scopeModelId The Id of the DefinitionModel that contains the SpatialCategory and provides the scope for its name.
   * @param codeValue The name of the category
   * @return A spatial category Code
   */
  public static createCode(iVault: IVaultDb, scopeModelId: CodeScopeProps, codeValue: string): Code {
    const codeSpec: CodeSpec = iVault.codeSpecs.getByName(SpatialCategory.getCodeSpecName());
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  /** Create a new SpatialCategory
   * @param iVaultDb The iVault
   * @param definitionModelId The [[DefinitionModel]]
   * @param name The name/CodeValue of the SpatialCategory
   * @returns The newly constructed SpatialCategory element.
   * @throws [[IVaultError]] if unable to create the element.
   */
  public static create(iVaultDb: IVaultDb, definitionModelId: Id64String, name: string): SpatialCategory {
    const categoryProps: CategoryProps = {
      classFullName: this.classFullName,
      model: definitionModelId,
      code: this.createCode(iVaultDb, definitionModelId, name),
      isPrivate: false,
    };
    return new SpatialCategory(categoryProps, iVaultDb);
  }

  /**
   * Insert a new SpatialCategory
   * @param txn The EditTxn to use
   * @param definitionModelId Insert the new SpatialCategory into this DefinitionModel
   * @param name The name of the SpatialCategory
   * @param defaultAppearance The appearance settings to use for the default SubCategory of this SpatialCategory
   * @returns The Id of the newly inserted SpatialCategory element.
   * @throws [[IVaultError]] if unable to insert the element.
   * @beta
   */
  public static insert(txn: EditTxn, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String;
  /**
   * Insert a new SpatialCategory
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use SpatialCategory.insert(txn, ...) instead.
   */
  public static insert(iVaultDb: IVaultDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String;
  public static insert(txnOrDb: EditTxn | IVaultDb, definitionModelId: Id64String, name: string, defaultAppearance: SubCategoryAppearance.Props | SubCategoryAppearance): Id64String {
    const txn = txnOrDb instanceof EditTxn ? txnOrDb : txnOrDb[_implicitTxn];
    const category = this.create(txn.iVault, definitionModelId, name);
    category.id = category.insert(txn);
    category.setDefaultAppearance(txn, defaultAppearance);
    return category.id;
  }
}
