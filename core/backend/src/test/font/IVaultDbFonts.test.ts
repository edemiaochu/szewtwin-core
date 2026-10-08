/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as fs from "fs";
import * as sinon from "sinon";
import { StandaloneDb } from "../../IVaultDb";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { FontFace, FontType, RscFontEncodingProps } from "@szewtwin/core-common";
import { FontFile } from "../../FontFile";
import type { IVaultJsNative } from "@szewec/ivaultjs-native";
import { _faceProps, _getData } from "../../internal/Symbols";
import { CodeService } from "../../CodeService";
import { QueryMappedFamiliesArgs } from "../../IVaultDbFonts";

describe("IVaultDbFonts", () => {
  let db: StandaloneDb | undefined;

  class MockCodeService {
    public static enable = false;
    public static nextFaceDataId = 10;
    public static nextFontId = 100;

    public static reset() {
      this.enable = false;
      this.nextFaceDataId = 10;
      this.nextFontId = 100;
    }

    public static get internalCodes() {
      if (!MockCodeService.enable) {
        return undefined;
      }

      const obj = {
        reserveFontId: () => MockCodeService.nextFontId++,
        reserveEmbeddedFaceDataId: () => MockCodeService.nextFaceDataId++,
      };

      (obj as any).writeLocker = obj;
      return obj;
    }

    public static close() { }

  }

  beforeEach(async () => {
    CodeService.createForIVault = () => MockCodeService as any;
    db = StandaloneDb.createEmpty(
      IVaultTestUtils.prepareOutputFile("IVaultDbFonts", "IVaultDbFontsTest.dtw"),
      { rootSubject: { name: "IVaultDbFontsTest" }, enableTransactions: true }
    );
    (db as any)._codeService = await CodeService.createForIVault(db);
  });

  afterEach(() => {
    if (db) {
      if (db.txns.hasLocalChanges)
        db.txns.deleteAllTxns();

      db.close();
      db = undefined;
    }

    MockCodeService.reset();
    CodeService.createForIVault = undefined;
  });

  function createTTFile(fontName: string): FontFile {
    return FontFile.createFromTrueTypeFileName(IVaultTestUtils.resolveFontFile(fontName));
  }

  function createTTFace(familyName: string, faceName: "regular" | "bold" | "italic" | "bolditalic", subId = 0): IVaultJsNative.FontFaceProps {
    return { familyName, faceName, type: FontType.TrueType, subId };
  }

  function getDb(): StandaloneDb {
    if (!db)
      throw new Error("Test iVault was not initialized");

    return db;
  }

  function expectEmbeddedFontFiles(expected: Array<IVaultJsNative.FontFaceProps[]>) {
    const iVault = getDb();
    const fonts = Array.from(iVault.fonts.queryEmbeddedFontFiles());
    const actualFaceProps: Array<IVaultJsNative.FontFaceProps[]> = fonts.map((x) => x[_faceProps]);

    expect(actualFaceProps).to.deep.equal(expected);

    const expectedFaces: Array<FontFace[]> = expected.map((list) => {
      return list.map((x) => {
        return {
          familyName: x.familyName,
          isBold: x.faceName.startsWith("bold"),
          isItalic: x.faceName.endsWith("italic"),
        };
      });
    });

    const actualFaces = fonts.map((x) => x.faces);
    expect(actualFaces).to.deep.equal(expectedFaces);
  }

  describe("embedFontFile", () => {
    it("embeds font files", async () => {
      expectEmbeddedFontFiles([]);

      const expectedFiles: Array<IVaultJsNative.FontFaceProps[]> = [];

      async function embedAndTest(file: FontFile, expectedFaces: IVaultJsNative.FontFaceProps[]): Promise<void> {
        const iVault = getDb();
        await iVault.fonts.embedFontFile({ file });
        expectedFiles.push(expectedFaces);
        expectEmbeddedFontFiles(expectedFiles);
      }

      const fileName = IVaultTestUtils.resolveFontFile("Cdm.shx");
      const blob = fs.readFileSync(fileName);
      await embedAndTest(FontFile.createFromShxFontBlob({ blob, familyName: "Cdm" }), [{
        familyName: "Cdm",
        type: FontType.Shx,
        faceName: "regular",
        subId: 0,
      }]);

      await embedAndTest(createTTFile("Karla-Regular.ttf"), [createTTFace("Karla", "regular")]);

      await embedAndTest(createTTFile("Sitka.ttc"), [
        createTTFace("Sitka Banner", "regular", 5),
        createTTFace("Sitka Display", "regular", 4),
        createTTFace("Sitka Heading", "regular", 3),
        createTTFace("Sitka Small", "regular", 0),
        createTTFace("Sitka Subheading", "regular", 2),
        createTTFace("Sitka Text", "regular", 1),
      ]);

      await embedAndTest(createTTFile("DejaVuSans.ttf"), [createTTFace("DejaVu Sans", "regular")]);
      await embedAndTest(createTTFile("DejaVuSans-Bold.ttf"), [createTTFace("DejaVu Sans", "bold")]);

      const rscBlob = fs.readFileSync(IVaultTestUtils.resolveFontFile("ENGINEERING.bin"));
      const encoding: RscFontEncodingProps = {
        degree: 5,
        plusMinus: 100,
      };
      await embedAndTest(FontFile.createFromRscFontBlob({ blob: rscBlob, familyName: "ENGINEERING", encoding }), [{
        familyName: "ENGINEERING",
        type: FontType.Rsc,
        faceName: "regular",
        subId: 0,
        encoding: {
          ...encoding,
          // omitted properties get default values
          diameter: 216,
          codePage: -1,
        }
      }]);
    });

    it("is a no-op if file is already embedded", async () => {
      const iVault = getDb();
      expectEmbeddedFontFiles([]);
      await iVault.fonts.embedFontFile({ file: createTTFile("Sitka.ttc") });
      expectEmbeddedFontFiles([[
        createTTFace("Sitka Banner", "regular", 5),
        createTTFace("Sitka Display", "regular", 4),
        createTTFace("Sitka Heading", "regular", 3),
        createTTFace("Sitka Small", "regular", 0),
        createTTFace("Sitka Subheading", "regular", 2),
        createTTFace("Sitka Text", "regular", 1),
      ]]);

      await iVault.fonts.embedFontFile({ file: createTTFile("Sitka.ttc") });
      expectEmbeddedFontFiles([[
        createTTFace("Sitka Banner", "regular", 5),
        createTTFace("Sitka Display", "regular", 4),
        createTTFace("Sitka Heading", "regular", 3),
        createTTFace("Sitka Small", "regular", 0),
        createTTFace("Sitka Subheading", "regular", 2),
        createTTFace("Sitka Text", "regular", 1),
      ]]);
    });

    it("throws if font is not embeddable", async () => {
      const iVault = getDb();
      await expect(iVault.fonts.embedFontFile({ file: createTTFile("Karla-Restricted.ttf") })).to.eventually.be.rejectedWith("Font does not permit embedding");
      await expect(iVault.fonts.embedFontFile({ file: createTTFile("Karla-Preview-And-Print.ttf") })).to.eventually.be.rejectedWith("Font does not permit embedding");
    });

    it("allocates font Ids unless otherwise specified", async () => {
      const iVault = getDb();
      await iVault.fonts.embedFontFile({ file: createTTFile("DejaVuSans.ttf") });
      expect(iVault.fonts.findId({ name: "DejaVu Sans", type: FontType.TrueType })).not.to.be.undefined;

      await iVault.fonts.embedFontFile({ file: createTTFile("Sitka.ttc"), skipFontIdAllocation: false });
      const sitkaFamilies = ["Banner", "Display", "Heading", "Small", "Subheading", "Text"].map((x) => `Sitka ${x}`);
      for (const name of sitkaFamilies) {
        expect(iVault.fonts.findId({ name, type: FontType.TrueType })).not.to.be.undefined;
      }

      await iVault.fonts.embedFontFile({ file: createTTFile("Karla-Regular.ttf"), skipFontIdAllocation: true });
      expect(iVault.fonts.findId({ name: "Karla", type: FontType.TrueType })).to.be.undefined;
    });

    it("requires schema lock if CodeService is not configured", async () => {
      const iVault = getDb();
      const spy = sinon.spy(iVault, "acquireSchemaLock");
      await iVault.fonts.embedFontFile({ file: createTTFile("Karla-Regular.ttf"), skipFontIdAllocation: true });
      expect(spy.callCount).to.equal(1);
      await iVault.fonts.embedFontFile({ file: createTTFile("Sitka.ttc"), skipFontIdAllocation: false });
      expect(spy.callCount).to.equal(2);
    });

    it("obtains face data Ids from CodeService if configured", async () => {
      const iVault = getDb();
      MockCodeService.enable = true;
      const spy = sinon.spy(iVault, "acquireSchemaLock");

      await iVault.fonts.embedFontFile({ file: createTTFile("Karla-Regular.ttf"), skipFontIdAllocation: true });

      await iVault.fonts.embedFontFile({ file: createTTFile("Sitka.ttc"), skipFontIdAllocation: false });

      expect(spy.callCount).to.equal(0);
      expect(MockCodeService.nextFaceDataId).to.equal(12);
    });

    it("round-trips font data", async () => {
      const iVault = getDb();
      const inputData = fs.readFileSync(IVaultTestUtils.resolveFontFile("Cdm.shx"));
      await iVault.fonts.embedFontFile({ file: FontFile.createFromShxFontBlob({ blob: inputData, familyName: "Cdm" }) });

      const embeddedFiles = Array.from(iVault.fonts.queryEmbeddedFontFiles());
      expect(embeddedFiles.length).to.equal(1);
      const embeddedFile = embeddedFiles[0];

      const embeddedData = embeddedFile[_getData]();
      expect(Array.from(embeddedData)).to.deep.equal(Array.from(inputData));
    });
  });

  describe("acquireId", () => {
    it("assigns font Ids", async () => {
      const iVault = getDb();
      expect(iVault.fonts.findDescriptor(1)).to.be.undefined;

      const cdmShx = { name: "Cdm", type: FontType.Shx };
      expect(iVault.fonts.findId(cdmShx)).to.be.undefined;

      const cdmShxId = await iVault.fonts.acquireId(cdmShx);
      expect(cdmShxId).to.equal(1);

      const cdmShxId2 = await iVault.fonts.acquireId(cdmShx);
      expect(cdmShxId2).to.equal(cdmShxId);

      expect(iVault.fonts.findDescriptor(cdmShxId)).to.deep.equal(cdmShx);
      expect(iVault.fonts.findId(cdmShx)).to.equal(cdmShxId);

      const cdmRsc = { name: "Cdm", type: FontType.Rsc };
      expect(iVault.fonts.findId(cdmRsc)).to.be.undefined;

      const cdmRscId = await iVault.fonts.acquireId(cdmRsc);
      expect(cdmRscId).to.equal(2);

      expect(iVault.fonts.findId(cdmRsc)).to.equal(cdmRscId);
      expect(iVault.fonts.findDescriptor(cdmRscId)).to.deep.equal(cdmRsc);

      const arial = { name: "Arial", type: FontType.TrueType };
      const arialId = await iVault.fonts.acquireId(arial);
      expect(arialId).to.equal(3);
      expect(iVault.fonts.findId(arial)).to.equal(arialId);
      expect(iVault.fonts.findDescriptor(arialId)).to.deep.equal(arial);
    });

    it("requires schema lock if CodeService is not configured", async () => {
      const iVault = getDb();
      const spy = sinon.spy(iVault, "acquireSchemaLock");
      const cdmShx = { name: "Cdm", type: FontType.Shx };
      await iVault.fonts.acquireId(cdmShx);
      expect(spy.callCount).to.equal(1);

      await iVault.fonts.acquireId(cdmShx);
      expect(spy.callCount).to.equal(1);

      await iVault.fonts.acquireId({ name: "Arial", type: FontType.TrueType });
      expect(spy.callCount).to.equal(2);
    });

    it("acquires font Ids from CodeService if configured", async () => {
      const iVault = getDb();
      MockCodeService.enable = true;
      const spy = sinon.spy(iVault, "acquireSchemaLock");

      const cdmShx = { name: "Cdm", type: FontType.Shx };
      const cdmShxId = await iVault.fonts.acquireId(cdmShx);
      expect(cdmShxId).to.equal(100);

      const cdmShxId2 = await iVault.fonts.acquireId(cdmShx);
      expect(cdmShxId2).to.equal(cdmShxId);

      const arialId = await iVault.fonts.acquireId({ name: "Arial", type: FontType.TrueType });
      expect(arialId).to.equal(101);

      expect(spy.callCount).to.equal(0);
    });
  });

  describe("findId", () => {
    it("finds exact match by name and type, or first match by type if only name is supplied", async () => {
      const iVault = getDb();
      const shx = await iVault.fonts.acquireId({ name: "Font", type: FontType.Shx });
      expect(iVault.fonts.findId({ name: "Font", type: FontType.Shx })).to.equal(shx);
      expect(iVault.fonts.findId({ name: "Font", type: FontType.Rsc })).to.be.undefined;
      expect(iVault.fonts.findId({ name: "Font", type: FontType.TrueType })).to.be.undefined;
      expect(iVault.fonts.findId({ name: "Font" })).to.equal(shx);

      const tt = await iVault.fonts.acquireId({ name: "Font", type: FontType.TrueType });
      expect(iVault.fonts.findId({ name: "Font", type: FontType.TrueType })).to.equal(tt);
      expect(iVault.fonts.findId({ name: "Font", type: FontType.Rsc })).to.be.undefined;
      expect(iVault.fonts.findId({ name: "Font", type: FontType.Shx })).to.equal(shx);
      expect(iVault.fonts.findId({ name: "Font" })).to.equal(tt);

      const rsc = await iVault.fonts.acquireId({ name: "Font", type: FontType.Rsc });
      expect(iVault.fonts.findId({ name: "Font", type: FontType.Rsc })).to.equal(rsc);
      expect(iVault.fonts.findId({ name: "Font", type: FontType.TrueType })).to.equal(tt);
      expect(iVault.fonts.findId({ name: "Font", type: FontType.Shx })).to.equal(shx);
      expect(iVault.fonts.findId({ name: "Font" })).to.equal(tt);
    });
  });

  describe("queryMappedFamilies", () => {
    it("omits entries with no embedded face data by default", async () => {
      const iVault = getDb();
      await iVault.fonts.embedFontFile({ file: createTTFile("Karla-Regular.ttf") });
      await iVault.fonts.embedFontFile({ file: createTTFile("DejaVuSans.ttf"), skipFontIdAllocation: true });
      await iVault.fonts.acquireId({ name: "Arial", type: FontType.TrueType });

      function expectFamilies(expected: string[], args?: QueryMappedFamiliesArgs): void {
        const actual = Array.from(iVault.fonts.queryMappedFamilies(args)).map((x) => x.name).sort();
        expect(actual).to.deep.equal(expected.sort());
      }

      expectFamilies(["Karla"]);
      expectFamilies(["Karla"], { includeNonEmbedded: false })
      expectFamilies(["Arial", "Karla"], { includeNonEmbedded: true });
    });
  });
});
