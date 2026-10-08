/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iVaults
 */

import { FontFamilyDescriptor, FontFamilySelector, FontId, FontProps, FontType } from "@szewtwin/core-common";
import { _faceProps, _getData, _implementationProhibited, _key, _nativeDb } from "./Symbols";
import { IVaultDb } from "../IVaultDb";
import { EmbedFontFileArgs, IVaultDbFonts, QueryMappedFamiliesArgs } from "../IVaultDbFonts";
import { EmbeddedFontFile } from "./FontFileImpl";
import { assert, DbResult, Logger } from "@szewtwin/core-szewec";
import type { IVaultJsNative } from "@szewec/ivaultjs-native";
import { FontFile } from "../FontFile";
import { BackendLoggerCategory } from "../BackendLoggerCategory";

class IVaultDbFontsImpl implements IVaultDbFonts {
  public readonly [_implementationProhibited] = undefined;
  readonly #db: IVaultDb;

  public constructor(iVault: IVaultDb) {
    this.#db = iVault;
  }

  public queryMappedFamilies(args?: QueryMappedFamiliesArgs): Iterable<FontProps> {
    const fontProps = this.#queryFontTable();
    if (args?.includeNonEmbedded) {
      return fontProps;
    }

    const fontNames = this.#getEmbeddedFontNames();
    return fontProps.filter((x) => fontNames.includes(x.name));
  }

  public queryEmbeddedFontFiles(): Iterable<FontFile> {
    const files: FontFile[] = [];
    this.#db.withSqliteStatement(`SELECT Id,StrData FROM be_Prop WHERE Namespace="bld_Font" AND Name="EmbeddedFaceData"`, (stmt) => {
      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        let faces;
        try {
          faces = JSON.parse(stmt.getValueString(1)) as IVaultJsNative.FontFaceProps[];
        } catch (e) {
          Logger.logError(BackendLoggerCategory.IVaultDb, e);
        }

        if (!Array.isArray(faces) || faces.length === 0) {
          continue;
        }

        let type = faces[0].type;
        if (type !== FontType.Rsc && type !== FontType.Shx) {
          type = FontType.TrueType;
        }

        files.push(new EmbeddedFontFile(this.#db, stmt.getValueInteger(0), type, faces));
      }
    });

