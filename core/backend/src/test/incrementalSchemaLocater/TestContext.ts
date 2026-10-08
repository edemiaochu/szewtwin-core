import { Schema, SchemaContext, SchemaGraphUtil, SchemaJsonLocater, SchemaKey, SchemaMatchType } from "@szewtwin/dmschema-metadata";
import { IVaultIncrementalSchemaLocater } from "../../IVaultIncrementalSchemaLocater";
import { BriefcaseDb, IVaultDb, StandaloneDb } from "../../IVaultDb";
import { IVaultHost } from "../../IVaultHost";
import { KnownTestLocations } from "../KnownTestLocations";
import { OpenMode } from "@szewtwin/core-szewec";
import { IVaultJsFs } from "../../IVaultJsFs";
import { ProfileOptions } from "@szewtwin/core-common";
import { SchemaXmlFileLocater } from "@szewtwin/dmschema-locaters";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as path from "path";
import { TestUtils } from "../TestUtils";

interface Options {
  readonly bimFile?: string;
  readonly incrementalSchemaLoading?: "enabled" | "disabled" | undefined;
}

type SchemaLocaterType<TOptions> = TOptions extends { incrementalSchemaLoading: "disabled" } ? never : IVaultIncrementalSchemaLocater;

export class TestContext<TLocater = never> implements AsyncDisposable {
  private readonly _iVault: IVaultDb;
  private readonly _schemaLocater: TLocater;
  private readonly _assetContext: SchemaContext;

  private constructor(iVault: IVaultDb) {
    this._iVault = iVault;
    this._schemaLocater = this._iVault.schemaContext.locaters.find((locater) => {
      return locater instanceof IVaultIncrementalSchemaLocater;
    }) as TLocater;

    // Ideally we should not need a seperate context here to locate and locate the bisschemas from the
    // parent ivault context, but due to a bug in the incremental schema logic, we have to do this for now.
    // TODO: remove this when issue #1763 is fixed.
    this._assetContext = new SchemaContext();
    this._assetContext.addLocater(new SchemaJsonLocater((schemaName) => {
      return iVault.getSchemaProps(schemaName);
    }))
    const xmlAssetSchemaLocater = new SchemaXmlFileLocater();
    xmlAssetSchemaLocater.addSchemaSearchPath(path.join(KnownTestLocations.assetsDir, "IncrementalSchemaLocater"));
    this._assetContext.addLocater(xmlAssetSchemaLocater);

    iVault.schemaContext.addLocater(this._assetContext);
  }

  public get iVault(): IVaultDb {
    return this._iVault;
  }

  public get schemaLocater(): TLocater {
    return this._schemaLocater;
  }

  public get schemaContext(): SchemaContext {
    return this._iVault.schemaContext;
  }

  public static async create<TOptions extends Options>(options?: TOptions): Promise<TestContext<SchemaLocaterType<TOptions>>> {
    if (!IVaultHost.isValid) {
      await TestUtils.startBackend();
    }

    const iVault = options?.bimFile ?
      await this.loadIVaultFile(options.bimFile) :
      await this.createIVault();

    const configuration = IVaultHost.configuration;
    if (configuration) {
      const previousSetting = configuration.incrementalSchemaLoading;
      configuration.incrementalSchemaLoading = options ? options.incrementalSchemaLoading : "enabled";
      iVault.onBeforeClose.addOnce(() => {
        configuration.incrementalSchemaLoading = previousSetting;
      });
    }

    return new TestContext(iVault);
  }

  private static async loadIVaultFile(bimFile: string): Promise<IVaultDb> {
    const pathToBriefCase = path.join(KnownTestLocations.assetsDir, bimFile);
    return BriefcaseDb.open({
      fileName: pathToBriefCase,
      readonly: true,
      key: "test-iVault",
    });
  }

  private static async createIVault(): Promise<IVaultDb> {
    const testBimPath = path.join(KnownTestLocations.assetsDir, "IncrementalSchemaLocater", "test-bim.dtw");

    if (IVaultJsFs.existsSync(testBimPath)) {
      ~
        IVaultJsFs.removeSync(testBimPath);
    }

    const localBim = StandaloneDb.createEmpty(testBimPath, {
      enableTransactions: true,
      rootSubject: {
        name: "IncrementalSchemaTestingDb"
      },
    });

    localBim.close();

    const nativeDb = IVaultDb.openBldDb({ path: testBimPath }, OpenMode.ReadWrite, { profile: ProfileOptions.Upgrade });
    nativeDb.saveChanges();
    nativeDb.closeFile();

    return StandaloneDb.openFile(testBimPath, OpenMode.ReadWrite);
  }

  public async getSchemaNames(): Promise<string[]> {
    const result = new Array<string>();
    const sqlQuery = "SELECT Name, VersionMajor, VersionWrite, VersionMinor FROM meta.DMSchemaDef ORDER BY Name";
    const reader = this._iVault.createQueryReader(sqlQuery);
    while (await reader.step()) {
      const name = reader.current[0];
      const versionMajor = reader.current[1];
      const versionWrite = reader.current[2];
      const versionMinor = reader.current[3];

      result.push(`${name}.${versionMajor}.${versionWrite}.${versionMinor}`);
    }
    return result;
  }

  public async importAssetSchema(schemaKey: SchemaKey): Promise<Schema> {
    // If schema is already in the iVault, return it.
    if (undefined !== this.iVault.querySchemaVersion(schemaKey.name))
      return await this.schemaContext.getSchema(schemaKey) as Schema;

    // Locate the schema from the assets using the schema contexts asset locaters.
    const testSchema = await this._assetContext.getSchema(schemaKey, SchemaMatchType.Exact);
    if (undefined === testSchema)
      throw new Error(`The schema '${schemaKey.name}' could not be found in the assets folder.`);

    const schemaXml = await getOrderedSchemaStrings(testSchema);
    await this._iVault.importSchemaStrings(schemaXml);

    if (this.iVault.isBriefcaseDb() && !this.iVault.isReadonly) {
      await this.iVault.pushChanges({ description: "import test schema" });
    }

    const schema = await this.schemaContext.getSchema(schemaKey);
    if (undefined === schema)
      throw new Error(`The schema '${schemaKey.name}' could not be found after import.`);

    if (schema.loadingController && !schema.loadingController.isComplete) {
      await schema.loadingController.wait();
    }

    return schema;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    return this._iVault.close();
  }
}

async function getOrderedSchemaStrings(insertSchema: Schema): Promise<string[]> {
  const schemas = SchemaGraphUtil.buildDependencyOrderedSchemaList(insertSchema);
  const schemaStrings = await Promise.all(schemas.map(async (schema) => getSchemaString(schema)));
  return schemaStrings;
}

async function getSchemaString(schema: Schema): Promise<string> {
  // Serialize schema to the document object
  const xmlDocument = new DOMParser().parseFromString(`<?xml version="1.0" encoding="UTF-8"?>`, "application/xml");
  await schema.toXml(xmlDocument);

  const serializer = new XMLSerializer();
  const xml = serializer.serializeToString(xmlDocument);

  return xml;
}

