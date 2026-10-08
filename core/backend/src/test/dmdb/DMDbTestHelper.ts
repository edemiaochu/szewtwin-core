/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { Guid } from "@szewtwin/core-szewec";
import { DMDb } from "../../DMDb";
import { IVaultJsFs } from "../../IVaultJsFs";

export class DMDbTestHelper {

  public static createDMDb(outDir: string, fileName: string, schemaXml?: string): DMDb {
    if (!IVaultJsFs.existsSync(outDir))
      IVaultJsFs.mkdirSync(outDir);

    const outPath = path.join(outDir, fileName);
    if (IVaultJsFs.existsSync(outPath))
      IVaultJsFs.unlinkSync(outPath);

    const dmdb = new DMDb();
    dmdb.createDb(outPath);

    if (!schemaXml)
      return dmdb;

    const schemaPath = path.join(outDir, `${Guid.createValue()}.dmschema.xml`);
    if (IVaultJsFs.existsSync(schemaPath))
      IVaultJsFs.unlinkSync(schemaPath);

    IVaultJsFs.writeFileSync(schemaPath, schemaXml);

    dmdb.importSchema(schemaPath);
    return dmdb;
  }
}