    return files;
  }

  public async embedFontFile(args: EmbedFontFileArgs): Promise<void> {
    this.#requireWritable();

    if (!args.file.isEmbeddable) {
      throw new Error("Font does not permit embedding");
    }

    const file = args.file;
    for (const existing of this.queryEmbeddedFontFiles()) {
      if (existing[_key] === file[_key]) {
        // Already embedded - it's a no-op.
        return;
      }
    }

    let id = 0;
    const codes = this.#db.codeService?.internalCodes;
    if (codes) {
      id = await codes.writeLocker.reserveEmbeddedFaceDataId(args.file[_key]);
    } else {
      // CodeService not configured - schema lock required to prevent conflicting Ids in be_Prop table.
      await this.#db.acquireSchemaLock();
      const sql = `SELECT MAX(Id) FROM be_Prop WHERE Namespace="bld_Font" AND Name="EmbeddedFaceData"`;
      id = this.#db.withSqliteStatement(sql, (stmt) => stmt.nextRow() ? stmt.getValueInteger(0) + 1 : 1);
    }

    assert(id > 0);
    const data = file[_getData]();
    this.#db[_nativeDb].embedFontFile(id, file[_faceProps], data, true);

    if (!args.skipFontIdAllocation) {
      const familyNames = new Set<string>(args.file.faces.map((x) => x.familyName));
      const acquireIds = Array.from(familyNames).map(async (x) => this.#acquireId({ name: x, type: args.file.type }, true).catch());
      await Promise.allSettled(acquireIds);
    }

    this.#db.clearFontMap();
  }

  public findId(selector: FontFamilySelector): FontId | undefined {
    let id;
    const sqlPostlude = undefined === selector.type ? " ORDER BY Type ASC" : " AND Type=?";
    const sql = `SELECT Id FROM bld_Font WHERE Name=?${sqlPostlude}`;
    this.#db.withPreparedSqliteStatement(sql, (stmt) => {
      stmt.bindString(1, selector.name);
      if (undefined !== selector.type) {
        stmt.bindInteger(2, selector.type);
      }

      if (DbResult.BE_SQLITE_ROW === stmt.step()) {
        id = stmt.getValueInteger(0);
      }
    });

    return id;
  }

  public findDescriptor(id: FontId): FontFamilyDescriptor | undefined {
    let name, type;
    this.#db.withPreparedSqliteStatement("SELECT Name,Type FROM bld_Font WHERE Id=?", (stmt) => {
      stmt.bindInteger(1, id);
      if (DbResult.BE_SQLITE_ROW === stmt.step()) {
        const stmtName = stmt.getValueString(0);
        if (stmtName.length > 0) {
          name = stmtName;
          const typeCode = stmt.getValueInteger(1);
          type = (typeCode === FontType.Shx || typeCode === FontType.Rsc) ? typeCode : FontType.TrueType;
        }
      }
    });

    return undefined !== name && undefined !== type ? { name, type } : undefined;
  }

  public async acquireId(descriptor: FontFamilyDescriptor): Promise<FontId> {
    this.#requireWritable();
    return this.#acquireId(descriptor, false);
  }

  async #acquireId(descriptor: FontFamilyDescriptor, embeddingFaceData: boolean): Promise<FontId> {
    let id = this.findId(descriptor);
    if (undefined !== id) {
      return id;
    }

    const codes = this.#db.codeService?.internalCodes;
    if (codes) {
      id = await codes.writeLocker.reserveFontId({ fontName: descriptor.name, fontType: descriptor.type });
    } else {
      // If we're being called from `embedFontFile` then the schema lock is already held, don't bother re-acquiring it.
      if (!embeddingFaceData) {
        // No CodeService configured. We must obtain the schema lock and use the next available Id.
        await this.#db.acquireSchemaLock();
      }

      id = this.#db.withSqliteStatement(`SELECT MAX(Id) FROM bld_Font`, (stmt) => stmt.nextRow() ? stmt.getValueInteger(0) + 1 : 1);
    }

    this.#db.withSqliteStatement(`INSERT INTO bld_Font (Id,Type,Name) VALUES (?,?,?)`, (stmt) => {
      stmt.bindInteger(1, id);
      stmt.bindInteger(2, descriptor.type);
      stmt.bindString(3, descriptor.name);

      if (DbResult.BE_SQLITE_DONE !== stmt.step()) {
        throw new Error("Failed to insert font Id mapping");
      }
    });

    this.#db.clearFontMap();

    return id;
  }

  #requireWritable(): void {
    if (this.#db.isReadonly) {
      throw new Error("iVault is read-only");
    }
  }

  #getEmbeddedFontNames(): string[] {
    const names: string[] = [];

    const sql = `select DISTINCT json_extract(face.value, '$.familyName') from be_Prop, json_each(be_Prop.StrData) as face where namespace="bld_Font" and name="EmbeddedFaceData"`;
    this.#db.withPreparedSqliteStatement(sql, (stmt) => {
      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        names.push(stmt.getValueString(0));
      }
    });

    return names;
  }

  #queryFontTable(): Array<FontProps> {
    const fonts: FontProps[] = [];
    const sql = `SELECT Id,Name,Type FROM bld_Font`;
    this.#db.withPreparedSqliteStatement(sql, (stmt) => {
      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        const name = stmt.getValueString(1);
        const typeCode = stmt.getValueInteger(2);
        const type = (typeCode === FontType.Shx || typeCode === FontType.Rsc) ? typeCode : FontType.TrueType;
        if (name.length > 0) {
          fonts.push({
            name,
            type,
            id: stmt.getValueInteger(0),
          });
        }
      }
    });

    return fonts;
  }
}

export function createIVaultDbFonts(db: IVaultDb): IVaultDbFonts {
  return new IVaultDbFontsImpl(db);
}
