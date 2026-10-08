/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Elements
 */

import { Id64String } from "@szewtwin/core-szewec";
import {
  Base64EncodedString, BisCodeSpec, Code, CodeScopeProps, CodeSpec, ImageSourceFormat, TextureProps,
} from "@szewtwin/core-common";
import { DefinitionElement } from "./Element";
import { EditTxn } from "./EditTxn";
import { IVaultDb } from "./IVaultDb";
import { _implicitTxn } from "./internal/Symbols";

/** A [TextureProps]($common) in which the image data can be specified either as a base-64-encoded string or a Uint8Array.
 * @see [[Texture]] constructor.
 * @beta
 */
export interface TextureCreateProps extends Omit<TextureProps, "data"> {
  data: Base64EncodedString | Uint8Array;
}

/** Defines a rendering texture that is associated with a Material and applied to surface geometry.
 * @public @preview
 */
export class Texture extends DefinitionElement {
  /** @internal */
  public static override get className(): string { return "Texture"; }
  public format: ImageSourceFormat;
  public data: Uint8Array;
  public description?: string;

  /** @beta */
  protected constructor(props: TextureCreateProps, iVault: IVaultDb) {
    super(props, iVault);
    this.format = props.format;
    this.data = typeof props.data === "string" ? Base64EncodedString.toUint8Array(props.data) : props.data;
    this.description = props.description;
  }

  public override toJSON(): TextureProps {
    const val = super.toJSON() as TextureProps;
    val.format = this.format;
    val.data = Base64EncodedString.fromUint8Array(this.data);
    val.description = this.description;
    return val;
  }

  /** Create a Code for a Texture given a name that is meant to be unique within the scope of the specified DefinitionModel.
   * @param iVault  The IVaultDb
   * @param scopeModelId The Id of the DefinitionModel that contains the Texture and provides the scope for its name.
   * @param name The Texture name
   */
  public static createCode(iVault: IVaultDb, scopeModelId: CodeScopeProps, name: string): Code {
    const codeSpec: CodeSpec = iVault.codeSpecs.getByName(BisCodeSpec.texture);
    return 0 === name.length ? Code.createEmpty() : new Code({ spec: codeSpec.id, scope: scopeModelId, value: name });
  }

  /** Create a texture with the given parameters.
   * @param iVaultDb The iVault to contain the texture.
   * @param definitionModelId The [[DefinitionModel]] to contain the texture.
   * @param name The name to serve as the texture's [Code]($common) value.
   * @param format The format of the image data.
   * @param data The image data in the format specified by `format`.
   * @param description An optional description of the texture
   * @returns The newly constructed Texture element.
   * @throws [[IVaultError]] if unable to create the element.
   * @see [[insertTexture]] to insert a new texture into the iVault.
   */
  public static createTexture(iVaultDb: IVaultDb, definitionModelId: Id64String, name: string, format: ImageSourceFormat, data: Uint8Array | Base64EncodedString, description?: string): Texture {
    const textureProps: TextureCreateProps = {
      classFullName: this.classFullName,
      code: this.createCode(iVaultDb, definitionModelId, name),
      format,
      data,
      description,
      model: definitionModelId,
      isPrivate: false,
    };

    return new Texture(textureProps, iVaultDb);
  }

  /** Insert a new texture into a [[DefinitionModel]].
   * @param iVaultDb The iVault to contain the texture.
   * @param definitionModelId The [[DefinitionModel]] to contain the texture.
   * @param name The name to serve as the texture's [Code]($common) value.
   * @param format The format of the image data.
   * @param data The image data in the format specified by `format`.
   * @param description An optional description of the texture
   * @returns The Id of the newly-inserted texture element.
   * @throws [[IVaultError]] if unable to insert the element.
   * @see [[insertTexture]] to insert a new texture into the iVault.
   * @beta
   */
  public static insertTexture(txn: EditTxn, definitionModelId: Id64String, name: string, format: ImageSourceFormat, data: Uint8Array | Base64EncodedString, description?: string): Id64String;
  /** Insert a new texture into a [[DefinitionModel]].
   * @deprecated in 5.1.9 - will not be removed until after 2026-08-04. Use Texture.insertTexture(txn, ...) instead.
   */
  public static insertTexture(iVaultDb: IVaultDb, definitionModelId: Id64String, name: string, format: ImageSourceFormat, data: Uint8Array | Base64EncodedString, description?: string): Id64String;
  public static insertTexture(txnOrDb: EditTxn | IVaultDb, definitionModelId: Id64String, name: string, format: ImageSourceFormat, data: Uint8Array | Base64EncodedString, description?: string): Id64String {
    const txn = txnOrDb instanceof EditTxn ? txnOrDb : txnOrDb[_implicitTxn];
    const texture = this.createTexture(txn.iVault, definitionModelId, name, format, data, description);
    return texture.insert(txn);
  }
}
