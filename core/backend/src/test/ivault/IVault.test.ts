/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import * as path from "path";
import * as semver from "semver";
import * as sinon from "sinon";
import { DbResult, Guid, GuidString, Id64, Id64String, IVaultStatus, Logger, OpenMode, ProcessDetector } from "@szewtwin/core-szewec";
import { EditTxn, withEditTxn } from "../../EditTxn";
import {
  AxisAlignedBox3d, BisCodeSpec, BriefcaseIdValue, ChangesetIdWithIndex, Code, CodeScopeSpec, CodeSpec, ColorByName, ColorDef, DefinitionElementProps,
  DisplayStyleProps, DisplayStyleSettings, DisplayStyleSettingsProps, EcefLocation, ElementProps, EntityProps, FilePropertyProps,
  FontMap, FontType, GeoCoordinatesRequestProps, GeoCoordStatus, GeographicCRS, GeographicCRSProps, GeometricElementProps, GeometryParams, GeometryStreamBuilder,
  ImageSourceFormat, IVault, IVaultCoordinatesRequestProps, IVaultError, LightLocationProps, MapImageryProps, PhysicalElementProps,
  PointWithStatus, QueryBinder, RelatedElement, RelationshipProps, RenderMode, SchemaState, SpatialViewDefinitionProps, SubCategoryAppearance, SubjectProps, TextureMapping,
  TextureMapProps, TextureMapUnits, TypeDefinitionElementProps, ViewDefinitionProps, ViewFlagProps, ViewFlags,
} from "@szewtwin/core-common";
import {
  Geometry, GeometryQuery, LineString3d, Loop, Matrix4d, Point3d, PolyfaceBuilder, Range3d, StrokeOptions, Transform, XYZProps, YawPitchRollAngles,
} from "@szewtwin/core-geometry";
import { V2CheckpointAccessProps } from "../../BackendHubAccess";
import { V2CheckpointManager } from "../../CheckpointManager";
import {
  _nativeDb, BisCoreSchema, Category, ClassRegistry, DefinitionContainer, DefinitionGroup, DefinitionGroupGroupsDefinitions,
  DefinitionModel, DefinitionPartition, DictionaryModel, DisplayStyle3d, DisplayStyleCreationOptions, DocumentPartition, DrawingGraphic, DMSqlStatement,
  Element, ElementDrivesElement, ElementGroupsMembers, ElementGroupsMembersProps, ElementOwnsChildElements, Entity, GenericGraphicalType2d, GeometricElement2d, GeometricElement3d,
  GeometricModel, GroupInformationPartition, IVaultDb, IVaultHost, IVaultJsFs, InformationPartitionElement, InformationRecordElement, LightLocation,
  LinkPartition, Model, PhysicalElement, PhysicalModel, PhysicalObject, PhysicalPartition, RenderMaterialElement, RenderMaterialElementParams, SnapshotDb, SpatialCategory,
  SqliteStatement, SqliteValue, SqliteValueType, StandaloneDb, SubCategory, Subject, Texture, ViewDefinition,
} from "../../core-backend";
import { BriefcaseDb, SnapshotDbOpenArgs } from "../../IVaultDb";
import { HubMock } from "../../internal/HubMock";
import { KnownTestLocations } from "../KnownTestLocations";
import { IVaultTestUtils } from "../IVaultTestUtils";
import { DisableNativeAssertions } from "../TestUtils";
import { samplePngTexture } from "../imageData";
import { performance } from "perf_hooks";
import { _cache, _hubAccess, _instanceKeyCache } from "../../internal/Symbols";
import { CustomAttributeClass, DMVersion, EntityClass, PrimitiveArrayProperty, PrimitiveOrEnumPropertyBase, PropertyType, propertyTypeToString, SchemaItemType } from "@szewtwin/dmschema-metadata";

// spell-checker: disable

async function getIVaultError<T>(promise: Promise<T>): Promise<IVaultError | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err instanceof IVaultError ? err : undefined;
  }
}

function expectIVaultError(expectedErrorNumber: IVaultStatus | DbResult, error: IVaultError | undefined): void {
  expect(error).not.to.be.undefined;
  expect(error).instanceof(IVaultError);
  expect(error!.errorNumber).to.equal(expectedErrorNumber);
}

async function generateTestSnapshot(targetFileName: string, seedAssetName: string): Promise<SnapshotDb> {
  const seedFile = IVaultTestUtils.resolveAssetFile(seedAssetName);
  const snapshotFile = IVaultTestUtils.prepareOutputFile("IVault", targetFileName);
  const ivault = IVaultTestUtils.createSnapshotFromSeed(snapshotFile, seedFile);
  const schemaPathname = path.join(KnownTestLocations.assetsDir, "TestBim.dmschema.xml");
  await ivault.importSchemas([schemaPathname]);
  return ivault;
}

describe("iVault", () => {
  //TODO: These ivaults are used and modified across multiple tests. This is not a good practice and should be refactored.
  let ivault1: SnapshotDb;
  let ivault2: SnapshotDb;
  let ivault3: SnapshotDb;
  let ivault4: SnapshotDb;
  let ivault5: SnapshotDb;
  let originalEnv: any;

  before(async () => {
    originalEnv = { ...process.env };

    IVaultTestUtils.registerTestBimSchema();
    ivault1 = await generateTestSnapshot("test.dtw", "test.dtw");
    ivault2 = IVaultTestUtils.createSnapshotFromSeed(IVaultTestUtils.prepareOutputFile("IVault", "CompatibilityTestSeed.dtw"), IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw"));
    ivault3 = SnapshotDb.openFile(IVaultTestUtils.resolveAssetFile("GetSetAutoHandledStructProperties.dtw"));
    ivault4 = IVaultTestUtils.createSnapshotFromSeed(IVaultTestUtils.prepareOutputFile("IVault", "GetSetAutoHandledArrayProperties.dtw"), IVaultTestUtils.resolveAssetFile("GetSetAutoHandledArrayProperties.dtw"));
    ivault5 = IVaultTestUtils.createSnapshotFromSeed(IVaultTestUtils.prepareOutputFile("IVault", "mirukuru.ibim"), IVaultTestUtils.resolveAssetFile("mirukuru.ibim"));
  });

  after(() => {
    process.env = originalEnv;
    ivault1.close();
    ivault2.close();
    ivault3.close();
    ivault4.close();
    ivault5.close();
  });

  afterEach(() => {
    sinon.restore();
  });

  /** Roundtrip the entity through a json string and back to a new entity. */
  const roundtripThroughJson = (entity1: Entity): Entity => {
    const string1 = JSON.stringify(entity1);
    const props1 = JSON.parse(string1) as EntityProps;
    const entity2 = new (entity1.constructor as any)(props1, entity1.iVault); // create a new entity from the EntityProps
    const string2 = JSON.stringify(entity2);
    assert.equal(string1, string2);
    return entity2;
  };

  it("should be able to get properties of an iIVault", () => {
    expect(ivault1.name).equals("TBD"); // That's the name of the root subject!
    const extents: AxisAlignedBox3d = ivault1.projectExtents;
    assert(!extents.isNull);

    // make sure we can construct a new element even if we haven't loaded its metadata (will be loaded in ctor)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.isUndefined(ivault1.classMetaDataRegistry.find("biscore:lightlocation"));
    const e1 = ivault1.constructEntity<LightLocation, LightLocationProps>({ category: "0x11", classFullName: "BisCore:LightLocation", model: "0x01", code: Code.createEmpty() });
    assert.isDefined(e1);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.isDefined(ivault1.classMetaDataRegistry.find("biscore:lightlocation")); // should have been loaded in ctor
  });

  it("should use schema to look up classes by name", () => {
    const elementClass = ClassRegistry.findRegisteredClass(Element.classFullName);
    const categoryClass = ClassRegistry.findRegisteredClass(Category.classFullName);
    assert.isDefined(elementClass);
    assert.isDefined(categoryClass);
    assert.equal(elementClass!.schema, BisCoreSchema);
    assert.equal(categoryClass!.schema, BisCoreSchema);
    assert.equal(elementClass!.className, "Element");
    assert.equal(categoryClass!.className, "Category");
  });

  it("Fonts", () => {
    const dbFonts = ivault1.fonts;
    expect(Array.from(dbFonts.queryMappedFamilies({ includeNonEmbedded: true })).length).to.equal(4);
    expect(dbFonts.findDescriptor(1)).to.deep.equal({ name: "Arial", type: FontType.TrueType });
    expect(dbFonts.findId({ name: "Arial" })).to.equal(1);
    expect(dbFonts.findId({ name: "arial" })).to.equal(1);

    expect(dbFonts.findDescriptor(2)).to.deep.equal({ name: "Font0", type: FontType.Rsc });
    expect(dbFonts.findId({ name: "Font0" })).to.equal(2);
    expect(dbFonts.findId({ name: "fOnt0" })).to.equal(2);

    expect(dbFonts.findDescriptor(3)).to.deep.equal({ name: "ShxFont0", type: FontType.Shx });
    expect(dbFonts.findId({ name: "ShxFont0" })).to.equal(3);
    expect(dbFonts.findId({ name: "shxfont0" })).to.equal(3);

    expect(dbFonts.findDescriptor(4)).to.deep.equal({ name: "Calibri", type: FontType.TrueType });
    expect(dbFonts.findId({ name: "Calibri" })).to.equal(4);
    expect(dbFonts.findId({ name: "cAlIbRi" })).to.equal(4);

    expect(dbFonts.findId({ name: "notfound" })).to.be.undefined;

    const fonts1 = ivault1.fontMap; // eslint-disable-line @typescript-eslint/no-deprecated
    assert.equal(fonts1.fonts.size, 4, "font map size should be 4");
    assert.equal(FontType.TrueType, fonts1.getFont(1)!.type, "get font 1 type is TrueType");
    assert.equal("Arial", fonts1.getFont(1)!.name, "get Font 1 name");
    assert.equal(1, fonts1.getFont("Arial")!.id, "get Font 1, by name");
    assert.equal(1, fonts1.getFont("arial")!.id, "get Font 1, by name case insensitive");

    assert.equal(FontType.Rsc, fonts1.getFont(2)!.type, "get font 2 type is Rsc");
    assert.equal("Font0", fonts1.getFont(2)!.name, "get Font 2 name");
    assert.equal(2, fonts1.getFont("Font0")!.id, "get Font 2, by name");
    assert.equal(2, fonts1.getFont("fOnt0")!.id, "get Font 2, by name case insensitive");

    assert.equal(FontType.Shx, fonts1.getFont(3)!.type, "get font 1 type is Shx");
    assert.equal("ShxFont0", fonts1.getFont(3)!.name, "get Font 3 name");
    assert.equal(3, fonts1.getFont("ShxFont0")!.id, "get Font 3, by name");
    assert.equal(3, fonts1.getFont("shxfont0")!.id, "get Font 3, by name case insensitive");

    assert.equal(FontType.TrueType, fonts1.getFont(4)!.type, "get font 4 type is TrueType");
    assert.equal("Calibri", fonts1.getFont(4)!.name, "get Font 4 name");
    assert.equal(4, fonts1.getFont("Calibri")!.id, "get Font 4, by name");
    assert.equal(4, fonts1.getFont("cAlIbRi")!.id, "get Font 4, by name case insensitive");

    assert.isUndefined(fonts1.getFont("notfound"), "attempt lookup of a font that should not be found");

    assert.deepEqual(new FontMap(fonts1.toJSON()), fonts1, "toJSON on FontMap"); // eslint-disable-line @typescript-eslint/no-deprecated
  });

  it("should load a known element by Id from an existing iVault", () => {
    assert.exists(ivault1.elements);
    const code1 = new Code({ spec: "0x10", scope: "0x11", value: "RF1.bld" });
    const el = ivault1.elements.getElement(code1);
    assert.exists(el);
    const el2ById = ivault1.elements.getElement("0x34");
    assert.exists(el2ById);
    const badCode = new Code({ spec: "0x10", scope: "0x11", value: "RF1_does_not_exist.bld" });

    try {
      ivault1.elements.getElement(badCode); // throws Error
      assert.fail(); // this line should be skipped
    } catch (error: any) {
      assert.instanceOf(error, Error);
      assert.instanceOf(error, IVaultError);
      assert.equal(error.errorNumber, IVaultStatus.NotFound);
    }

    const element1 = ivault1.elements.tryGetElement(code1);
    const element2 = ivault1.elements.tryGetElement("0x34");
    const element3 = ivault1.elements.tryGetElement(badCode);
    assert.isDefined(element1);
    assert.isDefined(element2);
    assert.isUndefined(element3);
    const elementProps1 = ivault1.elements.tryGetElementProps(code1);
    const elementProps2 = ivault1.elements.tryGetElementProps("0x34");
    const elementProps3 = ivault1.elements.tryGetElementProps(badCode);
    assert.isDefined(elementProps1);
    assert.isDefined(elementProps2);
    assert.isUndefined(elementProps3);

    const model1 = ivault1.models.tryGetModel(IVault.dictionaryId);
    const modelProps1 = ivault1.models.tryGetModelProps(IVault.dictionaryId);
    const subModel1 = ivault1.models.tryGetSubModel(IVault.dictionaryId);
    assert.isDefined(model1);
    assert.isDefined(modelProps1);
    assert.isDefined(subModel1);
    const badModel1 = ivault1.models.tryGetModel(Id64.fromUint32Pair(999, 999));
    const badModelProps1 = ivault1.models.tryGetModelProps(Id64.fromUint32Pair(999, 999));
    const badSubModel1 = ivault1.models.tryGetSubModel(IVault.rootSubjectId);
    const badSubModel2 = ivault1.models.tryGetSubModel(badCode);
    assert.isUndefined(badModel1);
    assert.isUndefined(badModelProps1);
    assert.isUndefined(badSubModel1);
    assert.isUndefined(badSubModel2);

    const subCat = ivault1.elements.getElement("0x2e");
    assert.isTrue(subCat instanceof SubCategory);
    if (subCat instanceof SubCategory) {
      assert.isTrue(subCat.appearance.color.tbgr === 16777215);
      assert.isTrue(subCat.appearance.weight === 2);
      assert.equal(Id64.getLocalId(subCat.id), 46);
      assert.equal(Id64.getBriefcaseId(subCat.id), 0);
      assert.equal(Id64.getLocalId(subCat.code.spec), 30);
      assert.equal(Id64.getBriefcaseId(subCat.code.spec), 0);
      assert.isTrue(subCat.code.scope === "0x2d");
      assert.isTrue(subCat.code.value === "A-Z013-G-Legn");
      roundtripThroughJson(subCat);
    }

    /// Get the parent Category of the subcategory.
    const cat = ivault1.elements.getElement((subCat as SubCategory).getCategoryId());
    assert.isTrue(cat instanceof Category);
    if (cat instanceof Category) {
      assert.equal(Id64.getLocalId(cat.id), 45);
      assert.equal(Id64.getBriefcaseId(cat.id), 0);
      assert.isTrue(cat.description === "Legends, symbols keys");
      assert.equal(Id64.getLocalId(cat.code.spec), 22);
      assert.equal(Id64.getBriefcaseId(cat.code.spec), 0);
      assert.isTrue(cat.code.value === "A-Z013-G-Legn");
      roundtripThroughJson(cat);
    }

    const phys = ivault1.elements.getElement("0x38");
    assert.isTrue(phys instanceof GeometricElement3d);

    const locateMsg = phys.getToolTipMessage();
    assert.isDefined(locateMsg);

    const a2 = ivault2.elements.getElement("0x1d");
    assert.exists(a2);
    expect(a2.federationGuid).equal("18eb4650-b074-414f-b961-d9cfaa6c8746");
    const el3 = ivault2.elements.getElement(a2.federationGuid!);
    assert.exists(el3);
    assert.notEqual(a2, el3);
    assert.equal(a2.id, el3.id);
    roundtripThroughJson(el3);
    const txn = new EditTxn(ivault2, "code scope mutation test");
    txn.start();

    const newEl = el3.toJSON();
    newEl.federationGuid = undefined;
    newEl.code = { scope: "bad scope", spec: "0x10", value: "new code" };
    expect(() => txn.insertElement(newEl)).throws("invalid code scope").to.have.property("metadata");
    newEl.code.scope = "0x34322"; // valid id, but element doesn't exist
    expect(() => txn.insertElement(newEl)).throws("invalid code scope").to.have.property("metadata");

    newEl.code.scope = el3.federationGuid!;
    const newId = txn.insertElement(newEl); // code scope from FederationGuid should get converted to ElementId
    const a4 = ivault2.elements.getElementProps(newId);
    expect(a4.code.scope).equal(el3.id);

    a4.code.scope = "0x13343";
    expect(() => txn.updateElement(a4)).throws("invalid code scope").to.have.property("metadata");

    a4.code.scope = "0x1";
    txn.updateElement(a4); // should change the code scope to new element
    let a5 = ivault2.elements.getElementProps(newId);
    expect(a5.code.scope).equal("0x1");

    // only pass minimum, but expect model and classFullName to be added.
    const newProps = { id: a4.id, code: a4.code, classFullName: undefined, model: undefined };
    newProps.code.scope = el3.federationGuid!; // should convert FederationGuid to ElementId
    txn.updateElement(newProps);
    expect(newProps.classFullName).eq(a4.classFullName);
    expect(newProps.model).eq(a4.model);

    a5 = ivault2.elements.getElementProps(newId);
    expect(a5.code.scope).equal(el3.id);
    txn.end();
  });

  it("should optionally detect class mismatches", () => {
    // tryGetElement
    const subjectUnvalidated = ivault1.elements.tryGetElement<Subject>(IVault.rootSubjectId);
    assert.isDefined(subjectUnvalidated);
    const subjectValidated = ivault1.elements.tryGetElement<Subject>(IVault.rootSubjectId, Subject);
    assert.isDefined(subjectValidated);
    const physicalElementUnvalidated = ivault1.elements.tryGetElement<PhysicalElement>(IVault.rootSubjectId);
    assert.isDefined(physicalElementUnvalidated); // wrong type, but class to validate was not passed
    const physicalElementValidated = ivault1.elements.tryGetElement<PhysicalElement>(IVault.rootSubjectId, PhysicalElement); // abstract class
    assert.isUndefined(physicalElementValidated); // wrong type
    const physicalObjectUnvalidated = ivault1.elements.tryGetElement<PhysicalObject>(IVault.rootSubjectId);
    assert.isDefined(physicalObjectUnvalidated); // wrong type, but class to validate was not passed
    const physicalObjectValidated = ivault1.elements.tryGetElement<PhysicalObject>(IVault.rootSubjectId, PhysicalObject); // concrete class
    assert.isUndefined(physicalObjectValidated); // wrong type
    // tryGetModel
    const dictionaryUnvalidated = ivault1.models.tryGetModel<DictionaryModel>(IVault.dictionaryId);
    assert.isDefined(dictionaryUnvalidated);
    const dictionaryValidated = ivault1.models.tryGetModel<DictionaryModel>(IVault.dictionaryId, DictionaryModel);
    assert.isDefined(dictionaryValidated);
    const geometricModelUnvalidated = ivault1.models.tryGetModel<GeometricModel>(IVault.dictionaryId);
    assert.isDefined(geometricModelUnvalidated); // wrong type, but class to validate was not passed
    const geometricModelValidated = ivault1.models.tryGetModel<GeometricModel>(IVault.dictionaryId, GeometricModel); // abstract class
    assert.isUndefined(geometricModelValidated); // wrong type
    const physicalModelUnvalidated = ivault1.models.tryGetModel<PhysicalModel>(IVault.dictionaryId);
    assert.isDefined(physicalModelUnvalidated); // wrong type, but class to validate was not passed
    const physicalModelValidated = ivault1.models.tryGetModel<PhysicalModel>(IVault.dictionaryId, PhysicalModel); // concrete class
    assert.isUndefined(physicalModelValidated); // wrong type
    // tryGetSubModel
    const dictionarySubUnvalidated = ivault1.models.tryGetSubModel<DictionaryModel>(IVault.dictionaryId);
    assert.isDefined(dictionarySubUnvalidated);
    const dictionarySubValidated = ivault1.models.tryGetSubModel<DictionaryModel>(IVault.dictionaryId, DictionaryModel);
    assert.isDefined(dictionarySubValidated);
    const geometricSubModelUnvalidated = ivault1.models.tryGetSubModel<GeometricModel>(IVault.dictionaryId);
    assert.isDefined(geometricSubModelUnvalidated); // wrong type, but class to validate was not passed
    const geometricSubModelValidated = ivault1.models.tryGetSubModel<GeometricModel>(IVault.dictionaryId, GeometricModel); // abstract class
    assert.isUndefined(geometricSubModelValidated); // wrong type
    const physicalSubModelUnvalidated = ivault1.models.tryGetSubModel<PhysicalModel>(IVault.dictionaryId);
    assert.isDefined(physicalSubModelUnvalidated); // wrong type, but class to validate was not passed
    const physicalSubModelValidated = ivault1.models.tryGetSubModel<PhysicalModel>(IVault.dictionaryId, PhysicalModel); // concrete class
    assert.isUndefined(physicalSubModelValidated); // wrong type
  });

  it("should create elements", () => {
    const seedElement = ivault2.elements.getElement<GeometricElement3d>("0x1d");
    assert.exists(seedElement);
    assert.isTrue(seedElement.federationGuid! === "18eb4650-b074-414f-b961-d9cfaa6c8746");

    withEditTxn(ivault2, (txn) => {
      for (let i = 0; i < 25; i++) {
        const elementProps: GeometricElementProps = {
          classFullName: "Generic:PhysicalObject",
          model: seedElement.model,
          category: seedElement.category,
          code: Code.createEmpty(),
          federationGuid: Guid.createValue(),
          userLabel: `UserLabel-${i}`,
        };

        const element: Element = ivault2.elements.createElement(elementProps);
        element.setUserProperties("performanceTest", { s: `String-${i}`, n: i });

        const elementId = txn.insertElement(element.toJSON());
        assert.isTrue(Id64.isValidId64(elementId));
      }
    });
  });

  it("should insert a RenderMaterial", () => {
    const model = ivault2.models.getModel<DictionaryModel>(IVault.dictionaryId);
    expect(model).not.to.be.undefined;

    const testMaterialName = "test material name";
    const testPaletteName = "test palette name";
    const testDescription = "test description";
    const color = [0.3, 0.7, 0.8];
    const specularColor = [0.1, 1, 0];
    const finish = 0.4;
    const transmit = 0.1;
    const diffuse = 0.24;
    const specular = 0.9;
    const reflect = 0.3;
    const reflectColor = [1, 0, 0.5];
    /* eslint-disable @typescript-eslint/naming-convention */
    const textureMapProps: TextureMapProps = {
      pattern_angle: 3.0,
      pattern_u_flip: false,
      pattern_flip: false,
      pattern_scale: [1.0, 1.0],
      pattern_offset: [0.0, 0.0],
      pattern_scalemode: TextureMapUnits.Inches,
      pattern_mapping: TextureMapping.Mode.Planar,
      pattern_weight: 0.5,
      TextureId: "test_textureid",
    };

    /* eslint-enable @typescript-eslint/naming-convention */
    const renderMaterialParams: RenderMaterialElementParams = {
      paletteName: testPaletteName,
      description: testDescription,
      color,
      specularColor,
      finish,
      transmit,
      diffuse,
      specular,
      reflect,
      reflectColor,
      patternMap: textureMapProps,
    };

    const renderMaterialId = withEditTxn(ivault2, (txn) => RenderMaterialElement.insert(txn, IVault.dictionaryId, testMaterialName, renderMaterialParams));

    const renderMaterial = ivault2.elements.getElement<RenderMaterialElement>(renderMaterialId);
    assert((renderMaterial instanceof RenderMaterialElement) === true, "did not retrieve an instance of RenderMaterial");
    expect(renderMaterial.paletteName).to.equal(testPaletteName);
    expect(renderMaterial.description).to.equal(testDescription);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasBaseColor).to.equal(true);
    expect(JSON.stringify(renderMaterial.jsonProperties.materialAssets.renderMaterial.color)).to.equal(JSON.stringify(color));
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasSpecularColor).to.equal(true);
    expect(JSON.stringify(renderMaterial.jsonProperties.materialAssets.renderMaterial.specular_color)).to.equal(JSON.stringify(specularColor));
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasFinish).to.equal(true);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.finish).to.equal(finish);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasTransmit).to.equal(true);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.transmit).to.equal(transmit);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasDiffuse).to.equal(true);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.diffuse).to.equal(diffuse);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasSpecular).to.equal(true);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.specular).to.equal(specular);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasReflect).to.equal(true);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.reflect).to.equal(reflect);
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.HasReflectColor).to.equal(true);
    expect(JSON.stringify(renderMaterial.jsonProperties.materialAssets.renderMaterial.reflect_color)).to.equal(JSON.stringify(reflectColor));
    expect(renderMaterial.jsonProperties.materialAssets.renderMaterial.Map).not.to.be.undefined;

    const patternMap = renderMaterial.jsonProperties.materialAssets.renderMaterial.Map.Pattern;
    expect(patternMap).not.to.be.undefined;
    expect(patternMap.pattern_angle).to.equal(textureMapProps.pattern_angle);
    expect(patternMap.pattern_u_flip).to.equal(textureMapProps.pattern_u_flip);
    expect(patternMap.pattern_flip).to.equal(textureMapProps.pattern_flip);
    expect(JSON.stringify(patternMap.pattern_scale)).to.equal(JSON.stringify(textureMapProps.pattern_scale));
    expect(JSON.stringify(patternMap.pattern_offset)).to.equal(JSON.stringify(textureMapProps.pattern_offset));
    expect(patternMap.pattern_scalemode).to.equal(textureMapProps.pattern_scalemode);
    expect(patternMap.pattern_mapping).to.equal(textureMapProps.pattern_mapping);
    expect(patternMap.pattern_weight).to.equal(textureMapProps.pattern_weight);
    expect(patternMap.TextureId).to.equal(textureMapProps.TextureId);
  });

  it("attempt to apply material to new element in ivault5", () => {
    const testTextureName = "fake texture name";
    const testTextureFormat = ImageSourceFormat.Png;
    const testTextureDescription = "empty description";
    const txn = new EditTxn(ivault5, "apply material to new element");
    txn.start();

    const texId = Texture.insertTexture(txn, IVault.dictionaryId, testTextureName, testTextureFormat, samplePngTexture.base64, testTextureDescription);

    /* eslint-disable @typescript-eslint/naming-convention */
    const matId = RenderMaterialElement.insert(txn, IVault.dictionaryId, "test material name",
      {
        paletteName: "TestPaletteName",
        patternMap: {
          TextureId: texId,
          pattern_offset: [0, 0],
          pattern_scale: [1, 1],
          pattern_scalemode: TextureMapUnits.Relative,
        },
      });
    /* eslint-enable @typescript-eslint/naming-convention */

    /** Create a simple flat mesh with 4 points (2x2) */
    const width = ivault5.projectExtents.xLength() * 0.2;
    const height = ivault5.projectExtents.yLength() * 0.2;
    let shape: GeometryQuery;
    const doPolyface = true;
    if (doPolyface) {
      const options = StrokeOptions.createForFacets();
      options.shouldTriangulate = false;
      const builder = PolyfaceBuilder.create(options);

      const quad = [
        Point3d.create(0.0, 0.0, 0.0),
        Point3d.create(width, 0.0, 0.0),
        Point3d.create(width, height, 0.0),
        Point3d.create(0.0, height, 0.0),
      ];

      builder.addQuadFacet(quad);
      shape = builder.claimPolyface();
    } else {
      shape = Loop.create(LineString3d.create([
        Point3d.create(0, 0, 0),
        Point3d.create(width, 0, 0),
        Point3d.create(width, height, 0),
        Point3d.create(0, height, 0),
        Point3d.create(0, 0, 0),
      ]));
    }

    const modelId = PhysicalModel.insert(txn, IVaultDb.rootSubjectId, "test_render_material_model_name");

    const categoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "GeoJSON Feature", { color: ColorDef.white.toJSON() });

    /** generate a geometry stream containing the polyface */
    const gsBuilder = new GeometryStreamBuilder();
    const params = new GeometryParams(categoryId);
    params.materialId = matId;
    gsBuilder.appendGeometryParamsChange(params);
    gsBuilder.appendGeometry(shape);
    const geometry = gsBuilder.geometryStream;
    // geometry[0].material = { materialId: matId };

    const props: PhysicalElementProps = {
      classFullName: "Generic:PhysicalObject",
      placement: { origin: ivault5.projectExtents.center, angles: new YawPitchRollAngles() },
      model: modelId,
      code: Code.createEmpty(),
      category: categoryId,
      geom: geometry,
    };
    txn.insertElement(props);
    txn.end();
  });

  it("should insert a DisplayStyle", () => {
    const model = ivault2.models.getModel<DictionaryModel>(IVault.dictionaryId);
    expect(model).not.to.be.undefined;

    const settings: DisplayStyleSettingsProps = {
      backgroundColor: ColorDef.blue.toJSON(),
      viewflags: ViewFlags.fromJSON({
        renderMode: RenderMode.SolidFill,
      }),
    };

    const props: DisplayStyleProps = {
      classFullName: DisplayStyle3d.classFullName,
      model: IVault.dictionaryId,
      code: { spec: BisCodeSpec.displayStyle, scope: IVault.dictionaryId, value: "test style" },
      isPrivate: false,
      jsonProperties: {
        styles: settings,
      },
    };

    const txn = new EditTxn(ivault2, "insert and update DisplayStyle");
    txn.start();
    const styleId = txn.insertElement(props);
    let style = ivault2.elements.getElement<DisplayStyle3d>(styleId);
    expect(style instanceof DisplayStyle3d).to.be.true;
    expect(style.code.spec).equal(ivault2.codeSpecs.getByName(BisCodeSpec.displayStyle).id);

    expect(style.settings.viewFlags.renderMode).to.equal(RenderMode.SolidFill);
    expect(style.settings.backgroundColor.equals(ColorDef.blue)).to.be.true;

    const newFlags = style.settings.viewFlags.copy({ renderMode: RenderMode.SmoothShade });
    style.settings.viewFlags = newFlags;
    style.settings.backgroundColor = ColorDef.red;
    style.settings.monochromeColor = ColorDef.green;
    expect(style.jsonProperties.styles.viewflags.renderMode).to.equal(RenderMode.SmoothShade);

    txn.updateElement(style.toJSON());
    txn.end();
    style = ivault2.elements.getElement<DisplayStyle3d>(styleId);
    expect(style instanceof DisplayStyle3d).to.be.true;

    expect(style.settings.viewFlags.renderMode).to.equal(RenderMode.SmoothShade);
    expect(style.settings.backgroundColor.equals(ColorDef.red)).to.be.true;
    expect(style.settings.monochromeColor.equals(ColorDef.green)).to.be.true;
  });

  it("should create display styles", () => {
    const defaultViewFlags = new ViewFlags().toJSON();
    const defaultMapImagery = new DisplayStyleSettings({}).toJSON().mapImagery;

    const viewFlags = new ViewFlags({ patterns: false, visibleEdges: true });
    const viewflags: ViewFlagProps = { noWhiteOnWhiteReversal: true, shadows: true, noTransp: true };

    const mapImagery: MapImageryProps = {
      backgroundBase: ColorDef.red.tbgr,
      backgroundLayers: [{
        name: "x",
        url: "y",
        transparency: 0.5,
        formatId: "WMS",
        visible: true,
      }],
    };

    const props: DisplayStyleSettingsProps = {
      mapImagery,
      excludedElements: ["0x123", "0xfed"],
      timePoint: 42,
      backgroundColor: ColorDef.green.tbgr,
    };

    type TestCase = [DisplayStyleCreationOptions | undefined, ViewFlagProps, boolean];
    const testCases: TestCase[] = [
      [undefined, defaultViewFlags, false],
      [{ viewFlags }, viewFlags.toJSON(), false],
      [{ viewflags }, viewflags, false],
      [{ viewflags, viewFlags }, viewFlags.toJSON(), false],
      [props, defaultViewFlags, false],
      [{ ...props, viewflags }, viewflags, false],
      [{ backgroundColor: ColorDef.blue }, defaultViewFlags, false],
      [{ backgroundColor: ColorDef.from(1, 2, 3, 4) }, defaultViewFlags, false],
      [{ backgroundColor: ColorDef.blue.tbgr }, defaultViewFlags, false],
      [{ backgroundColor: ColorDef.from(1, 2, 3, 4).tbgr }, defaultViewFlags, false],
    ];

    let suffix = 123;
    withEditTxn(ivault2, (txn) => {
      for (const test of testCases) {
        const expected = test[0] ?? {};
        const styleId = DisplayStyle3d.insert(txn, IVault.dictionaryId, `TestStyle${suffix++}`, expected);
        const style = ivault2.elements.getElement<DisplayStyle3d>(styleId).toJSON();
        expect(style.jsonProperties.styles).not.to.be.undefined;

        expect(style.jsonProperties).not.to.be.undefined;
        expect(style.jsonProperties.styles).not.to.be.undefined;
        const actual = style.jsonProperties.styles!;

        expect(actual.viewflags).not.to.be.undefined;
        const expectedVf = ViewFlags.fromJSON(test[1]);
        const actualVf = ViewFlags.fromJSON(actual.viewflags);
        expect(actualVf.toJSON()).to.deep.equal(expectedVf.toJSON());

        const expectedBGColor = expected.backgroundColor instanceof ColorDef ? expected.backgroundColor.toJSON() : expected.backgroundColor;
        expect(actual.backgroundColor).to.equal(expectedBGColor);

        // DisplayStyleSettings constructor always initializes json.mapImagery.
        expect(actual.mapImagery).to.deep.equal(expected.mapImagery ?? defaultMapImagery);
        expect(actual.excludedElements).to.deep.equal(expected.excludedElements);
        expect(actual.timePoint).to.deep.equal(expected.timePoint);
      }
    });
  });

  it("should have a valid root subject element", () => {
    const rootSubject = ivault1.elements.getRootSubject();
    assert.exists(rootSubject);
    assert.isTrue(rootSubject instanceof Subject);
    assert.isAtLeast(rootSubject.code.value.length, 1);
    assert.isFalse(ivault1.elements.hasSubModel(IVault.rootSubjectId));

    try {
      ivault1.models.getSubModel(rootSubject.id); // throws error
      assert.fail(); // this line should be skipped
    } catch (error: any) {
      assert.isTrue(error instanceof Error);
      assert.isTrue(error instanceof IVaultError);
      assert.equal(error.errorNumber, IVaultStatus.NotFound);
    }

    const childIds: Id64String[] = ivault1.elements.queryChildren(rootSubject.id);
    assert.isAtLeast(childIds.length, 1);
    for (const childId of childIds) {
      const childElement = ivault1.elements.getElement(childId);
      assert.exists(childElement);
      assert.isTrue(childElement instanceof Element);

      roundtripThroughJson(childElement);
      assert.equal(rootSubject.id, childElement.parent!.id);

      const childLocalId = Id64.getLocalId(childId);
      const childBcId = Id64.getBriefcaseId(childId);
      if (childElement instanceof InformationPartitionElement) {
        assert.isTrue(ivault1.elements.hasSubModel(childElement.id));
        const childSubModel: Model = ivault1.models.getSubModel(childElement.id);
        assert.exists(childSubModel, "InformationPartitionElements should have a subModel");

        if (childLocalId === 16 && childBcId === 0) {
          assert.isTrue(childElement instanceof DefinitionPartition, "ChildId 0x00000010 should be a DefinitionPartition");
          assert.isTrue(childElement.code.value === "BisCore.DictionaryModel", "Definition Partition should have code value of BisCore.DictionaryModel");
        } else if (childLocalId === 14 && childBcId === 0) {
          assert.isTrue(childElement instanceof LinkPartition);
          assert.isTrue(childElement.code.value === "BisCore.RealityDataSources");
        } else if (childLocalId === 17 && childBcId === 0) {
          assert.isTrue(childElement instanceof LinkPartition, "ChildId 0x000000011 should be a LinkPartition");
          assert.isTrue(childElement.code.value === "Repository Links");
        }
      } else if (childElement instanceof Subject) {
        assert.isFalse(ivault1.elements.hasSubModel(childElement.id));
        if (childLocalId === 19 && childBcId === 0) {
          assert.isTrue(childElement instanceof Subject);
          assert.isTrue(childElement.code.value === "BldV8:mf3, A", "Subject should have code value of BldV8:mf3, A");
          assert.isTrue(childElement.jsonProperties.Subject.Job.BldV8.V8File === "mf3.bld", "Subject should have jsonProperty Subject.Job.DgnV.V8File");
          assert.isTrue(childElement.jsonProperties.Subject.Job.BldV8.V8RootModel === "A", "Subject should have jsonProperty Subject.Job.DgnV.V8RootModel");
        }
      }
    }
  });

  it("should load a known model by Id from an existing iVault", () => {
    assert.exists(ivault1.models);
    const model2 = ivault1.models.getModel("0x1c");
    assert.exists(model2);
    const formatter = model2.getJsonProperty("formatter");
    assert.exists(formatter, "formatter should exist as json property");
    assert.equal(formatter.fmtFlags.angMode, 1, "fmtFlags");
    assert.equal(formatter.mastUnit.label, "m", "mastUnit is meters");
    roundtripThroughJson(model2);
    let model = ivault1.models.getModel(IVault.repositoryModelId);
    assert.exists(model);
    roundtripThroughJson(model);
    const code1 = new Code({ spec: "0x1d", scope: "0x1d", value: "A" });
    model = ivault1.models.getSubModel(code1);
    // By this point, we expect the submodel's class to be in the class registry *cache*
    const geomModel = ClassRegistry.getClass(PhysicalModel.classFullName, ivault1);
    assert.exists(model);
    assert.isTrue(model instanceof geomModel);
    roundtripThroughJson(model);
    const modelExtents: AxisAlignedBox3d = (model as PhysicalModel).queryExtents();

    assert.isBelow(modelExtents.low.x, modelExtents.high.x);
    assert.isBelow(modelExtents.low.y, modelExtents.high.y);
    assert.isBelow(modelExtents.low.z, modelExtents.high.z);
  });

  it("should find a tile tree for a geometric model", async () => {
    // Note: this is an empty model.
    const tree = await ivault1.tiles.requestTileTreeProps("0x1c");
    expect(tree).not.to.be.undefined;

    expect(tree.id).to.equal("0x1c");
    expect(tree.maxTilesToSkip).to.equal(1);
    expect(tree.rootTile).not.to.be.undefined;

    // Empty model => identity transform
    const tf = Transform.fromJSON(tree.location);
    expect(tf.matrix.isIdentity).to.be.true;
    expect(tf.origin.x).to.equal(0);
    expect(tf.origin.y).to.equal(0);
    expect(tf.origin.z).to.equal(0);

    expect(tree.rootTile.contentId).to.equal("0/0/0/0/1");

    // Empty model => null range
    const range = Range3d.fromJSON(tree.rootTile.range);
    expect(range.isNull).to.be.true;

    expect(tree.rootTile.maximumSize).to.equal(0.0); // empty model => undisplayable root tile => size = 0.0
    expect(tree.rootTile.isLeaf).to.be.true; // empty model => empty tile
    expect(tree.rootTile.contentRange).to.be.undefined;
  });

  it("should throw on invalid tile requests", async () => {
    using _r = new DisableNativeAssertions();
    let error = await getIVaultError(ivault1.tiles.requestTileTreeProps("0x12345"));
    expectIVaultError(IVaultStatus.InvalidId, error);

    error = await getIVaultError(ivault1.tiles.requestTileTreeProps("NotAValidId"));
    expectIVaultError(IVaultStatus.InvalidId, error);

    error = await getIVaultError(ivault1.tiles.requestTileContent("0x1c", "0/0/0/0"));
    expectIVaultError(IVaultStatus.InvalidId, error);

    error = await getIVaultError(ivault1.tiles.requestTileContent("0x12345", "0/0/0/0/1"));
    expectIVaultError(IVaultStatus.InvalidId, error);

    error = await getIVaultError(ivault1.tiles.requestTileContent("0x1c", "V/W/X/Y/Z"));
    expectIVaultError(IVaultStatus.InvalidId, error);

    error = await getIVaultError(ivault1.tiles.requestTileContent("0x1c", "NotAValidId"));
    expectIVaultError(IVaultStatus.InvalidId, error);
  });

  // NOTE: this test can be removed when the deprecated executeQuery method is removed
  it("should produce an array of rows", () => {
    const rows: any[] = IVaultTestUtils.executeQuery(ivault1, `SELECT * FROM ${Category.classFullName}`);
    assert.exists(rows);
    assert.isArray(rows);
    assert.isAtLeast(rows.length, 1);
    assert.exists(rows[0].id);
    assert.notEqual(rows[0].id.value, "");
  });

  it("should be some categories", () => {
    const categorySql = `SELECT DMInstanceId FROM ${Category.classFullName}`;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault1.withPreparedStatement(categorySql, (categoryStatement: DMSqlStatement): void => {
      let numCategories = 0;
      while (DbResult.BE_SQLITE_ROW === categoryStatement.step()) {
        numCategories++;
        const categoryId = categoryStatement.getValue(0).getId();
        const category: Element = ivault1.elements.getElement(categoryId);
        assert.isTrue(category instanceof Category, "Should be instance of Category");

        // verify the default subcategory.
        const defaultSubCategoryId = (category as Category).myDefaultSubCategoryId();
        const defaultSubCategory: Element = ivault1.elements.getElement(defaultSubCategoryId);
        assert.isTrue(defaultSubCategory instanceof SubCategory, "defaultSubCategory should be instance of SubCategory");
        if (defaultSubCategory instanceof SubCategory) {
          assert.isTrue(defaultSubCategory.parent!.id === categoryId, "defaultSubCategory id should be prescribed value");
          assert.isTrue(defaultSubCategory.getSubCategoryName() === category.code.value, "DefaultSubcategory name should match that of Category");
          assert.isTrue(defaultSubCategory.isDefaultSubCategory, "isDefaultSubCategory should return true");
        }

        // get the subcategories
        const subCategorySql = `SELECT DMInstanceId FROM ${SubCategory.classFullName} WHERE Parent.Id=:parentId`;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        ivault1.withPreparedStatement(subCategorySql, (subCategoryStatement: DMSqlStatement): void => {
          let numSubCategories = 0;
          subCategoryStatement.bindId("parentId", categoryId);
          while (DbResult.BE_SQLITE_ROW === subCategoryStatement.step()) {
            numSubCategories++;
            const subCategoryId = subCategoryStatement.getValue(0).getId();
            const subCategory: Element = ivault1.elements.getElement(subCategoryId);
            assert.isTrue(subCategory instanceof SubCategory);
            assert.isTrue(subCategory.parent!.id === categoryId);
          }
          assert.isAtLeast(numSubCategories, 1, "Expected query to find at least one SubCategory");
        });
      }
      assert.isAtLeast(numCategories, 1, "Expected query to find some categories");
    });
  });

  it("should be some 2d elements", () => {
    const sql = `SELECT DMInstanceId FROM ${DrawingGraphic.classFullName}`;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault2.withPreparedStatement(sql, (statement: DMSqlStatement): void => {
      let numDrawingGraphics = 0;
      let found25: boolean = false;
      let found26: boolean = false;
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        numDrawingGraphics++;
        const drawingGraphicId = statement.getValue(0).getId();
        const drawingGraphic = ivault2.elements.getElement<GeometricElement2d>({ id: drawingGraphicId, wantGeometry: true });
        assert.exists(drawingGraphic);
        assert.isTrue(drawingGraphic.className === "DrawingGraphic", "Should be instance of DrawingGraphic");
        assert.isTrue(drawingGraphic instanceof DrawingGraphic, "Is instance of DrawingGraphic");
        assert.isTrue(drawingGraphic instanceof GeometricElement2d, "Is instance of GeometricElement2d");
        if (Id64.getLocalId(drawingGraphic.id) === 0x25) {
          found25 = true;
          assert.isTrue(drawingGraphic.placement.origin.x === 0.0);
          assert.isTrue(drawingGraphic.placement.origin.y === 0.0);
          assert.isTrue(drawingGraphic.placement.angle.radians === 0.0);
          assert.isTrue(drawingGraphic.placement.bbox.low.x === 0.0);
          assert.isTrue(drawingGraphic.placement.bbox.low.y === 0.0);
          assert.isTrue(drawingGraphic.placement.bbox.high.x === 1.0);
          assert.isTrue(drawingGraphic.placement.bbox.high.y === 1.0);
          assert.isDefined(drawingGraphic.geom);
        } else if (Id64.getLocalId(drawingGraphic.id) === 0x26) {
          found26 = true;
          assert.isTrue(drawingGraphic.placement.origin.x === 1.0);
          assert.isTrue(drawingGraphic.placement.origin.y === 1.0);
          assert.isTrue(drawingGraphic.placement.angle.radians === 0.0);
          assert.isTrue(drawingGraphic.placement.bbox.low.x === 0.0);
          assert.isTrue(drawingGraphic.placement.bbox.low.y === 0.0);
          assert.isTrue(drawingGraphic.placement.bbox.high.x === 2.0);
          assert.isTrue(drawingGraphic.placement.bbox.high.y === 2.0);
          assert.isDefined(drawingGraphic.geom);
        }
      }
      assert.isAtLeast(numDrawingGraphics, 1, "Expected query to find some DrawingGraphics");
      assert.isTrue(found25, "Expected to find a specific element");
      assert.isTrue(found26, "Expected to find a specific element");
    });
  });

  it("should be able to query for ViewDefinitionProps", () => {
    const viewDefinitionProps: ViewDefinitionProps[] = ivault2.views.queryViewDefinitionProps(); // query for all ViewDefinitions
    assert.isAtLeast(viewDefinitionProps.length, 3);
    assert.isTrue(viewDefinitionProps[0].classFullName.includes("ViewDefinition"));
    assert.isFalse(viewDefinitionProps[1].isPrivate);

    const spatialViewDefinitionProps = ivault2.views.queryViewDefinitionProps("BisCore.SpatialViewDefinition") as SpatialViewDefinitionProps[]; // limit query to SpatialViewDefinitions
    assert.isAtLeast(spatialViewDefinitionProps.length, 3);
    assert.exists(spatialViewDefinitionProps[2].modelSelector?.id);
  });

  it("should iterate ViewDefinitions", () => {
    // ivault2 contains 3 SpatialViewDefinitions and no other views.
    let numViews = 0;
    let result = ivault2.views.iterateViews(IVaultDb.Views.defaultQueryParams, (_view: ViewDefinition) => {
      ++numViews;
      return true;
    });

    expect(result).to.be.true;
    expect(numViews).to.equal(3);

    // Query specifically for spatial views
    numViews = 0;
    result = ivault2.views.iterateViews({ from: "BisCore.SpatialViewDefinition" }, (view: ViewDefinition) => {
      if (view.isSpatialView())
        ++numViews;

      return view.isSpatialView();
    });
    expect(result).to.be.true;
    expect(numViews).to.equal(3);

    // Query specifically for 2d views
    numViews = 0;
    result = ivault2.views.iterateViews({ from: "BisCore.ViewDefinition2d" }, (_view: ViewDefinition) => {
      ++numViews;
      return true;
    });

    expect(result).to.be.true;
    expect(numViews).to.equal(0);

    // Terminate iteration on first view
    numViews = 0;
    result = ivault2.views.iterateViews(IVaultDb.Views.defaultQueryParams, (_view: ViewDefinition) => {
      ++numViews;
      return false;
    });

    expect(result).to.be.false;
    expect(numViews).to.equal(1);
  });

  it("should be children of RootSubject", () => {
    const sql = `SELECT DMInstanceId FROM ${Model.classFullName} WHERE ParentModel.Id=:parentModelId`;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault2.withPreparedStatement(sql, (statement: DMSqlStatement): void => {
      statement.bindId("parentModelId", IVault.repositoryModelId);
      let numModels = 0;
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        numModels++;
        const modelId = statement.getValue(0).getId();
        const model = ivault2.models.getModel(modelId);
        assert.exists(model, "Model should exist");
        assert.isTrue(model instanceof Model);

        // should be an element with the same Id.
        const modeledElement = ivault2.elements.getElement(modelId);
        assert.exists(modeledElement, "Modeled Element should exist");

        if (model.className === "LinkModel") {
          // expect LinkModel to be accompanied by LinkPartition
          assert.isTrue(modeledElement instanceof LinkPartition);
          continue;
        } else if (model.className === "DictionaryModel") {
          assert.isTrue(modeledElement instanceof DefinitionPartition);
          continue;
        } else if (model.className === "PhysicalModel") {
          assert.isTrue(modeledElement instanceof PhysicalPartition);
          continue;
        } else if (model.className === "GroupModel") {
          assert.isTrue(modeledElement instanceof GroupInformationPartition);
          continue;
        } else if (model.className === "DocumentListModel") {
          assert.isTrue(modeledElement instanceof DocumentPartition);
          continue;
        } else if (model.className === "DefinitionModel") {
          assert.isTrue(modeledElement instanceof DefinitionPartition);
          continue;
        } else {
          assert.isTrue(false, "Expected a known model type");
        }
      }
      assert.isAtLeast(numModels, 1, "Expected query to find some Models");
    });
  });

  it("should insert and update auto-handled properties", () => {
    const testElem = ivault4.elements.getElement("0x14");
    assert.isDefined(testElem);
    assert.equal(testElem.classFullName, "BldPlatformTest:TestElementWithNoHandler");
    assert.isUndefined(testElem.asAny.integerProperty1);

    const newTestElem = roundtripThroughJson(testElem) as Element;
    assert.equal(newTestElem.classFullName, testElem.classFullName);
    newTestElem.asAny.integerProperty1 = 999;
    assert.isTrue(testElem.asAny.arrayOfPoint3d[0].isAlmostEqual(newTestElem.asAny.arrayOfPoint3d[0]));

    const loc1 = { street: "Elm Street", city: { name: "Downingtown", state: "PA" } };
    const loc2 = { street: "Oak Street", city: { name: "Downingtown", state: "PA" } };
    const loc3 = { street: "Chestnut Street", city: { name: "Philadelphia", state: "PA" } };
    const arrayOfStructs = [loc2, loc3];
    newTestElem.asAny.location = loc1;
    newTestElem.asAny.arrayOfStructs = arrayOfStructs;
    newTestElem.asAny.dtUtc = new Date("2015-03-25");
    newTestElem.asAny.p3d = new Point3d(1, 2, 3);

    const txn = new EditTxn(ivault4, "insert and update auto-handled properties");
    txn.start();
    const newTestElemId = txn.insertElement(newTestElem.toJSON());

    assert.isTrue(Id64.isValidId64(newTestElemId), "insert worked");

    const newTestElemFetched = ivault4.elements.getElement(newTestElemId);
    assert.isDefined(newTestElemFetched);
    assert.isTrue(newTestElemFetched.id === newTestElemId);
    assert.equal(newTestElemFetched.classFullName, newTestElem.classFullName);
    assert.isDefined(newTestElemFetched.asAny.integerProperty1);
    assert.equal(newTestElemFetched.asAny.integerProperty1, newTestElem.asAny.integerProperty1);
    assert.isTrue(newTestElemFetched.asAny.arrayOfPoint3d[0].isAlmostEqual(newTestElem.asAny.arrayOfPoint3d[0]));
    assert.deepEqual(newTestElemFetched.asAny.location, loc1);
    assert.deepEqual(newTestElem.asAny.arrayOfStructs, arrayOfStructs);
    // TODO: getElement must convert date ISO string to Date object    assert.deepEqual(newTestElemFetched.dtUtc, newTestElem.dtUtc);
    assert.deepEqual(newTestElemFetched.asAny.dtUtc, newTestElem.asAny.dtUtc.toJSON());
    assert.isTrue(newTestElemFetched.asAny.p3d.isAlmostEqual(newTestElem.asAny.p3d));

    // ----------- updates ----------------
    const wasp3d = newTestElemFetched.asAny.p3d;
    const editElem = newTestElemFetched;
    editElem.asAny.location = loc2;
    try {
      txn.updateElement(editElem.toJSON());
    } catch {
      assert.fail("Element.update failed");
    }
    const afterUpdateElemFetched = ivault4.elements.getElement(editElem.id);
    assert.deepEqual(afterUpdateElemFetched.asAny.location, loc2, " location property should be the new one");
    assert.deepEqual(afterUpdateElemFetched.asAny.id, editElem.id, " the id should not have changed.");
    assert.deepEqual(afterUpdateElemFetched.asAny.p3d, wasp3d, " p3d property should not have changed");

    // Make array shorter
    assert.equal(afterUpdateElemFetched.asAny.arrayOfInt.length, 300);

    afterUpdateElemFetched.asAny.arrayOfInt = [99, 3];
    txn.updateElement(afterUpdateElemFetched.toJSON());

    const afterShortenArray = ivault4.elements.getElement(afterUpdateElemFetched.id);
    assert.equal(afterUpdateElemFetched.asAny.arrayOfInt.length, 2);
    assert.deepEqual(afterShortenArray.asAny.arrayOfInt, [99, 3]);

    // Make array longer
    afterShortenArray.asAny.arrayOfInt = [1, 2, 3];
    txn.updateElement(afterShortenArray.toJSON());
    const afterLengthenArray = ivault4.elements.getElement(afterShortenArray.id);
    assert.equal(afterLengthenArray.asAny.arrayOfInt.length, 3);
    assert.deepEqual(afterLengthenArray.asAny.arrayOfInt, [1, 2, 3]);

    // ------------ delete -----------------
    const elid = afterUpdateElemFetched.id;
    txn.deleteElement(elid);
    assert.throws(() => ivault4.elements.getElement(elid), IVaultError);
    txn.end();
  });

  it("should handle parent and child deletion properly", () => {
    const txn = new EditTxn(ivault4, "handle parent and child deletion");
    txn.start();
    const categoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "MyTestCategory", new SubCategoryAppearance());
    const category = ivault4.elements.getElement<SpatialCategory>(categoryId);
    const subCategory = ivault4.elements.getElement<SubCategory>(category.myDefaultSubCategoryId());
    expect(() => txn.deleteElement(categoryId)).throws("error deleting element").to.have.property("metadata");
    assert.exists(ivault4.elements.getElement(categoryId), "Category deletes should be blocked in native code");
    assert.exists(ivault4.elements.getElement(subCategory.id), "Children should not be deleted if parent delete is blocked");

    const modelId = PhysicalModel.insert(txn, IVault.rootSubjectId, "MyTestPhysicalModel");
    const elementProps: GeometricElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: modelId,
      category: categoryId,
      code: Code.createEmpty(),
    };
    const parentId = txn.insertElement(elementProps);
    elementProps.parent = new ElementOwnsChildElements(parentId);
    const childId1 = txn.insertElement(elementProps);
    const childId2 = txn.insertElement(elementProps);
    assert.exists(ivault4.elements.getElement(parentId));
    assert.exists(ivault4.elements.getElement(childId1));
    assert.exists(ivault4.elements.getElement(childId2));
    txn.deleteElement(parentId);
    assert.throws(() => ivault4.elements.getElement(parentId), IVaultError);
    assert.throws(() => ivault4.elements.getElement(childId1), IVaultError);
    assert.throws(() => ivault4.elements.getElement(childId2), IVaultError);
    txn.end();
  });

  function checkElementMetaData(entityClass: EntityClass) {
    assert.isNotNull(entityClass);
    assert.equal(entityClass.fullName, Element.classFullName.replace(":", "."));
    assert.isUndefined(entityClass.baseClass);

    let foundClassHasHandler = false;
    let foundClassHasCurrentTimeStampProperty = false;
    if (entityClass.customAttributes !== undefined) {
      if (entityClass.customAttributes.has("BisCore.ClassHasHandler"))
        foundClassHasHandler = true;
      if (entityClass.customAttributes.has("CoreCustomAttributes.ClassHasCurrentTimeStampProperty"))
        foundClassHasCurrentTimeStampProperty = true;
    }
    assert.isTrue(foundClassHasHandler);
    assert.isTrue(foundClassHasCurrentTimeStampProperty);
    const federationGuid = entityClass.getPropertySync("federationGuid", false);
    if (federationGuid !== undefined) {
      assert.isTrue(federationGuid.isPrimitive());
      assert.equal(federationGuid.propertyType, PropertyType.Binary);
      assert.equal((federationGuid as PrimitiveOrEnumPropertyBase).extendedTypeName, "BeGuid");
    }
  }

  it("should get metadata for a relationship", async () => {
    const ivaultPath = IVaultTestUtils.prepareOutputFile("IVault", "relationshipMetadata.dtw");
    const ivault = SnapshotDb.createEmpty(ivaultPath, { rootSubject: { name: "relationshipMetadata" } });

    await withEditTxn(ivault, async (txn) => {
      const partitionId = txn.insertElement({
        classFullName: "BisCore:PhysicalPartition",
        model: IVault.repositoryModelId,
        parent: {
          relClassName: "BisCore:SubjectOwnsPartitionElements",
          id: IVault.rootSubjectId,
        },
        code: new Code({
          spec: ivault.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
          scope: IVault.rootSubjectId,
          value: "physical model",
        }),
      });

      for await (const row of ivault.createQueryReader(`SELECT * FROM bis.Element LIMIT ${1}`)) {
        const relId = txn.insertRelationship({
          classFullName: "BisCore:ElementHasLinks",
          sourceId: partitionId,
          targetId: row.DMInstanceId,
        });
        const relationship = ivault.relationships.getInstance("BisCore:ElementHasLinks", relId);
        const metadata = await relationship.getMetaData();
        assert.isDefined(metadata, "metadata should be defined");
      }
    });
    ivault.close();
  });

  it("should get metadata for class", () => {
    const metaData = ivault1.schemaContext.getSchemaItemSync(Element.classFullName, EntityClass);
    assert.exists(metaData);
    if (metaData !== undefined)
      checkElementMetaData(metaData);
  });

  it("should iterate through metadata for a relationship", async () => {
    const ivaultPath = IVaultTestUtils.prepareOutputFile("IVault", "relationshipMetadata.dtw");
    const ivault = SnapshotDb.createEmpty(ivaultPath, { rootSubject: { name: "relationshipMetadata" } });

    await withEditTxn(ivault, async (txn) => {
      const partitionId = txn.insertElement({
        classFullName: "BisCore:PhysicalPartition",
        model: IVault.repositoryModelId,
        parent: {
          relClassName: "BisCore:SubjectOwnsPartitionElements",
          id: IVault.rootSubjectId,
        },
        code: new Code({
          spec: ivault.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
          scope: IVault.rootSubjectId,
          value: "physical model",
        }),
      });

      for await (const row of ivault.createQueryReader(`SELECT * FROM bis.Element LIMIT ${1}`)) {
        const relId = txn.insertRelationship({
          classFullName: "BisCore:ElementHasLinks",
          sourceId: partitionId,
          targetId: row.DMInstanceId,
        });
        const relationship = ivault.relationships.getInstance("BisCore:ElementHasLinks", relId);
        relationship.forEach((propName, propMeta) => {
          assert.isDefined(propName, "Property name should be defined");
          assert.isDefined(propMeta, "Property metadata should be defined");
        });
      }
    });

    ivault.close();
  });

  it("update the project extents", async () => {
    const originalExtents = ivault1.projectExtents;
    const newExtents = Range3d.create(originalExtents.low, originalExtents.high);
    newExtents.low.x -= 50;
    newExtents.low.y -= 25;
    newExtents.low.z -= 189;
    newExtents.high.x += 1087;
    newExtents.high.y += 19;
    newExtents.high.z += .001;
    await withEditTxn(ivault1, async (txn) => txn.updateProjectExtents(newExtents));

    const updatedProps = ivault1[_nativeDb].getIVaultProps();
    assert.isTrue(updatedProps.hasOwnProperty("projectExtents"), "Returned property JSON object has project extents");
    const updatedExtents = Range3d.fromJSON(updatedProps.projectExtents);
    assert.isTrue(newExtents.isAlmostEqual(updatedExtents), "Project extents successfully updated in database");
  });

  it("read view thumbnail", () => {
    const viewId = "0x24";
    const thumbnail = ivault5.views.getThumbnail(viewId);
    assert.exists(thumbnail);
    if (!thumbnail)
      return;
    assert.equal(thumbnail.format, "jpeg");
    assert.equal(thumbnail.height, 768);
    assert.equal(thumbnail.width, 768);
    assert.equal(thumbnail.image.length, 18062);

    thumbnail.width = 100;
    thumbnail.height = 200;
    thumbnail.format = "png";
    thumbnail.image = new Uint8Array(200);
    thumbnail.image.fill(12);
    const stat = ivault5.views.saveThumbnail(viewId, thumbnail);
    assert.equal(stat, 0, "save thumbnail");

    const thumbnail2 = ivault5.views.getThumbnail(viewId);
    assert.exists(thumbnail2);
    if (!thumbnail2)
      return;
    assert.equal(thumbnail2.format, "png");
    assert.equal(thumbnail2.height, 200);
    assert.equal(thumbnail2.width, 100);
    assert.equal(thumbnail2.image.length, 200);
    assert.equal(thumbnail2.image[0], 12);
  });

  it("ecefLocation for iVaults", () => {
    assert.isTrue(ivault5.isGeoLocated);
    const center = { x: 289095, y: 3803860, z: 10 }; // near center of project extents, 10 meters above ground.
    const ecefPt = ivault5.spatialToEcef(center);
    const pt = { x: -3575156.3661052254, y: 3873432.0891543664, z: 3578996.012643183 };
    assert.isTrue(ecefPt.isAlmostEqual(pt), "spatialToEcef");

    const z2 = ivault5.ecefToSpatial(ecefPt);
    assert.isTrue(z2.isAlmostEqual(center), "ecefToSpatial");

    const carto = ivault5.spatialToCartographicFromEcef(center);
    assert.approximately(carto.longitudeDegrees, 132.70683882277805, .1); // this data is in Japan
    assert.approximately(carto.latitudeDegrees, 34.35462768786055, .1);
    const c2 = { longitude: 2.3161712773709127, latitude: 0.5996013664499733, height: 10 };
    assert.isTrue(carto.equalsEpsilon(c2, .001), "spatialToCartographic");

    ivault5.cartographicToSpatialFromEcef(carto, z2);
    assert.isTrue(z2.isAlmostEqual(center, .001), "cartographicToSpatial");

    assert.isTrue(ivault5.geographicCoordinateSystem !== undefined);
    assert.isTrue(ivault5.geographicCoordinateSystem!.horizontalCRS !== undefined);
    assert.isTrue(ivault5.geographicCoordinateSystem!.verticalCRS !== undefined);
    assert.isTrue(ivault5.geographicCoordinateSystem!.verticalCRS!.id !== undefined);
    assert.isTrue(ivault5.geographicCoordinateSystem!.horizontalCRS!.id === "UTM84-53N");
    assert.isTrue(ivault5.geographicCoordinateSystem!.verticalCRS!.id === "ELLIPSOID");
  });

  function checkClassHasHandlerMetaData(classToCheck: CustomAttributeClass) {
    assert.isDefined(classToCheck);

    const propertiesArray = Array.from(classToCheck.getPropertiesSync(true));
    assert.equal(propertiesArray.length, 1);

    const restrictionProperty = propertiesArray[0];
    assert.isDefined(restrictionProperty);
    assert.equal(restrictionProperty.name, "Restrictions");
    assert.equal(propertyTypeToString(restrictionProperty.propertyType), "PrimitiveArrayProperty");
    assert.equal((restrictionProperty as PrimitiveArrayProperty).minOccurs, 0);
  }

  it("should get metadata for CA class just as well (and we'll see a array-typed property)", () => {
    const metaData = ivault1.schemaContext.getSchemaItemSync("BisCore.ClassHasHandler", CustomAttributeClass);
    assert.exists(metaData);
    if (metaData !== undefined) {
      assert.equal(metaData.schemaItemType, SchemaItemType.CustomAttributeClass);
      checkClassHasHandlerMetaData(metaData);
    }
  });

  it("should exercise DMSqlStatement (backend only)", () => {
    // Reject an invalid statement
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ivault2.prepareStatement("select no_such_property, codeValue from bis.element", false);
      assert.fail("prepare should have failed with an exception");
    } catch (err: any) {
      assert.isTrue(err.constructor.name === "IVaultError");
      assert.notEqual(err.status, DbResult.BE_SQLITE_OK);
    }
    let lastId: string = "";
    let firstCodeValue: string = "";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault2.withPreparedStatement("select dminstanceid, codeValue from bis.element", (stmt: DMSqlStatement) => {
      assert.isNotNull(stmt);
      // Reject an attempt to bind when there are no placeholders in the statement
      try {
        stmt.bindStruct(1, { foo: 1 });
        assert.fail("bindStruct should have failed with an exception");
      } catch (err2: any) {
        assert.isTrue(err2.constructor.name === "IVaultError");
        assert.notEqual(err2.status, DbResult.BE_SQLITE_OK);
      }

      // Verify that we get a bunch of rows with the expected shape
      let count = 0;
      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        const row = stmt.getRow();
        assert.isNotNull(row);
        assert.isObject(row);
        assert.isTrue(row.id !== undefined);
        assert.isTrue(Id64.isValid(Id64.fromJSON(row.id)));
        lastId = row.id;
        if (row.codeValue !== undefined)
          firstCodeValue = row.codeValue;
        count = count + 1;
      }
      assert.isTrue(count > 1);
      assert.notEqual(lastId, "");
      assert.notEqual(firstCodeValue, "");

      // Try iterator style
      let firstCodeValueIter: string = "";
      let iteratorCount = 0;
      let lastIterId: string = "";
      stmt.reset();
      for (const row of stmt) {
        assert.isNotNull(row);
        assert.isObject(row);
        assert.isTrue(row.id !== undefined);
        assert.isTrue(Id64.isValid(Id64.fromJSON(row.id)));
        lastIterId = row.id;
        iteratorCount = iteratorCount + 1;
        if (row.codeValue !== undefined)
          firstCodeValueIter = row.codeValue;
      }
      assert.equal(iteratorCount, count, "iterator loop should find the same number of rows as the step loop");
      assert.equal(lastIterId, lastId, "iterator loop should see the same last row as the step loop");
      assert.equal(firstCodeValueIter, firstCodeValue, "iterator loop should find the first non-null code value as the step loop");
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault2.withPreparedStatement("select dminstanceid, codeValue from bis.element WHERE (dminstanceid=?)", (stmt3: DMSqlStatement) => {
      // Now try a statement with a placeholder
      const idToFind = Id64.fromJSON(lastId);
      stmt3.bindId(1, idToFind);
      let count = 0;
      while (DbResult.BE_SQLITE_ROW === stmt3.step()) {
        count = count + 1;
        const row = stmt3.getRow();
        // Verify that we got the row that we asked for
        assert.isTrue(idToFind === Id64.fromJSON(row.id));
      }
      // Verify that we got the row that we asked for
      assert.equal(count, 1);
    });

    let firstCodeValueId: Id64String | undefined;
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault2.withPreparedStatement("select dminstanceid, codeValue from bis.element WHERE (codeValue = :codevalue)", (stmt4: DMSqlStatement) => {
      // Try a named placeholder
      const codeValueToFind = firstCodeValue;
      stmt4.bindString("codeValue", codeValueToFind);
      let count = 0;
      while (DbResult.BE_SQLITE_ROW === stmt4.step()) {
        count = count + 1;
        const row = stmt4.getRow();
        // Verify that we got the row that we asked for
        assert.equal(row.codeValue, codeValueToFind);
        firstCodeValueId = row.id;
      }
      // Verify that we got the row that we asked for
      assert.equal(count, 1);
    });

    // make sure we can use parameterized values for queryEnityId (test on parameterized codevalue)
    const ids = ivault2.queryEntityIds({ from: "bis.element", where: "codevalue=:cv", bindings: { cv: firstCodeValue } });
    assert.equal(ids.values().next().value, firstCodeValueId);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    ivault2.withPreparedStatement("select dminstanceid as id, codevalue from bis.element", (stmt5: DMSqlStatement) => {
      while (DbResult.BE_SQLITE_ROW === stmt5.step()) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        ivault2.withPreparedStatement("select codevalue from bis.element where dminstanceid=?", (stmt6: DMSqlStatement) => {
          stmt6.bindId(1, stmt5.getRow().id);
          while (DbResult.BE_SQLITE_ROW === stmt6.step()) {
            assert.equal(stmt6.getRow().codevalue, stmt5.getRow().codevalue);
          }
        });
      }
    });

    // make sure queryEnityIds works fine when all params are specified
    const physicalObjectIds = ivault2.queryEntityIds({ from: "generic.PhysicalObject", where: "codevalue is null", limit: 1, offset: 1, only: true, orderBy: "dminstanceid desc" });
    assert.equal(physicalObjectIds.size, 1);
  });

  it("validate BisCodeSpecs", async () => {
    assert.equal(ivault2.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).scopeType, CodeScopeSpec.Type.Repository);
    assert.equal(ivault2.codeSpecs.getByName(BisCodeSpec.subCategory).scopeType, CodeScopeSpec.Type.ParentElement);
    assert.equal(ivault2.codeSpecs.getByName(BisCodeSpec.viewDefinition).scopeType, CodeScopeSpec.Type.Model);
    assert.equal(ivault2.codeSpecs.getByName(BisCodeSpec.subject).scopeReq, CodeScopeSpec.ScopeRequirement.ElementId);
  });

  it("should create and insert CodeSpecs", () => {
    const testIvault = ivault2;
    const txn = new EditTxn(testIvault, "create and insert CodeSpecs");
    txn.start();
    const codeSpec = CodeSpec.create(testIvault, "CodeSpec1", CodeScopeSpec.Type.Model);
    const codeSpecId = testIvault.codeSpecs.insert(txn, codeSpec); // throws in case of error
    assert.deepEqual(codeSpecId, codeSpec.id);
    assert.equal(codeSpec.scopeType, CodeScopeSpec.Type.Model);
    assert.equal(codeSpec.scopeReq, CodeScopeSpec.ScopeRequirement.ElementId);

    // Should not be able to insert a duplicate.
    const codeSpecDup = CodeSpec.create(testIvault, "CodeSpec1", CodeScopeSpec.Type.Model);
    assert.throws(() => testIvault.codeSpecs.insert(txn, codeSpecDup), "CodeSpec already exists");

    // We should be able to insert another CodeSpec with a different name.
    const codeSpec2 = CodeSpec.create(testIvault, "CodeSpec2", CodeScopeSpec.Type.Model, CodeScopeSpec.ScopeRequirement.FederationGuid);
    const codeSpec2Id = testIvault.codeSpecs.insert(txn, codeSpec2); // throws in case of error
    assert.deepEqual(codeSpec2Id, codeSpec2.id);
    assert.notDeepEqual(codeSpec2Id, codeSpecId);

    // make sure CodeScopeSpec.Type.Repository works
    const codeSpec3 = CodeSpec.create(testIvault, "CodeSpec3", CodeScopeSpec.Type.Repository, CodeScopeSpec.ScopeRequirement.FederationGuid);
    const codeSpec3Id = testIvault.codeSpecs.insert(txn, codeSpec3); // throws in case of error
    assert.notDeepEqual(codeSpec2Id, codeSpec3Id);

    const codeSpec4 = testIvault.codeSpecs.getById(codeSpec3Id);
    codeSpec4.name = "CodeSpec4";
    const codeSpec4Id = testIvault.codeSpecs.insert(txn, codeSpec4); // throws in case of error
    assert.notDeepEqual(codeSpec3Id, codeSpec4Id);
    assert.equal(codeSpec4.scopeType, CodeScopeSpec.Type.Repository);
    assert.equal(codeSpec4.scopeReq, CodeScopeSpec.ScopeRequirement.FederationGuid);
    const copyOfCodeSpec4 = testIvault.codeSpecs.getById(codeSpec4Id);
    assert.deepEqual(codeSpec4, copyOfCodeSpec4);

    assert.isTrue(testIvault.codeSpecs.hasName("CodeSpec1"));
    assert.isTrue(testIvault.codeSpecs.hasName("CodeSpec2"));
    assert.isTrue(testIvault.codeSpecs.hasName("CodeSpec3"));
    assert.isTrue(testIvault.codeSpecs.hasName("CodeSpec4"));
    assert.isFalse(testIvault.codeSpecs.hasName("CodeSpec5"));

    assert.isTrue(testIvault.codeSpecs.hasId(codeSpec.id));
    assert.isTrue(testIvault.codeSpecs.hasId(codeSpec2.id));
    assert.isTrue(testIvault.codeSpecs.hasId(codeSpec3.id));
    assert.isTrue(testIvault.codeSpecs.hasId(codeSpec4.id));
    assert.isFalse(testIvault.codeSpecs.hasId(Id64.invalid));
    txn.end();
  });

  it("validate CodeSpec properties", async () => {
    const iVaultFileName: string = IVaultTestUtils.prepareOutputFile("IVault", "ReadWriteCodeSpec.dtw");
    const codeSpecName = "CodeSpec1";

    // Write new CodeSpec to iVault
    if (true) {
      const iVaultDb = IVaultTestUtils.createSnapshotFromSeed(iVaultFileName, IVaultTestUtils.resolveAssetFile("CompatibilityTestSeed.dtw"));
      const codeSpec = CodeSpec.create(iVaultDb, codeSpecName, CodeScopeSpec.Type.Model, CodeScopeSpec.ScopeRequirement.FederationGuid);
      const codeSpecId = withEditTxn(iVaultDb, (txn) => iVaultDb.codeSpecs.insert(txn, codeSpec));
      assert.isTrue(Id64.isValidId64(codeSpec.id));
      assert.equal(codeSpec.id, codeSpecId);
      assert.equal(codeSpec.name, codeSpecName);
      assert.equal(codeSpec.scopeType, CodeScopeSpec.Type.Model);
      assert.equal(codeSpec.scopeReq, CodeScopeSpec.ScopeRequirement.FederationGuid);
      iVaultDb.close();
    }

    // Reopen iVault (ensure CodeSpec cache is cleared) and reconfirm CodeSpec properties
    if (true) {
      const iVaultDb = SnapshotDb.openFile(iVaultFileName);
      const codeSpec = iVaultDb.codeSpecs.getByName(codeSpecName);
      assert.isTrue(Id64.isValidId64(codeSpec.id));
      assert.equal(codeSpec.name, codeSpecName);
      assert.equal(codeSpec.scopeType, CodeScopeSpec.Type.Model);
      assert.equal(codeSpec.scopeReq, CodeScopeSpec.ScopeRequirement.FederationGuid);
      iVaultDb.close();
    }
  });

  it("snapping", async () => {
    const worldToView = Matrix4d.createIdentity();
    const response = await ivault2.requestSnap("0x222", { testPoint: { x: 1, y: 2, z: 3 }, closePoint: { x: 1, y: 2, z: 3 }, id: "0x111", worldToView: worldToView.toJSON() });
    assert.isDefined(response.status);
  });

  it("should import schemas", async () => {
    const metaData = await ivault1.schemaContext.getSchemaItem("TestBim:TestDocument", EntityClass);
    assert.isDefined(metaData);
    if (metaData !== undefined) {
      const property = await metaData.getProperty("testDocumentProperty");
      assert.isDefined(property);
      if (property !== undefined)
        assert.isDefined(property.propertyType, propertyTypeToString(PropertyType.Integer));
    }
  });

  it("should do CRUD on models", () => {

    const testIvault = ivault2;
    const txn = new EditTxn(testIvault, "CRUD on models");
    txn.start();

    const [modeledElementId, newModelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, Code.createEmpty(), true);

    const newModelPersist = testIvault.models.getModel(newModelId);

    // Check that it has the properties that we set.
    assert.equal(newModelPersist.classFullName, PhysicalModel.classFullName);
    assert.isTrue(newModelPersist.isPrivate);
    assert.deepEqual(newModelPersist.modeledElement.id, modeledElementId);

    // Update the model
    newModelPersist.isPrivate = false;
    txn.updateModel(newModelPersist.toJSON());
    //  ... and check that it updated the model in the db
    const newModelPersist2 = testIvault.models.getModel(newModelId);
    assert.isFalse(newModelPersist2.isPrivate);

    // Delete the model
    txn.deleteModel(newModelId);

    // Test insertModel error handling
    try {
      txn.insertModel({
        classFullName: DefinitionModel.classFullName,
        modeledElement: { id: "0x10000000bad" },
      });
    } catch (error: any) {
      assert.isTrue(error instanceof IVaultError || error.szewTwinErrorId !== undefined);
    }

    txn.end();

  });

  it("should create model with custom relationship to modeled element", async () => {
    const testIvault = ivault1;
    const txn = new EditTxn(testIvault, "custom relationship to modeled element");

    assert.doesNotThrow(() => testIvault.schemaContext.getSchemaItemSync("TestBim:TestModelModelsElement", EntityClass), "TestModelModelsElement is expected to be defined in TestBim.dmschema.xml");

    txn.start();
    const newPartition1 = IVaultTestUtils.createAndInsertPhysicalPartition(txn, Code.createEmpty());
    const relClassName1 = "TestBim:TestModelModelsElement";
    const modeledElementRef = new RelatedElement({ id: newPartition1, relClassName: relClassName1 });
    const newModelId1 = IVaultTestUtils.createAndInsertPhysicalModel(txn, modeledElementRef);
    assert.isTrue(Id64.isValidId64(newModelId1));
    const [, newModelId2] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, Code.createEmpty());
    txn.end();
    const newModel2 = testIvault.models.getModel(newModelId2);
    const relClassName2 = newModel2.modeledElement.relClassName;

    const model1 = testIvault.models.getModel(newModelId1);
    const model2 = testIvault.models.getModel(newModelId2);

    const foundRelClassName1 = model1.modeledElement.relClassName;
    const foundRelClassName2 = model2.modeledElement.relClassName;

    assert.equal(foundRelClassName1, relClassName1);
    assert.equal(foundRelClassName2, relClassName2);
  });

  it("should create link table relationship instances", () => {
    const snapshotFile2: string = IVaultTestUtils.prepareOutputFile("IVault", "CreateLinkTable.dtw");
    const testIvault = StandaloneDb.createEmpty(snapshotFile2, { rootSubject: { name: "test1" }, enableTransactions: true });
    const txn = new EditTxn(testIvault, "link table relationship instances");
    txn.start();
    // Create a new physical model
    const newModelId = PhysicalModel.insert(txn, IVault.rootSubjectId, "TestModel");

    // create a SpatialCategory
    const spatialCategoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "MySpatialCategory", new SubCategoryAppearance({ color: ColorByName.darkRed }));

    // Create a couple of physical elements.
    const elementProps: GeometricElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: newModelId,
      category: spatialCategoryId,
      code: Code.createEmpty(),
    };

    const id0 = txn.insertElement(elementProps);
    const id1 = txn.insertElement(elementProps);
    const id2 = txn.insertElement(elementProps);

    const geometricModel = testIvault.models.getModel<GeometricModel>(newModelId);
    assert.throws(() => geometricModel.queryExtents()); // no geometry

    // Create grouping relationships from 0 to 1 and from 0 to 2
    const r1 = ElementGroupsMembers.create(testIvault, id0, id1, 1);
    r1.id = txn.insertRelationship(r1.toJSON());
    const r2 = ElementGroupsMembers.create(testIvault, id0, id2);
    r2.id = txn.insertRelationship(r2.toJSON());

    // Look up by id
    const g1 = ElementGroupsMembers.getInstance<ElementGroupsMembers>(testIvault, r1.id);
    const g2 = ElementGroupsMembers.getInstance<ElementGroupsMembers>(testIvault, r2.id);

    assert.deepEqual(g1.id, r1.id);
    assert.equal(g1.classFullName, ElementGroupsMembers.classFullName);
    assert.equal(g1.memberPriority, 1, "g1.memberPriority");
    assert.deepEqual(g2.id, r2.id);
    assert.equal(g2.classFullName, ElementGroupsMembers.classFullName);
    assert.equal(g2.memberPriority, 0, "g2.memberPriority");  // The memberPriority parameter defaults to 0 in ElementGroupsMembers.create

    // Look up by source and target
    const g1byst = ElementGroupsMembers.getInstance<ElementGroupsMembers>(testIvault, { sourceId: r1.sourceId, targetId: r1.targetId });
    assert.deepEqual(g1byst, g1);

    // Update relationship instance property
    r1.asAny.memberPriority = 2;
    txn.updateRelationship(r1.toJSON());

    const g11 = ElementGroupsMembers.getInstance<ElementGroupsMembers>(testIvault, r1.id);
    assert.equal(g11.memberPriority, 2, "g11.memberPriority");
    txn.saveChanges("step 1");

    // Delete relationship instance property
    txn.deleteRelationship(g11.toJSON());
    txn.saveChanges("step 2");
    assert.throws(() => ElementGroupsMembers.getInstance(testIvault, r1.id), IVaultError);

    const d0 = txn.insertElement(elementProps);
    const d1 = txn.insertElement(elementProps);
    const ede1 = ElementDrivesElement.create(testIvault, d0, d1, 0);
    ede1.id = txn.insertRelationship(ede1.toJSON());
    txn.saveChanges("step 3");

    txn.deleteRelationship(ede1.toJSON());
    txn.end("save", "step 4");
    testIvault.close();
  });

  it("should insert DefinitionSets", () => {
    const iVaultFileName: string = IVaultTestUtils.prepareOutputFile("IVault", "DefinitionSets.dtw");
    const iVaultDb = SnapshotDb.createEmpty(iVaultFileName, { rootSubject: { name: "DefinitionSets" }, createClassViews: true });
    const txn = new EditTxn(iVaultDb, "definition sets");
    txn.start();
    const definitionContainerId = DefinitionContainer.insert(txn, IVault.dictionaryId, Code.createEmpty());
    assert.exists(iVaultDb.elements.getElement<DefinitionContainer>(definitionContainerId));
    assert.exists(iVaultDb.models.getModel<DefinitionModel>(definitionContainerId));
    const categoryId1 = SpatialCategory.insert(txn, definitionContainerId, "Category1", new SubCategoryAppearance());
    const categoryId2 = SpatialCategory.insert(txn, definitionContainerId, "Category2", new SubCategoryAppearance());
    const categoryId3 = SpatialCategory.insert(txn, definitionContainerId, "Category3", new SubCategoryAppearance());
    const definitionGroupId = DefinitionGroup.create(iVaultDb, definitionContainerId, Code.createEmpty()).insert(txn);
    DefinitionGroupGroupsDefinitions.insert(txn, definitionGroupId, categoryId1);
    DefinitionGroupGroupsDefinitions.insert(txn, definitionGroupId, categoryId2);
    DefinitionGroupGroupsDefinitions.insert(txn, definitionGroupId, categoryId3);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const numMembers = iVaultDb.withPreparedStatement(`SELECT COUNT(*) FROM ${DefinitionGroupGroupsDefinitions.classFullName}`, (statement: DMSqlStatement): number => {
      return statement.step() === DbResult.BE_SQLITE_ROW ? statement.getValue(0).getInteger() : 0;
    });
    assert.equal(numMembers, 3);
    txn.end();
    iVaultDb.close();
  });

  it("should set DM properties of various types", async () => {

    const testIvault = ivault1;
    assert.doesNotThrow(() => testIvault.schemaContext.getSchemaItemSync("TestBim:TestPhysicalObject", EntityClass), "TestPhysicalObject is expected to be defined in TestBim.dmschema.xml");
    const txn = new EditTxn(testIvault, "set DM properties of various types");
    txn.start();

    // Create a new physical model
    const [, newModelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, Code.createEmpty(), true);

    // Find or create a SpatialCategory
    let spatialCategoryId = SpatialCategory.queryCategoryIdByName(testIvault, IVault.dictionaryId, "MySpatialCategory")!;
    if (undefined === spatialCategoryId) {
      spatialCategoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "MySpatialCategory", new SubCategoryAppearance());
    }

    const trelClassName = "TestBim:TestPhysicalObjectRelatedToTestPhysicalObject";

    let id1: Id64String;
    let id2: Id64String;

    if (true) {
      // Create a couple of TestPhysicalObjects
      const elementProps: GeometricElementProps = {
        classFullName: "TestBim:TestPhysicalObject",
        model: newModelId,
        category: spatialCategoryId,
        code: Code.createEmpty(),
      };

      id1 = txn.insertElement(testIvault.elements.createElement(elementProps).toJSON());
      assert.isTrue(Id64.isValidId64(id1));

      // The second one should point to the first.
      elementProps.id = Id64.invalid;
      (elementProps as any).relatedElement = { id: id1, relClassName: trelClassName };
      elementProps.parent = { id: id1, relClassName: trelClassName };
      (elementProps as any).longProp = 4294967295;     // make sure that we can save values in the range 0 ... UINT_MAX

      id2 = txn.insertElement(testIvault.elements.createElement(elementProps).toJSON());
      assert.isTrue(Id64.isValidId64(id2));
    }

    if (true) {
      // Test that el2 points to el1
      const el2 = testIvault.elements.getElement(id2);
      assert.equal(el2.classFullName, "TestBim:TestPhysicalObject");
      assert.isTrue("relatedElement" in el2);
      assert.isTrue("id" in el2.asAny.relatedElement);
      assert.deepEqual(el2.asAny.relatedElement.id, id1);
      assert.equal(el2.asAny.longProp, 4294967295);

      // Even though I didn't set it, the platform knows the relationship class and reports it.
      assert.isTrue("relClassName" in el2.asAny.relatedElement);
      assert.equal(el2.asAny.relatedElement.relClassName.replace(".", ":"), trelClassName);
    }

    if (true) {
      // Change el2 to point to itself.
      const el2Modified = testIvault.elements.getElement(id2);
      el2Modified.asAny.relatedElement = { id: id2, relClassName: trelClassName };
      txn.updateElement(el2Modified.toJSON());
      // Test that el2 points to itself.
      const el2after: Element = testIvault.elements.getElement(id2);
      assert.deepEqual(el2after.asAny.relatedElement.id, id2);
      assert.equal(el2after.asAny.relatedElement.relClassName.replace(".", ":"), trelClassName);
    }

    if (true) {
      // Test that we can null out the navigation property
      const el2Modified = testIvault.elements.getElement(id2);
      el2Modified.asAny.relatedElement = null;
      txn.updateElement(el2Modified.toJSON());
      // Test that el2 has no relatedElement property value
      const el2after: Element = testIvault.elements.getElement(id2);
      assert.isUndefined(el2after.asAny.relatedElement);
    }

    txn.end();
  });

  it("should be able to create a snapshot IVault", async () => {
    const args = {
      rootSubject: { name: "TestSubject", description: "test szewTwin" },
      client: "ABC Engineering",
      globalOrigin: { x: 10, y: 10 },
      projectExtents: { low: { x: -300, y: -300, z: -20 }, high: { x: 500, y: 500, z: 400 } },
      guid: Guid.createValue(),
    };

    const iVault = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("IVault", "TestSnapshot.dtw"), args);
    assert.equal(iVault.iVaultId, args.guid);
    assert.equal(iVault.rootSubject.name, args.rootSubject.name);
    assert.equal(iVault.rootSubject.description, args.rootSubject.description);
    assert.equal(iVault.projectExtents.low.x, args.projectExtents.low.x);
    assert.equal(iVault.projectExtents.low.y, args.projectExtents.low.y);
    assert.equal(iVault.projectExtents.low.z, args.projectExtents.low.z);
    assert.equal(iVault.globalOrigin.x, args.globalOrigin.x);
    assert.equal(iVault.globalOrigin.y, args.globalOrigin.y);
    assert.equal(iVault.globalOrigin.z, 0);

    const client = iVault.queryFilePropertyString({ name: "Client", namespace: "bld_Db" });
    assert.equal(client, args.client, "query Client property");

    const dbguid = iVault.queryFilePropertyBlob({ name: "DbGuid", namespace: "be_Db" });
    assert.equal(dbguid!.byteLength, 16, "query guid property");

    const myPropsStr: FilePropertyProps = { name: "MyProp", namespace: "test1", id: 1, subId: 1 };
    const myStrVal = "this is a test";
    const myPropsBlob: FilePropertyProps = { name: "MyBlob", namespace: "test1", id: 10 };
    const testRange = new Uint8Array(500);
    testRange.fill(11);
    withEditTxn(iVault, (txn) => {
      txn.saveFileProperty(myPropsStr, myStrVal);
      const readFromDb = iVault.queryFilePropertyString(myPropsStr);
      assert.equal(readFromDb, myStrVal, "query string after save");

      txn.saveFileProperty(myPropsBlob, undefined, testRange);
      const blobFromDb = iVault.queryFilePropertyBlob(myPropsBlob);
      assert.deepEqual(blobFromDb, testRange, "query blob after save");

      let next = iVault.queryNextAvailableFileProperty(myPropsBlob);
      assert.equal(11, next, "queryNextAvailableFileProperty blob");

      next = iVault.queryNextAvailableFileProperty(myPropsStr);
      assert.equal(2, next, "queryNextAvailableFileProperty str");
      txn.deleteFileProperty(myPropsStr);
      assert.isUndefined(iVault.queryFilePropertyString(myPropsStr), "property was deleted");
      next = iVault.queryNextAvailableFileProperty(myPropsStr);
      assert.equal(0, next, "queryNextAvailableFileProperty, should return 0 when none present");
    });

    const testLocal = "TestLocal";
    const testValue = "this is a test";
    const nativeDb = iVault[_nativeDb];
    assert.isUndefined(nativeDb.queryLocalValue(testLocal));
    nativeDb.saveLocalValue(testLocal, testValue);
    assert.equal(nativeDb.queryLocalValue(testLocal), testValue);

    iVault.close();
  });

  it("should be able to create a snapshot IVault and set geolocation by GCS", async () => {
    const args = {
      rootSubject: { name: "TestSubject", description: "test szewTwin" },
      client: "ABC Engineering",
      globalOrigin: { x: 10, y: 10 },
      projectExtents: { low: { x: -300, y: -300, z: -20 }, high: { x: 500, y: 500, z: 400 } },
      guid: Guid.createValue(),
    };

    const gcs = new GeographicCRS({
      horizontalCRS: {
        id: "10TM115-27",
        description: "",
        source: "Mentor Software Client",
        deprecated: false,
        datumId: "NAD27",
        unit: "Meter",
        projection: {
          method: "TransverseMercator",
          centralMeridian: -115,
          latitudeOfOrigin: 0,
          scaleFactor: 0.9992,
          falseEasting: 0.0,
          falseNorthing: 0.0,
        },
        extent: {
          southWest: { latitude: 48, longitude: -120.5 },
          northEast: { latitude: 84, longitude: -109.5 },
        },
      },
      verticalCRS: { id: "GEOID" },
      additionalTransform: {
        helmert2DWithZOffset: {
          translationX: 10.0,
          translationY: 15.0,
          translationZ: 0.02,
          rotDeg: 1.2,
          scale: 1.0001,
        },
      },
    });

    const testFile = IVaultTestUtils.prepareOutputFile("IVault", "TestSnapshot2.dtw");
    const iVault = SnapshotDb.createEmpty(testFile, args);

    let eventListenedTo = false;
    const gcsListener = (previousGCS: GeographicCRS | undefined) => {
      assert.equal(previousGCS, undefined);
      assert.isTrue(iVault.geographicCoordinateSystem !== undefined);
      assert.isTrue(iVault.geographicCoordinateSystem!.equals(gcs));
      eventListenedTo = true;
    };
    iVault.onGeographicCoordinateSystemChanged.addListener(gcsListener);

    assert.isTrue(iVault.geographicCoordinateSystem === undefined);

    assert.isFalse(eventListenedTo);

    iVault.geographicCoordinateSystem = gcs;

    assert.isTrue(eventListenedTo);

    withEditTxn(iVault, (txn) => {
      txn.updateIVaultProps();
    });
    iVault.close();

    const iVault2 = SnapshotDb.openFile(testFile);

    assert.isTrue(iVault2.geographicCoordinateSystem !== undefined);

    // The reloaded gcs will be different as the datum definition will have been expanded
    assert.isFalse(iVault2.geographicCoordinateSystem!.equals(gcs));

    // But other properties will be identical
    assert.isTrue(iVault2.geographicCoordinateSystem !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.verticalCRS !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.verticalCRS!.equals(gcs.verticalCRS!));
    assert.isTrue(iVault2.geographicCoordinateSystem!.additionalTransform !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.additionalTransform!.equals(gcs.additionalTransform!));
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.projection !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.projection!.equals(gcs.horizontalCRS!.projection!));
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.id !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.id === gcs.horizontalCRS!.id!);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.extent !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.extent!.equals(gcs.horizontalCRS!.extent!));

    // The following were not in initial definition but were completed after storage.
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.datum !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.datum!.additionalTransformPaths !== undefined);
    assert.isTrue(iVault2.geographicCoordinateSystem!.horizontalCRS!.datum!.additionalTransformPaths!.length >= 0);

    // When a gcs is present then the ECEF is automatically defined.
    assert.isTrue(iVault2.ecefLocation !== undefined);

    iVault2.close();
  });

  describe("async coordinate conversions", () => {
    it("should output same number of points as input", async () => {
      const iVaultCoords: Point3d[] = [];
      const geoCoords: Point3d[] = [];
      for (let numPts = 0; numPts < 3; numPts++) {
        const geoResponse = await ivault5.getGeoCoordinatesFromIVaultCoordinates({ target: "WGS84", iVaultCoords });
        expect(geoResponse.geoCoords.length).to.equal(numPts);

        const iVaultResponse = await ivault5.getIVaultCoordinatesFromGeoCoordinates({ source: "WGS84", geoCoords });
        expect(iVaultResponse.iVaultCoords.length).to.equal(numPts);

        iVaultCoords.push(new Point3d());
        geoCoords.push(new Point3d());
      }
    });

    it("should always have fromCache = 0", async () => {
      const iVaultCoords: Point3d[] = [];
      const geoCoords: Point3d[] = [];
      for (let numPts = 0; numPts < 3; numPts++) {
        const geoResponse = await ivault5.getGeoCoordinatesFromIVaultCoordinates({ target: "WGS84", iVaultCoords });
        expect(geoResponse.fromCache).to.equal(0);

        const iVaultResponse = await ivault5.getIVaultCoordinatesFromGeoCoordinates({ source: "WGS84", geoCoords });
        expect(iVaultResponse.iVaultCoords.length).to.equal(numPts);
        expect(iVaultResponse.fromCache).to.equal(0);

        iVaultCoords.push(new Point3d());
        geoCoords.push(new Point3d());
      }
    });
  });

  if (!ProcessDetector.isIOSAppBackend) {
    it("should be able to reproject with iVault coordinates to or from any other GeographicCRS", async () => {
      const convertTest = async (fileName: string, fileGCS: GeographicCRSProps, datum: string | GeographicCRSProps, inputCoord: XYZProps, outputCoord: PointWithStatus) => {

        const args = {
          rootSubject: { name: "TestSubject", description: "test project" },
          client: "ABC Engineering",
          globalOrigin: { x: 0.0, y: 0.0 },
          projectExtents: { low: { x: -300, y: -300, z: -20 }, high: { x: 500, y: 500, z: 400 } },
          guid: Guid.createValue(),
        };

        let datumOrGCS: string;
        if (typeof datum === "object")
          datumOrGCS = JSON.stringify(datum);
        else
          datumOrGCS = datum;

        const testFile = IVaultTestUtils.prepareOutputFile("IVault", fileName);
        const iVault = SnapshotDb.createEmpty(testFile, args);

        withEditTxn(iVault, (txn) => {
          iVault.setGeographicCoordinateSystem(fileGCS);
          txn.updateIVaultProps();
        });

        const testPoint1: XYZProps[] = [];
        testPoint1.push(inputCoord);
        const requestProps1: GeoCoordinatesRequestProps = { target: datumOrGCS, iVaultCoords: testPoint1 };
        const response1 = await iVault.getGeoCoordinatesFromIVaultCoordinates(requestProps1);

        expect(response1.geoCoords[0].s === outputCoord.s).to.be.true;

        // If success or warning we compare result
        if (outputCoord.s === GeoCoordStatus.Success || outputCoord.s === GeoCoordStatus.OutOfUsefulRange) {

          const expectedPt1 = Point3d.fromJSON(outputCoord.p);
          const outPt1 = Point3d.fromJSON(response1.geoCoords[0].p);

          expect(Geometry.isSamePoint3dXY(expectedPt1, outPt1, 0.001)).to.be.true;
          expect(Math.abs(expectedPt1.z - outPt1.z) < 0.0001).to.be.true;

          // No point testing reversal when Out of useful range since reversibility is doubtful
          if (outputCoord.s !== GeoCoordStatus.OutOfUsefulRange) {
            const testPoint2: XYZProps[] = [];
            testPoint2.push(outputCoord.p);
            const requestProps2: IVaultCoordinatesRequestProps = { source: datumOrGCS, geoCoords: testPoint2 };
            const response2 = await iVault.getIVaultCoordinatesFromGeoCoordinates(requestProps2);

            const expectedPt2 = Point3d.fromJSON(inputCoord);
            const outPt2 = Point3d.fromJSON(response2.iVaultCoords[0].p);

            expect(expectedPt2.distanceXY(outPt2) < 0.001).to.be.true;
            expect(Math.abs(expectedPt2.z - outPt2.z) < 0.001).to.be.true;
          }
        }

        iVault.close();
      };

      const EWRGCS: GeographicCRSProps = {
        horizontalCRS: {
          id: "EPSG:27700",
          description: "OSGB 1936 / British National Grid",
          source: "EPSG V6 [Large and medium scale topographic mapping and engin]",
          datumId: "EPSG:6277",
          datum: {
            id: "EPSG:6277",
            description: "OSGB36 - Use OSGB-7P-2. Consider OSGB/OSTN15 instead",
            deprecated: true,
            source: "EPSG V6.12 operation EPSG:1314 [EPSG]",
            ellipsoidId: "EPSG:7001",
            ellipsoid: {
              equatorialRadius: 6377563.396,
              polarRadius: 6356256.909237,
              id: "EPSG:7001",
              description: "Airy 1830",
              source: "EPSG, Version 6 [EPSG]",
            },
            transforms: [
              {
                method: "PositionalVector",
                sourceEllipsoid: {
                  equatorialRadius: 6377563.396,
                  polarRadius: 6356256.909237,
                  id: "EPSG:7001",
                },
                targetEllipsoid: {
                  equatorialRadius: 6378137,
                  polarRadius: 6356752.3142,
                  id: "WGS84",
                },
                positionalVector: {
                  delta: {
                    x: 446.448,
                    y: -125.157,
                    z: 542.06,
                  },
                  rotation: {
                    x: 0.15,
                    y: 0.247,
                    z: 0.842,
                  },
                  scalePPM: -20.489,
                },
              }],
          },
          unit: "Meter",
          projection: {
            method: "TransverseMercator",
            falseEasting: 400000,
            falseNorthing: -100000,
            centralMeridian: -2,
            latitudeOfOrigin: 49,
            scaleFactor: 0.999601272737422,
          },
          extent: {
            southWest: {
              latitude: 49.96,
              longitude: -7.56,
            },
            northEast: {
              latitude: 60.84,
              longitude: 1.78,
            },
          },
        },
        verticalCRS: {
          id: "ELLIPSOID",
        },
        additionalTransform: {
          helmert2DWithZOffset: {
            translationX: 284597.3343,
            translationY: 79859.4651,
            translationZ: 0,
            rotDeg: 0.5263624458992088,
            scale: 0.9996703340508721,
          },
        },
      };

      await convertTest("ExtonCampus1.dtw", { horizontalCRS: { id: "EPSG:2272" }, verticalCRS: { id: "NAVD88" } }, "WGS84", { x: 775970.3155166894, y: 83323.24543981979, z: 130.74977547686285 }, { p: { x: -75.68712011112366, y: 40.06524845273591, z: 95.9769083 }, s: GeoCoordStatus.Success });

      await convertTest("UTM83-10-NGVD29-10.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NAVD88" } }, { horizontalCRS: { id: "UTM27-10" }, verticalCRS: { id: "NGVD29" } }, { x: 548296.472, y: 4179414.470, z: 0.8457 }, { p: { x: 548392.9689991799, y: 4179217.683834238, z: -0.0006774162750405877 }, s: GeoCoordStatus.Success });

      await convertTest("BritishNatGrid-EllipsoidHelmert1.dtw", EWRGCS, "WGS84", { x: 199247.08883859176, y: 150141.68625139236, z: 0.0 }, { p: { x: -0.80184489371471, y: 51.978341907041205, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("BritishNatGrid-Ellipsoid1.dtw", { horizontalCRS: { id: "BritishNatGrid" }, verticalCRS: { id: "ELLIPSOID" } }, "", { x: 170370.718, y: 11572.405, z: 0.0 }, { p: { x: -5.2020119082059511, y: 49.959453295440234, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("BritishNatGrid-Ellipsoid2.dtw", { horizontalCRS: { id: "BritishNatGrid" }, verticalCRS: { id: "ELLIPSOID" } }, "ETRF89", { x: 170370.718, y: 11572.405, z: 0.0 }, { p: { x: -5.2030365061523707, y: 49.960007477936202, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("BritishNatGrid-Ellipsoid3.dtw", { horizontalCRS: { id: "BritishNatGrid" }, verticalCRS: { id: "ELLIPSOID" } }, "OSGB", { x: 170370.718, y: 11572.405, z: 0.0 }, { p: { x: -5.2020119082059511, y: 49.959453295440234, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("GermanyDHDN-3-Ellipsoid1.dtw", { horizontalCRS: { id: "DHDN/3.GK3d-4/EN" }, verticalCRS: { id: "ELLIPSOID" } }, "", { x: 4360857.005, y: 5606083.067, z: 0.0 }, { p: { x: 10.035413954488630, y: 50.575070810112159, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("GermanyDHDN-3-Ellipsoid2.dtw", { horizontalCRS: { id: "DHDN/3.GK3d-4/EN" }, verticalCRS: { id: "ELLIPSOID" } }, "DHDN/3", { x: 4360857.005, y: 5606083.067, z: 0.0 }, { p: { x: 10.035413954488630, y: 50.575070810112159, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("GermanyDHDN-3-Ellipsoid3.dtw", { horizontalCRS: { id: "DHDN/3.GK3d-4/EN" }, verticalCRS: { id: "ELLIPSOID" } }, "WGS84", { x: 4360857.005, y: 5606083.067, z: 0.0 }, { p: { x: 10.034215937440818, y: 50.573862480894853, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-1.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, "", { x: 632748.112, y: 4263868.307, z: 0.0 }, { p: { x: -121.47738265889652, y: 38.513305313793019, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-2.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, "NAD83", { x: 632748.112, y: 4263868.307, z: 0.0 }, { p: { x: -121.47738265889652, y: 38.513305313793019, z: -30.12668428839329 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-3.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, "WGS84", { x: 632748.112, y: 4263868.307, z: 0.0 }, { p: { x: -121.47738265889652, y: 38.513305313793019, z: -30.12668428839329 }, s: GeoCoordStatus.Success });
      await convertTest("UTM27-10-Ellipsoid1.dtw", { horizontalCRS: { id: "UTM27-10" }, verticalCRS: { id: "ELLIPSOID" } }, "", { x: 623075.328, y: 4265650.532, z: 0.0 }, { p: { x: -121.58798236995744, y: 38.532616292207997, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("UTM27-10-Ellipsoid2.dtw", { horizontalCRS: { id: "UTM27-10" }, verticalCRS: { id: "ELLIPSOID" } }, "NAD83", { x: 623075.328, y: 4265650.532, z: 0.0 }, { p: { x: -121.58905088839697, y: 38.532522753851708, z: 0.0 }, s: GeoCoordStatus.Success });

      await convertTest("UTM83-10-NGVD29-4.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, { horizontalCRS: { id: "LL84" }, verticalCRS: { id: "ELLIPSOID" } }, { x: 632748.112, y: 4263868.307, z: 0.0 }, { p: { x: -121.47738265889652, y: 38.513305313793019, z: -30.12668428839329 }, s: GeoCoordStatus.Success });

      await convertTest("UTM83-10-NGVD29-5.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, { horizontalCRS: { id: "LL84" }, verticalCRS: { id: "GEOID" } }, { x: 632748.112, y: 4263868.307, z: 0.0 }, { p: { x: -121.47738265889652, y: 38.513305313793019, z: 0.7621583779125531 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-6.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, { horizontalCRS: { id: "CA83-II" }, verticalCRS: { id: "NAVD88" } }, { x: 569024.940, y: 4386341.752, z: 0.0 }, { p: { x: 1983192.529823256, y: 717304.0311293667, z: 0.745910484422781 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-7.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, { horizontalCRS: { id: "CA83-II" }, verticalCRS: { id: "GEOID" } }, { x: 569024.940, y: 4386341.752, z: 0.0 }, { p: { x: 1983192.529823256, y: 717304.0311293667, z: 0.745910484422781 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-8.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, { horizontalCRS: { id: "CA83-II" }, verticalCRS: { id: "NGVD29" } }, { x: 569024.940, y: 4386341.752, z: 0.0 }, { p: { x: 1983192.529823256, y: 717304.0311293667, z: 0.0 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-9.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } }, { horizontalCRS: { epsg: 26942 }, verticalCRS: { id: "NAVD88" } }, { x: 569024.940, y: 4386341.752, z: 0.0 }, { p: { x: 1983192.529823256, y: 717304.0311293667, z: 0.745910484422781 }, s: GeoCoordStatus.Success });
      await convertTest("UTM83-10-NGVD29-10.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NAVD88" } }, { horizontalCRS: { id: "UTM27-10" }, verticalCRS: { id: "NGVD29" } }, { x: 548296.472, y: 4179414.470, z: 0.8457 }, { p: { x: 548392.9689991799, y: 4179217.683834238, z: -0.0006774162750405877 }, s: GeoCoordStatus.Success });

      await convertTest("BritishNatGrid-Ellipsoid4.dtw", { horizontalCRS: { id: "BritishNatGrid" }, verticalCRS: { id: "ELLIPSOID" } }, { horizontalCRS: { id: "HS2_Snake_2015" }, verticalCRS: { id: "GEOID" } }, { x: 473327.251, y: 257049.636, z: 0.0 }, { p: { x: 237732.58101946692, y: 364048.01547843055, z: -47.874172425966336 }, s: GeoCoordStatus.Success });

      await convertTest("BritishNatGrid-Ellipsoid5.dtw", { horizontalCRS: { id: "BritishNatGrid" }, verticalCRS: { id: "ELLIPSOID" } },
        {
          horizontalCRS: {
            id: "HS2-MOCK",
            description: "USES CUSTOM DATUM",
            source: "Test",
            deprecated: false,
            datumId: "HS2SD_2015",
            unit: "Meter",
            projection: {
              method: "TransverseMercator",
              centralMeridian: -1.5,
              latitudeOfOrigin: 52.30,
              scaleFactor: 1.0,
              falseEasting: 198873.0046,
              falseNorthing: 375064.3871,
            },
          },
          verticalCRS: {
            id: "GEOID",
          },
        }
        , { x: 473327.251, y: 257049.636, z: 0.0 }, { p: { x: 237732.58101952373, y: 364048.01548327296, z: -47.874172425966336 }, s: GeoCoordStatus.Success });

      await convertTest("BritishNatGrid-Ellipsoid.dtw", { horizontalCRS: { id: "BritishNatGrid" }, verticalCRS: { id: "ELLIPSOID" } }, { horizontalCRS: { id: "OSGB-GPS-2015" }, verticalCRS: { id: "GEOID" } }, { x: 473327.251, y: 257049.636, z: 0.0 }, { p: { x: 473325.6830048648, y: 257049.77062273448, z: -47.87643904264457 }, s: GeoCoordStatus.Success });

      await convertTest("UTM83-10-NGVD29-12.dtw", { horizontalCRS: { id: "UTM83-10" }, verticalCRS: { id: "NGVD29" } },
        {
          horizontalCRS: {
            id: "California2",
            description: "USES CUSTOM DATUM",
            source: "Test",
            deprecated: false,
            datumId: "NAD83",
            unit: "Meter",
            projection: {
              method: "LambertConformalConicTwoParallels",
              longitudeOfOrigin: -122,
              latitudeOfOrigin: 37.66666666667,
              standardParallel1: 39.833333333333336,
              standardParallel2: 38.333333333333336,
              falseEasting: 2000000.0,
              falseNorthing: 500000.0,
            },
            extent: {
              southWest: {
                latitude: 35,
                longitude: -125,
              },
              northEast: {
                latitude: 39.1,
                longitude: -120.45,
              },
            },
          },
          verticalCRS: {
            id: "GEOID",
          },
        }, { x: 569024.940, y: 4386341.752, z: 0.0 }, { p: { x: 1983192.529823256, y: 717304.0311293667, z: 0.745910484422781 }, s: GeoCoordStatus.Success });

      // Do some test that return errors
      // First test uses one GCS in Eastern USA and the other in UK. This will produce a hard domain error
      await convertTest("Error1.dtw", { horizontalCRS: { id: "UTM84-17N" }, verticalCRS: { id: "ELLIPSOID" } }, { horizontalCRS: { id: "OSGB-GPS-2015" }, verticalCRS: { id: "GEOID" } }, { x: 1473327.251, y: 1257049.636, z: 0.0 }, { p: { x: 473325.6830048648, y: 257049.77062273448, z: -47.87643904264457 }, s: GeoCoordStatus.OutOfMathematicalDomain });

      // This test performs conversion in a region outside normal use of GCS but still mathematically valid (soft domain error)
      await convertTest("Error2.dtw", { horizontalCRS: { id: "DanishS34-S99" }, verticalCRS: { id: "ELLIPSOID" } }, "", { x: -6618.5925260757449, y: 36058.097489683532, z: 0.0 }, { p: { x: 13.53250346041385, y: 54.71216475341563, z: 0.0 }, s: GeoCoordStatus.OutOfUsefulRange });
      // -6618.5925260757449, 36058.097489683532
      // { x: -221748.034, y: -10012.784, z: 0.0 } { p: { x: 10.36481105, y: 54.38462506, z: 0.0 }
      // This test makes use of a GCS using a grid file that does not even exist and will return a datum conversion error.
      const userGCSWithinexistentGridFile: GeographicCRSProps = {
        horizontalCRS: {
          id: "User1",
          datumId: "UserDatum1",
          datum: {
            id: "UserDatum1",
            ellipsoidId: "CLRK66",
            transforms: [
              {
                method: "GridFiles",
                sourceEllipsoid: {
                  id: "CLRK66",
                  equatorialRadius: 6378160.0,
                  polarRadius: 6356774.719195306,
                },
                targetEllipsoid: {
                  id: "WGS84",
                  equatorialRadius: 6378160.0,
                  polarRadius: 6356774.719195306,
                },
                gridFile: {
                  files: [
                    { fileName: "./user/inexistent.gdc", format: "NTv2", direction: "Direct" },
                  ],
                },
              },
            ],
          },
          unit: "Meter",
          projection: {
            method: "TransverseMercator",
            centralMeridian: -115,
            latitudeOfOrigin: 0,
            scaleFactor: 0.9992,
            falseEasting: 1.0,
            falseNorthing: 2.0,
          },
          extent: {
            southWest: { latitude: 48, longitude: -120.5 },
            northEast: { latitude: 84, longitude: -109.5 },
          },
        }, verticalCRS: { id: "ELLIPSOID" },
      };

      await convertTest("Error3.dtw", userGCSWithinexistentGridFile, "WGS84", { x: 1473327.251, y: 1257049.636, z: 0.0 }, { p: { x: 473325.6830048648, y: 257049.77062273448, z: -47.87643904264457 }, s: GeoCoordStatus.NoDatumConverter });

      // The model GCS is not valid
      await convertTest("Error4.dtw", { horizontalCRS: { id: "badfood" }, verticalCRS: { id: "ELLIPSOID" } }, { horizontalCRS: { id: "OSGB-GPS-2015" }, verticalCRS: { id: "GEOID" } }, { x: 1473327.251, y: 1257049.636, z: 0.0 }, { p: { x: 473325.6830048648, y: 257049.77062273448, z: -47.87643904264457 }, s: GeoCoordStatus.NoGCSDefined });

      // The given GCS is not valid
      await convertTest("Error5.dtw", { horizontalCRS: { id: "UTM84-17N" }, verticalCRS: { id: "ELLIPSOID" } }, { horizontalCRS: { id: "badfood" }, verticalCRS: { id: "GEOID" } }, { x: 1473327.251, y: 1257049.636, z: 0.0 }, { p: { x: 473325.6830048648, y: 257049.77062273448, z: -47.87643904264457 }, s: GeoCoordStatus.NoGCSDefined });

    });
  }

  it("should be able to create a snapshot IVault and set geolocation by ECEF", async () => {
    const args = {
      rootSubject: { name: "TestSubject", description: "test szewTwin" },
      client: "ABC Engineering",
      globalOrigin: { x: 10, y: 10 },
      projectExtents: { low: { x: -300, y: -300, z: -20 }, high: { x: 500, y: 500, z: 400 } },
      guid: Guid.createValue(),
    };

    const ecef = new EcefLocation({
      origin: [42, 21, 0],
      orientation: { yaw: 1, pitch: 1, roll: -1 },
    });

    const testFile = IVaultTestUtils.prepareOutputFile("IVault", "TestSnapshot3.dtw");
    const iVault = SnapshotDb.createEmpty(testFile, args);

    assert.isTrue(iVault.ecefLocation === undefined);

    iVault.ecefLocation = ecef;

    withEditTxn(iVault, (txn) => {
      txn.updateIVaultProps();
    });
    iVault.close();

    const iVault2 = SnapshotDb.openFile(testFile);

    assert.isTrue(iVault2.ecefLocation !== undefined);
    assert.isTrue(iVault2.ecefLocation!.isAlmostEqual(ecef));

    iVault2.close();
  });

  it("should be able to create a snapshot IVault and set geolocation by ECEF with 0,0,0 rotation", async () => {
    const args = {
      rootSubject: { name: "TestSubject", description: "test szewTwin" },
      client: "ABC Engineering",
      globalOrigin: { x: 10, y: 10 },
      projectExtents: { low: { x: -300, y: -300, z: -20 }, high: { x: 500, y: 500, z: 400 } },
      guid: Guid.createValue(),
    };

    const ecef = new EcefLocation({
      origin: [42, 21, 0],
      orientation: { yaw: 0, pitch: 0, roll: 0 },
    });

    const testFile = IVaultTestUtils.prepareOutputFile("IVault", "TestSnapshot3_000.dtw");
    const iVault = SnapshotDb.createEmpty(testFile, args);

    assert.isTrue(iVault.ecefLocation === undefined);

    iVault.ecefLocation = ecef;

    withEditTxn(iVault, (txn) => {
      txn.updateIVaultProps();
    });
    iVault.close();

    const iVault2 = SnapshotDb.openFile(testFile);

    assert.isTrue(iVault2.ecefLocation !== undefined);
    assert.isTrue(iVault2.ecefLocation!.isAlmostEqual(ecef));

    iVault2.close();
  });

  it("presence of a GCS imposes the ecef value", async () => {
    const args = {
      rootSubject: { name: "TestSubject", description: "test szewTwin" },
      client: "ABC Engineering",
      globalOrigin: { x: 10, y: 10 },
      projectExtents: { low: { x: -300, y: -300, z: -20 }, high: { x: 500, y: 500, z: 400 } },
      guid: Guid.createValue(),
    };

    const gcs = new GeographicCRS({
      horizontalCRS: {
        id: "10TM115-27",
        description: "",
        source: "Mentor Software Client",
        deprecated: false,
        datumId: "NAD27",
        unit: "Meter",
        projection: {
          method: "TransverseMercator",
          centralMeridian: -115,
          latitudeOfOrigin: 0,
          scaleFactor: 0.9992,
          falseEasting: 0.0,
          falseNorthing: 0.0,
        },
        extent: {
          southWest: { latitude: 48, longitude: -120.5 },
          northEast: { latitude: 84, longitude: -109.5 },
        },
      },
      verticalCRS: { id: "GEOID" },
      additionalTransform: {
        helmert2DWithZOffset: {
          translationX: 10.0,
          translationY: 15.0,
          translationZ: 0.02,
          rotDeg: 1.2,
          scale: 1.0001,
        },
      },
    });

    const ecef = new EcefLocation({
      origin: [42, 21, 0],
      orientation: { yaw: 1, pitch: 1, roll: -1 },
    });

    const testFile = IVaultTestUtils.prepareOutputFile("IVault", "TestSnapshot4.dtw");

    const iVault = SnapshotDb.createEmpty(testFile, args);

    iVault.ecefLocation = ecef;

    withEditTxn(iVault, (txn) => {
      txn.updateIVaultProps();
    });
    iVault.close();

    const iVault2 = SnapshotDb.openForApplyChangesets(testFile);

    assert.isTrue(iVault2.ecefLocation !== undefined);
    assert.isTrue(iVault2.ecefLocation!.isAlmostEqual(ecef));

    assert.isTrue(iVault2.geographicCoordinateSystem === undefined);

    iVault2.geographicCoordinateSystem = gcs;

    withEditTxn(iVault2, (txn) => {
      txn.updateIVaultProps();
    });
    iVault2.close();

    const iVault3 = SnapshotDb.openFile(testFile);

    assert.isTrue(iVault3.geographicCoordinateSystem !== undefined);

    // When a gcs is present then ecef value is imposed by the gcs disregarding previous value.
    assert.isTrue(iVault3.ecefLocation !== undefined);
    assert.isFalse(iVault3.ecefLocation!.isAlmostEqual(ecef));

    iVault3.close();
  });

  it("should be able to open checkpoints for RPC", async () => {
    const changeset: ChangesetIdWithIndex = { id: "fakeChangeSetId", index: 10 };
    const szewTwinId = "fakeIVaultId";
    const iVaultId = "fakeIVaultId";
    const cloudContainer = { accessToken: "sas" };
    const fakeSnapshotDb: any =
    {
      cloudContainer,
      isReadonly: () => true,
      isOpen: () => true,
      getIVaultId: () => iVaultId,
      getSZEWTwinId: () => szewTwinId,
      getCurrentChangeset: () => changeset,
      hasUnsavedChanges: () => false,
      setIVaultDb: () => { },
      closeFile: () => { },
      clearDMDbCache: () => { },
    };

    const errorLogStub = sinon.stub(Logger, "logError").callsFake(() => { });
    const infoLogStub = sinon.stub(Logger, "logInfo").callsFake(() => { });

    // Mock iVaultHub
    const mockCheckpointV2: V2CheckpointAccessProps = {
      accountName: "testAccount",
      containerId: "ivaultblocks-123",
      sasToken: "testSAS",
      dbName: "testDb",
      storageType: "azure?sas=1",
    };

    sinon.stub(IVaultHost, _hubAccess).get(() => HubMock);
    sinon.stub(V2CheckpointManager, "attach").callsFake(async () => {
      return { dbName: "fakeDb", container: { accessToken: "sas" } as any };
    });
    const queryStub = sinon.stub(IVaultHost[_hubAccess], "queryV2Checkpoint").callsFake(async () => mockCheckpointV2);

    const openBldDbStub = sinon.stub(SnapshotDb, "openBldDb").returns(fakeSnapshotDb);
    sinon.stub(IVaultDb.prototype, "initializeIVaultDb" as any);
    sinon.stub(IVaultDb.prototype, "loadIVaultSettings" as any);

    const accessToken = "token";
    const checkpoint = await SnapshotDb.openCheckpointFromRpc({ accessToken, szewTwinId, iVaultId, changeset });
    expect(openBldDbStub.calledOnce).to.be.true;
    expect(openBldDbStub.firstCall.firstArg.path).to.equal("fakeDb");

    const props = checkpoint.getRpcProps();
    assert.equal(props.iVaultId, iVaultId);
    assert.equal(props.szewTwinId, szewTwinId);
    assert.equal(props.changeset?.id, changeset.id);
    assert.equal(errorLogStub.callCount, 1);
    assert.include(errorLogStub.args[0][1], "attached with timestamp that expires before");

    errorLogStub.resetHistory();
    expect(cloudContainer.accessToken).equal("sas");
    await checkpoint.refreshContainerForRpc(accessToken);
    expect(cloudContainer.accessToken).equal("testSAS");

    assert.equal(errorLogStub.callCount, 1);
    assert.include(errorLogStub.args[0][1], "attached with timestamp that expires before");
    assert.equal(infoLogStub.callCount, 2);
    assert.include(infoLogStub.args[0][1], "attempting to refresh");
    assert.include(infoLogStub.args[1][1], "refreshed checkpoint");

    errorLogStub.resetHistory();
    queryStub.callsFake(async () => {
      throw new Error("no checkpoint");
    });
    await expect(checkpoint.refreshContainerForRpc(accessToken)).to.eventually.be.rejectedWith("no checkpoint");

    checkpoint.close();
  });

  it("should throw for missing/invalid checkpoint in hub", async () => {
    process.env.CHECKPOINT_CACHE_DIR = "/foo/";
    sinon.stub(IVaultHost, _hubAccess).get(() => HubMock);
    sinon.stub(IVaultHost[_hubAccess], "queryV2Checkpoint").callsFake(async () => undefined);

    const accessToken = "token";
    const error = await getIVaultError(SnapshotDb.openCheckpointFromRpc({ accessToken, szewTwinId: Guid.createValue(), iVaultId: Guid.createValue(), changeset: IVaultTestUtils.generateChangeSetId() }));
    expectIVaultError(IVaultStatus.NotFound, error);
  });

  it("attempting to re-attach a non-checkpoint snapshot should be a no-op", async () => {
    process.env.CHECKPOINT_CACHE_DIR = "/foo/";
    const accessToken = "token";
    await ivault1.refreshContainerForRpc(accessToken);
  });

  function hasClassView(db: IVaultDb, name: string): boolean {
    try {
      return db.withSqliteStatement(`SELECT DMInstanceId FROM [${name}]`, (): boolean => true, false);
    } catch {
      return false;
    }
  }

  it("Check busyTimeout option", () => {
    const standaloneFile = IVaultTestUtils.prepareOutputFile("IVault", "StandaloneReadWrite.dtw");
    const tryOpen = (fileName: string, options?: SnapshotDbOpenArgs) => {
      const start = performance.now();
      let didThrow = false;
      try {
        StandaloneDb.openFile(fileName, OpenMode.ReadWrite, options);
      } catch (e: any) {
        assert.strictEqual(e.errorNumber, DbResult.BE_SQLITE_BUSY, "Expect error 'Db is busy'");
        didThrow = true;
      }
      assert.isTrue(didThrow);
      return performance.now() - start;
    };
    const seconds = (s: number) => s * 1000;

    const db = StandaloneDb.createEmpty(standaloneFile, { rootSubject: { name: "Standalone" } });
    const txn = new EditTxn(db, "busy timeout test");
    txn.start();
    // lock db so another connection cannot write to it.
    txn.saveFileProperty({ name: "test", namespace: "test" }, "");

    assert.isAtMost(tryOpen(standaloneFile, { busyTimeout: seconds(0) }), seconds(1), "open should fail with busy error instantly");
    assert.isAtLeast(tryOpen(standaloneFile, { busyTimeout: seconds(1) }), seconds(1), "open should fail with atleast 1 sec delay due to retry");
    assert.isAtLeast(tryOpen(standaloneFile, { busyTimeout: seconds(2) }), seconds(2), "open should fail with atleast 2 sec delay due to retry");
    assert.isAtLeast(tryOpen(standaloneFile, { busyTimeout: seconds(3) }), seconds(3), "open should fail with atleast 3 sec delay due to retry");

    txn.end("abandon");
    db.close();
  });

  it("Cache cleared on abandonChanges", () => {
    const standaloneFile = IVaultTestUtils.prepareOutputFile("IVault", "StandaloneReadWrite.dtw");
    const db = StandaloneDb.createEmpty(standaloneFile, { rootSubject: { name: "Standalone" } });
    const txn = new EditTxn(db, "cache cleared on abandonChanges");
    txn.start();

    const code = Code.createEmpty();
    code.value = "foo";
    const props: TypeDefinitionElementProps = {
      classFullName: GenericGraphicalType2d.classFullName,
      model: IVault.dictionaryId,
      code,
    };
    const id = txn.insertElement(props);
    const element1 = db.elements.getElementProps(id);
    txn.end("abandon");

    code.value = "bar";
    const props2: TypeDefinitionElementProps = {
      classFullName: GenericGraphicalType2d.classFullName,
      model: IVault.dictionaryId,
      code,
    };
    const retryTxn = new EditTxn(db, "cache cleared on abandonChanges retry");
    retryTxn.start();
    const id2 = retryTxn.insertElement(props2);
    expect(id2).to.equal(id);
    const element2 = db.elements.getElementProps(id2);
    expect(element2).to.not.equal(element1);

    // Make sure that the statement caches are not cleared
    expect((db as any)._sqliteStatementCache.size).to.be.greaterThan(0);
    expect((db as any)._statementCache.size).to.be.greaterThan(0);

    retryTxn.end("abandon");
    db.close();
  });

  it("Only instance caches should be cleared with clearCaches instanceCachesOnly parameter", () => {
    const standaloneFile = IVaultTestUtils.prepareOutputFile("IVault", "StandaloneReadWrite.dtw");
    const db = StandaloneDb.createEmpty(standaloneFile, { rootSubject: { name: "Standalone" } });
    const txn = new EditTxn(db, "clearCaches instanceCachesOnly");
    txn.start();

    const code = Code.createEmpty();
    code.value = "foo";
    const props: TypeDefinitionElementProps = {
      classFullName: GenericGraphicalType2d.classFullName,
      model: IVault.dictionaryId,
      code,
    };
    const id = txn.insertElement(props);
    db.elements.getElementProps(id);
    db.models.getModelProps(IVault.dictionaryId);

    expect(db.elements[_cache].size).to.be.greaterThan(0);
    expect(db.models[_cache].size).to.be.greaterThan(0);
    expect(db.elements[_instanceKeyCache].size).to.be.greaterThan(0);
    expect(db.models[_instanceKeyCache].size).to.be.greaterThan(0);

    db.clearCaches({ instanceCachesOnly: true });

    expect(db.elements[_cache].size).to.equal(0);
    expect(db.models[_cache].size).to.equal(0);
    expect(db.elements[_instanceKeyCache].size).to.equal(0);
    expect(db.models[_instanceKeyCache].size).to.equal(0);

    // Make sure that the statement caches are not cleared
    expect((db as any)._sqliteStatementCache.size).to.be.greaterThan(0);
    expect((db as any)._statementCache.size).to.be.greaterThan(0);

    txn.end("abandon");
    db.close();
  });

  it("Standalone iVault properties", () => {
    const standaloneRootSubjectName = "Standalone";
    const standaloneFile1 = IVaultTestUtils.prepareOutputFile("IVault", "Standalone1.dtw");
    const ecefLocation = new EcefLocation({ origin: [1, 2, 3], orientation: { yaw: 0, pitch: 0, roll: 0 } })
    const geographicCoordinateSystem = {
      horizontalCRS: { id: "10TM115-27" },
    }
    let standaloneDb1 = StandaloneDb.createEmpty(standaloneFile1, { rootSubject: { name: standaloneRootSubjectName }, ecefLocation, geographicCoordinateSystem });
    assert.isTrue(standaloneDb1.isStandaloneDb());
    assert.isTrue(standaloneDb1.isStandalone);
    assert.isFalse(standaloneDb1.isReadonly, "Expect standalone iVaults to be read-write during create");
    assert.equal(standaloneDb1.getBriefcaseId(), BriefcaseIdValue.Unassigned);
    assert.equal(standaloneDb1.pathName, standaloneFile1);
    assert.equal(standaloneDb1, StandaloneDb.tryFindByKey(standaloneDb1.key), "Should be in the list of open StandaloneDbs");
    assert.equal(standaloneDb1.elements.getRootSubject().code.value, standaloneRootSubjectName);
    assert.isTrue(standaloneDb1.isOpen);
    assert.isTrue(Guid.isV4Guid(standaloneDb1.iVaultId));
    assert.equal(standaloneDb1.szewTwinId, Guid.empty);
    assert.strictEqual("", standaloneDb1.changeset.id);
    assert.strictEqual(0, standaloneDb1.changeset.index);
    assert.deepEqual(standaloneDb1.ecefLocation?.origin, ecefLocation.origin, "standalone ecefLocation should be set");
    assert.strictEqual(standaloneDb1.geographicCoordinateSystem?.horizontalCRS?.id, "10TM115-27", "standalone coordinate system should be set");
    assert.equal(standaloneDb1.openMode, OpenMode.ReadWrite);
    standaloneDb1.close();
    assert.isFalse(standaloneDb1.isOpen);
    standaloneDb1.close(); // calling `close()` a second time is a no-op
    assert.isUndefined(StandaloneDb.tryFindByKey(standaloneDb1.key));
    standaloneDb1 = StandaloneDb.openFile(standaloneFile1);
    assert.equal(standaloneDb1, StandaloneDb.tryFindByKey(standaloneDb1.key));
    assert.isFalse(standaloneDb1.isReadonly, "By default, StandaloneDbs are opened read/write");
    standaloneDb1.close();
    assert.isUndefined(StandaloneDb.tryFindByKey(standaloneDb1.key));
  });

  it("Snapshot iVault properties", async () => {
    const snapshotRootSubjectName = "Snapshot";
    const snapshotFile1 = IVaultTestUtils.prepareOutputFile("IVault", "Snapshot1.dtw");
    const snapshotFile2 = IVaultTestUtils.prepareOutputFile("IVault", "Snapshot2.dtw");
    const snapshotFile3 = IVaultTestUtils.prepareOutputFile("IVault", "Snapshot3.dtw");
    const ivault = await generateTestSnapshot("test_for_snapshot.dtw", "test.dtw");
    const ecefLocation = new EcefLocation({ origin: [1, 2, 3], orientation: { yaw: 0, pitch: 0, roll: 0 } })
    const geographicCoordinateSystem = {
      horizontalCRS: { id: "10TM115-27" },
    }
    let snapshotDb1 = SnapshotDb.createEmpty(snapshotFile1, { rootSubject: { name: snapshotRootSubjectName }, createClassViews: true, ecefLocation, geographicCoordinateSystem });
    let snapshotDb2 = SnapshotDb.createFrom(snapshotDb1, snapshotFile2);
    let snapshotDb3 = SnapshotDb.createFrom(ivault, snapshotFile3, { createClassViews: true });
    assert.isTrue(snapshotDb1.isSnapshotDb());
    assert.isTrue(snapshotDb2.isSnapshotDb());
    assert.isTrue(snapshotDb3.isSnapshotDb());
    assert.isTrue(snapshotDb1.isSnapshot);
    assert.isTrue(snapshotDb2.isSnapshot);
    assert.isTrue(snapshotDb3.isSnapshot);
    assert.isFalse(snapshotDb1.isReadonly, "Expect snapshots to be read-write during create");
    assert.isFalse(snapshotDb2.isReadonly, "Expect snapshots to be read-write during create");
    assert.isFalse(snapshotDb3.isReadonly, "Expect snapshots to be read-write during create");
    assert.equal(snapshotDb1.getBriefcaseId(), BriefcaseIdValue.Unassigned);
    assert.equal(snapshotDb2.getBriefcaseId(), BriefcaseIdValue.Unassigned);
    assert.equal(snapshotDb3.getBriefcaseId(), BriefcaseIdValue.Unassigned);
    assert.equal(ivault.getBriefcaseId(), BriefcaseIdValue.Unassigned);
    assert.equal(snapshotDb1.pathName, snapshotFile1);
    assert.equal(snapshotDb2.pathName, snapshotFile2);
    assert.equal(snapshotDb3.pathName, snapshotFile3);
    assert.equal(snapshotDb1, SnapshotDb.tryFindByKey(snapshotDb1.key));
    assert.equal(snapshotDb2, SnapshotDb.tryFindByKey(snapshotDb2.key));
    assert.equal(snapshotDb3, SnapshotDb.tryFindByKey(snapshotDb3.key));
    const iVaultGuid1: GuidString = snapshotDb1.iVaultId;
    const iVaultGuid2: GuidString = snapshotDb2.iVaultId;
    const iVaultGuid3: GuidString = snapshotDb3.iVaultId;
    assert.notEqual(iVaultGuid1, iVaultGuid2, "Expect different iVault GUIDs for each snapshot");
    assert.notEqual(iVaultGuid2, iVaultGuid3, "Expect different iVault GUIDs for each snapshot");
    const rootSubjectName1 = snapshotDb1.elements.getRootSubject().code.value;
    const rootSubjectName2 = snapshotDb2.elements.getRootSubject().code.value;
    const rootSubjectName3 = snapshotDb3.elements.getRootSubject().code.value;
    const ivaultRootSubjectName = ivault.elements.getRootSubject().code.value;
    assert.equal(rootSubjectName1, snapshotRootSubjectName);
    assert.equal(rootSubjectName1, rootSubjectName2, "Expect a snapshot to maintain the root Subject name from its seed");
    assert.equal(rootSubjectName3, ivaultRootSubjectName, "Expect a snapshot to maintain the root Subject name from its seed");
    assert.isTrue(snapshotDb1.isOpen);
    assert.isTrue(snapshotDb2.isOpen);
    assert.isTrue(snapshotDb3.isOpen);
    assert.deepEqual(snapshotDb1.ecefLocation?.origin, ecefLocation.origin, "snapshot ecefLocation should be set");
    assert.strictEqual(snapshotDb1.geographicCoordinateSystem?.horizontalCRS?.id, "10TM115-27", "snapshot coordinate system should be set");
    snapshotDb1.close();
    snapshotDb2.close();
    snapshotDb3.close();
    assert.isFalse(snapshotDb1.isOpen);
    assert.isFalse(snapshotDb2.isOpen);
    assert.isFalse(snapshotDb3.isOpen);
    snapshotDb1.close(); // calling `close()` a second time is a no-op
    snapshotDb2.close(); // calling `close()` a second time is a no-op
    snapshotDb3.close(); // calling `close()` a second time is a no-op
    assert.isUndefined(SnapshotDb.tryFindByKey(snapshotDb1.key));
    assert.isUndefined(SnapshotDb.tryFindByKey(snapshotDb2.key));
    assert.isUndefined(SnapshotDb.tryFindByKey(snapshotDb3.key));
    snapshotDb1 = SnapshotDb.openFile(snapshotFile1);
    snapshotDb2 = SnapshotDb.openFile(snapshotFile2);
    snapshotDb3 = SnapshotDb.openFile(snapshotFile3);
    assert.equal(snapshotDb1, SnapshotDb.tryFindByKey(snapshotDb1.key));
    assert.equal(snapshotDb2, SnapshotDb.tryFindByKey(snapshotDb2.key));
    assert.equal(snapshotDb3, SnapshotDb.tryFindByKey(snapshotDb3.key));
    assert.equal(snapshotDb3, SnapshotDb.findByKey(snapshotDb3.key));
    assert.equal(snapshotDb3, IVaultDb.findByKey(snapshotDb3.key));
    assert.throws(() => BriefcaseDb.findByKey(snapshotDb1.key)); // lookup of key for SnapshotDb via BriefcaseDb should throw
    assert.throws(() => StandaloneDb.findByKey(snapshotDb1.key)); // likewise for StandaloneDb
    assert.isTrue(snapshotDb1.isReadonly, "Expect snapshots to be read-only after open");
    assert.isTrue(snapshotDb2.isReadonly, "Expect snapshots to be read-only after open");
    assert.isTrue(snapshotDb3.isReadonly, "Expect snapshots to be read-only after open");
    assert.isTrue(hasClassView(snapshotDb1, "bis.Element"));
    assert.isTrue(hasClassView(snapshotDb1, "bis.ElementAspect"));
    assert.isTrue(hasClassView(snapshotDb1, "bis.Model"));
    assert.isTrue(hasClassView(snapshotDb1, "bis.ElementRefersToElements"));
    assert.isFalse(hasClassView(snapshotDb2, "bis.Element"));
    assert.isTrue(hasClassView(snapshotDb3, "bis.Element"));

    ivault.close();
    snapshotDb1.close();
    snapshotDb2.close();
    snapshotDb3.close();

    assert.isUndefined(SnapshotDb.tryFindByKey(snapshotDb1.key));
    assert.isUndefined(SnapshotDb.tryFindByKey(snapshotDb2.key));
    assert.isUndefined(SnapshotDb.tryFindByKey(snapshotDb3.key));
  });

  it("upgrade the domain schema in a StandaloneDb", async () => {
    const testFileName = IVaultTestUtils.prepareOutputFile("UpgradeIVault", "testIvault.bim");
    const seedFileName = IVaultTestUtils.resolveAssetFile("testIvault.bim");
    IVaultJsFs.copySync(seedFileName, testFileName);

    let iVault = StandaloneDb.openFile(testFileName, OpenMode.ReadWrite);
    const beforeVersion = iVault.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(beforeVersion!, "= 1.0.0"));
    iVault.close();

    const schemaState: SchemaState = StandaloneDb.validateSchemas(testFileName, true);
    assert.strictEqual(schemaState, SchemaState.UpgradeRecommended);

    StandaloneDb.upgradeStandaloneSchemas(testFileName);

    iVault = StandaloneDb.openFile(testFileName, OpenMode.ReadWrite);
    const afterVersion = iVault.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(afterVersion!, ">= 1.0.10"));
    iVault.close();
  });

  it("Run plain SQL", () => {
    withEditTxn(ivault1, () => {
      ivault1.withPreparedSqliteStatement("CREATE TABLE Test(Id INTEGER PRIMARY KEY, Name TEXT NOT NULL, Code INTEGER)", (stmt: SqliteStatement) => {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      ivault1.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(?,?)", (stmt: SqliteStatement) => {
        stmt.bindValue(1, "Dummy 1");
        stmt.bindValue(2, 100);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      ivault1.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(?,?)", (stmt: SqliteStatement) => {
        stmt.bindValues(["Dummy 2", 200]);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      ivault1.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(:p1,:p2)", (stmt: SqliteStatement) => {
        stmt.bindValue(":p1", "Dummy 3");
        stmt.bindValue(":p2", 300);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      ivault1.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(:p1,:p2)", (stmt: SqliteStatement) => {
        stmt.bindValues({ ":p1": "Dummy 4", ":p2": 400 });
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });
    });

    ivault1.withPreparedSqliteStatement("SELECT Id,Name,Code FROM Test ORDER BY Id", (stmt: SqliteStatement) => {
      for (let i: number = 1; i <= 4; i++) {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
        assert.equal(stmt.getColumnCount(), 3);
        const val0: SqliteValue = stmt.getValue(0);
        assert.equal(val0.columnName, "Id");
        assert.equal(val0.type, SqliteValueType.Integer);
        assert.isFalse(val0.isNull);
        assert.equal(val0.getInteger(), i);

        const val1: SqliteValue = stmt.getValue(1);
        assert.equal(val1.columnName, "Name");
        assert.equal(val1.type, SqliteValueType.String);
        assert.isFalse(val1.isNull);
        assert.equal(val1.getString(), `Dummy ${i}`);

        const val2: SqliteValue = stmt.getValue(2);
        assert.equal(val2.columnName, "Code");
        assert.equal(val2.type, SqliteValueType.Integer);
        assert.isFalse(val2.isNull);
        assert.equal(val2.getInteger(), i * 100);

        const row: any = stmt.getRow();
        assert.equal(row.id, i);
        assert.equal(row.name, `Dummy ${i}`);
        assert.equal(row.code, i * 100);
      }
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });

    ivault1.withPreparedSqliteStatement("SELECT 1 FROM dm_CustomAttribute WHERE ContainerId=? AND Instance LIKE '<IsMixin%' COLLATE NOCASE", (stmt: SqliteStatement) => {
      stmt.bindValue(1, "0x1f");
      assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
    });
  });

  it("Run plain SQL against readonly connection", () => {
    let iVault = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("IVault", "sqlitesqlreadonlyconnection.dtw"), { rootSubject: { name: "test" } });
    const iVaultPath = iVault.pathName;
    iVault.close();
    iVault = SnapshotDb.openFile(iVaultPath);

    iVault.withPreparedSqliteStatement("SELECT Name,StrData FROM be_Prop WHERE Namespace='dm_Db'", (stmt: SqliteStatement) => {
      let rowCount: number = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        assert.equal(stmt.getColumnCount(), 2);
        const nameVal: SqliteValue = stmt.getValue(0);
        assert.equal(nameVal.columnName, "Name");
        assert.equal(nameVal.type, SqliteValueType.String);
        assert.isFalse(nameVal.isNull);
        const name: string = nameVal.getString();

        const versionVal: SqliteValue = stmt.getValue(1);
        assert.equal(versionVal.columnName, "StrData");
        assert.equal(versionVal.type, SqliteValueType.String);
        assert.isFalse(versionVal.isNull);
        const profileVersion: any = JSON.parse(versionVal.getString());

        assert.isTrue(name === "SchemaVersion" || name === "InitialSchemaVersion");
        if (name === "SchemaVersion") {
          assert.equal(profileVersion.major, 4);
          assert.equal(profileVersion.minor, 0);
          assert.equal(profileVersion.sub1, 0);
          assert.isAtLeast(profileVersion.sub2, 1);
        } else if (name === "InitialSchemaVersion") {
          assert.equal(profileVersion.major, 4);
          assert.equal(profileVersion.minor, 0);
          assert.equal(profileVersion.sub1, 0);
          assert.isAtLeast(profileVersion.sub2, 1);
        }
      }
      assert.equal(rowCount, 2);
    });
    iVault.close();
  });

  it("tryPrepareStatement", () => {
    const sql = `SELECT * FROM ${Element.classFullName} LIMIT 1`;
    const invalidSql = "SELECT * FROM InvalidSchemaName:InvalidClassName LIMIT 1";
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.throws(() => ivault1.prepareStatement(invalidSql, false));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.isUndefined(ivault1.tryPrepareStatement(invalidSql));
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    using statement: DMSqlStatement | undefined = ivault1.tryPrepareStatement(sql);
    assert.isDefined(statement);
    assert.isTrue(statement?.isPrepared);
  });

  it("containsClass", () => {
    assert.isTrue(ivault1.containsClass(Element.classFullName));
    assert.isTrue(ivault1.containsClass("BisCore:Element"));
    assert.isTrue(ivault1.containsClass("BisCore.Element"));
    assert.isTrue(ivault1.containsClass("biscore:element"));
    assert.isTrue(ivault1.containsClass("biscore.element"));
    assert.isTrue(ivault1.containsClass("bis:Element"));
    assert.isTrue(ivault1.containsClass("bis.Element"));
    assert.isTrue(ivault1.containsClass("bis:element"));
    assert.isTrue(ivault1.containsClass("bis.element"));
    assert.isFalse(ivault1.containsClass("BisCore:Element:InvalidExtra"));
    assert.isFalse(ivault1.containsClass("BisCore"));
    assert.isFalse(ivault1.containsClass(":Element"));
    assert.isFalse(ivault1.containsClass("BisCore:InvalidClassName"));
    assert.isFalse(ivault1.containsClass("InvalidSchemaName:Element"));
  });

  it("should update Element code", () => {
    const txn = new EditTxn(ivault4, "update element code");
    txn.start();
    const elementId = txn.insertElement({
      classFullName: "BldPlatformTest:TestInformationRecord",
      model: IVault.repositoryModelId,
      code: Code.createEmpty(),
    });
    let element = ivault4.elements.getElement<InformationRecordElement>(elementId, InformationRecordElement);
    assert.isTrue(Code.isValid(element.code));
    assert.isTrue(Code.isEmpty(element.code));
    const codeSpecId = ivault4.codeSpecs.insert(txn, "TestCodeSpec", CodeScopeSpec.Type.Model);
    const codeValue = `${element.className}-1`;
    element.code = new Code({ spec: codeSpecId, scope: IVault.repositoryModelId, value: codeValue });
    element.update(txn);
    txn.end();
    element = ivault4.elements.getElement<InformationRecordElement>(elementId, InformationRecordElement);
    assert.isTrue(Code.isValid(element.code));
    assert.isFalse(Code.isEmpty(element.code));
    assert.equal(element.code.value, codeValue);
  });

  it("should update UserLabel", () => {
    const txn = new EditTxn(ivault1, "update user label");
    txn.start();
    // type coercion reminder!
    const s: string = "";
    assert.isTrue(s === "");
    assert.isFalse(s ? true : false);

    // insert element with an undefined UserLabel
    const elementProps: DefinitionElementProps = {
      classFullName: SpatialCategory.classFullName,
      model: IVault.dictionaryId,
      code: SpatialCategory.createCode(ivault1, IVault.dictionaryId, "TestCategoryForClearUserLabel"),
    };
    const elementId = txn.insertElement(elementProps);
    let element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.isUndefined(element.userLabel);

    // update element with a defined userLabel
    element.userLabel = "UserLabel";
    element.update(txn);
    element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.equal(element.userLabel, "UserLabel");

    // make sure userLabel is not updated when not part of the specified ElementProps
    txn.updateElement({
      id: element.id,
      classFullName: element.classFullName,
      model: element.model,
      code: element.code,
    });
    element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.equal(element.userLabel, "UserLabel"); // NOTE: userLabel is not modified when userLabel is not part of the input ElementProps

    const elProps = ivault1.elements.getElementProps({ id: elementId, onlyBaseProperties: true });
    expect(elProps.userLabel).equal(element.userLabel);
    expect(elProps.classFullName).equal(SpatialCategory.classFullName);
    expect(elProps.model).equal(element.model);
    expect(elProps.code.value).equal(element.code.value);
    expect(elProps.code.scope).equal(element.code.scope);
    expect(elProps.code.spec).equal(element.code.spec);
    expect(elProps.federationGuid).equal(element.federationGuid);
    expect((elProps as any).isPrivate).to.be.oneOf([false, undefined]);
    expect((elProps as any).isInstanceOfEntity).undefined;

    // remove userlabel by setting it to the blank string
    element.userLabel = "";
    element.update(txn);
    txn.end();
    element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.isUndefined(element.userLabel); // NOTE: userLabel is cleared when the empty string is specified
  });

  it("should update FederationGuid", () => {
    const txn = new EditTxn(ivault1, "update federation guid");
    txn.start();
    // insert element with an undefined FederationGuid
    const elementProps: DefinitionElementProps = {
      classFullName: SpatialCategory.classFullName,
      model: IVault.dictionaryId,
      federationGuid: Guid.empty,
      code: SpatialCategory.createCode(ivault1, IVault.dictionaryId, "TestCategoryForClearFederationGuid"),
    };
    const elementId = txn.insertElement(elementProps);
    let element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.isUndefined(element.federationGuid);
    assert.isFalse(element.isPrivate);

    // update element with a defined FederationGuid
    const federationGuid = Guid.createValue();
    element.federationGuid = federationGuid;
    element.isPrivate = true;
    element.update(txn);
    element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.equal(element.federationGuid, federationGuid);
    assert.isTrue(element.isPrivate);

    // make sure FederationGuid is not updated when not part of the specified ElementProps
    txn.updateElement({
      id: element.id,
      classFullName: element.classFullName,
      model: element.model,
      code: element.code,
    });
    element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.equal(element.federationGuid, federationGuid);
    assert.isTrue(element.isPrivate);

    // remove federationGuid by setting it to undefined in ElementProps
    const elProps = element.toJSON();
    elProps.federationGuid = undefined;
    txn.updateElement(elProps);
    element = ivault1.elements.getElement<SpatialCategory>(elementId);
    assert.isUndefined(element.federationGuid);

    // ensure that update doesn't change federationGuid from an element immediately after insert (toJSON should remove undefined value)
    const subject5 = Subject.create(ivault1, IVault.rootSubjectId, "Subject5");
    const s5Id = subject5.insert(txn);
    const s5pre = ivault1.elements.getElement<Subject>(s5Id);
    subject5.description = "new descr";
    subject5.update(txn);
    txn.end();
    const s5post = ivault1.elements.getElement<Subject>(s5Id);
    expect(s5pre.federationGuid).equal(s5post.federationGuid);
    expect(s5post.description).equal(subject5.description);
  });

  it("should support partial update", () => {
    const txn = new EditTxn(ivault1, "partial element update");
    txn.start();
    // Insert Subject elements - initializing Description and UserLabel to similar values
    let subject1 = Subject.create(ivault1, IVault.rootSubjectId, "Subject1", "Description1");
    let subject2 = Subject.create(ivault1, IVault.rootSubjectId, "Subject2", "Description2");
    let subject3 = Subject.create(ivault1, IVault.rootSubjectId, "Subject3", "");
    let subject4 = Subject.create(ivault1, IVault.rootSubjectId, "Subject4");
    subject1.userLabel = "UserLabel1";
    subject2.userLabel = "UserLabel2";
    subject3.userLabel = "";
    subject4.userLabel = undefined;
    const federationGuid1 = Guid.createValue();
    const federationGuid2 = Guid.createValue();
    subject1.federationGuid = federationGuid1;
    subject2.federationGuid = federationGuid2;
    subject3.federationGuid = "";
    subject4.federationGuid = Guid.empty;
    const subjectId1 = subject1.insert(txn);
    const subjectId2 = subject2.insert(txn);
    const subjectId3 = subject3.insert(txn);
    const subjectId4 = subject4.insert(txn);
    subject1 = ivault1.elements.getElement<Subject>(subjectId1, Subject);
    subject2 = ivault1.elements.getElement<Subject>(subjectId2, Subject);
    subject3 = ivault1.elements.getElement<Subject>(subjectId3, Subject);
    subject4 = ivault1.elements.getElement<Subject>(subjectId4, Subject);

    // Subject.Description is an auto-handled property
    assert.equal(subject1.description, "Description1");
    assert.equal(subject2.description, "Description2");
    assert.equal(subject3.description, ""); // NOTE: different behavior between auto-handled and custom-handled
    assert.isUndefined(subject4.description);

    // Test toJSON
    assert.equal(subject1.toJSON().description, "Description1");
    assert.equal(subject2.toJSON().description, "Description2");
    assert.equal(subject3.toJSON().description, "");
    assert.isUndefined(subject4.toJSON().description);

    // Element.UserLabel is a custom-handled property
    assert.equal(subject1.userLabel, "UserLabel1");
    assert.equal(subject2.userLabel, "UserLabel2");
    assert.isUndefined(subject3.userLabel); // NOTE: different behavior between auto-handled and custom-handled
    assert.isUndefined(subject4.userLabel);

    // Element.FederationGuid is a custom-handled property
    assert.equal(subject1.federationGuid, federationGuid1);
    assert.equal(subject2.federationGuid, federationGuid2);
    assert.isUndefined(subject4.federationGuid);

    // test partial update of Description (auto-handled)
    txn.updateElement<SubjectProps>({ id: subject1.id, description: "Description1-Updated" });
    subject1 = ivault1.elements.getElement<Subject>(subjectId1, Subject);
    assert.equal(subject1.description, "Description1-Updated"); // should have been updated
    assert.isDefined(subject1.model);
    assert.isDefined(subject1.parent);
    assert.equal(subject1.code.value, "Subject1"); // should not have changed
    assert.equal(subject1.userLabel, "UserLabel1"); // should not have changed
    assert.equal(subject1.federationGuid, federationGuid1); // should not have changed

    // test partial update of UserLabel (custom-handled)
    txn.updateElement<SubjectProps>({ id: subject2.id, userLabel: "UserLabel2-Updated" });
    subject2 = ivault1.elements.getElement<Subject>(subjectId2, Subject);
    assert.isDefined(subject2.model);
    assert.isDefined(subject2.parent);
    assert.equal(subject2.userLabel, "UserLabel2-Updated"); // should have been updated
    assert.equal(subject2.code.value, "Subject2"); // should not have changed
    assert.equal(subject2.description, "Description2"); // should not have changed
    assert.equal(subject2.federationGuid, federationGuid2); // should not have changed

    // Update Subject elements - setting Description and UserLabel to similar values
    subject1.description = undefined;
    subject2.description = "";
    subject3.description = "Description3";
    subject4.description = "Description4";
    subject2.userLabel = "";
    subject3.userLabel = "UserLabel3";
    subject4.userLabel = "UserLabel4";
    subject1.update(txn);
    subject2.update(txn);
    subject3.update(txn);
    subject4.update(txn);
    subject1 = ivault1.elements.getElement<Subject>(subjectId1, Subject);
    subject2 = ivault1.elements.getElement<Subject>(subjectId2, Subject);
    subject3 = ivault1.elements.getElement<Subject>(subjectId3, Subject);
    subject4 = ivault1.elements.getElement<Subject>(subjectId4, Subject);

    // Subject.Description is an auto-handled property
    assert.isUndefined(subject1.description);
    assert.equal(subject2.description, ""); // NOTE: different behavior between auto-handled and custom-handled
    assert.equal(subject3.description, "Description3");
    assert.equal(subject4.description, "Description4");

    // Element.UserLabel is a custom-handled property
    assert.isUndefined(subject2.userLabel); // NOTE: different behavior between auto-handled and custom-handled
    assert.equal(subject3.userLabel, "UserLabel3");
    assert.equal(subject4.userLabel, "UserLabel4");

    // test partial update of Description to undefined
    const s3Fed = subject3.federationGuid;
    txn.updateElement<SubjectProps>({ id: subject3.id, description: undefined });
    subject3 = ivault1.elements.getElement<Subject>(subjectId3, Subject);
    assert.isUndefined(subject3.description); // should have been updated
    assert.isDefined(subject3.model);
    assert.isDefined(subject3.parent);
    assert.equal(subject3.code.value, "Subject3"); // should not have changed
    assert.equal(subject3.userLabel, "UserLabel3"); // should not have changed
    assert.equal(subject3.federationGuid, s3Fed); // should not have changed

    // test partial update of UserLabel to undefined
    txn.updateElement<SubjectProps>({ id: subject4.id, userLabel: undefined });
    txn.end();
    subject4 = ivault1.elements.getElement<Subject>(subjectId4, Subject);
    assert.isDefined(subject4.model);
    assert.isDefined(subject4.parent);
    // assert.isUndefined(subject4.userLabel); // should have been updated  - WIP WIP WIP
    assert.equal(subject4.code.value, "Subject4"); // should not have changed
    assert.equal(subject4.description, "Description4"); // should not have changed
    assert.isUndefined(subject4.federationGuid); // should not have changed

  });

  it('should allow untrimmed codes when using "exact" codeValueBehavior', () => {
    const ivaultPath = IVaultTestUtils.prepareOutputFile("IVault", "codeValueBehavior.dtw");
    const ivault = SnapshotDb.createEmpty(ivaultPath, { rootSubject: { name: "codeValueBehaviors" } });
    const txn = new EditTxn(ivault, "codeValueBehavior");
    txn.start();

    const getNumberedCodeValAndProps = (n: number) => {
      const trimmedCodeVal = `CodeValue${n}`;
      const untrimmedCodeVal = `${trimmedCodeVal}\xa0`;
      const spec = ivault.codeSpecs.getByName(SpatialCategory.getCodeSpecName()).id;
      const props: ElementProps = {
        // the [[Code]] class still (as it always has) trims unicode space, so avoid it
        code: { spec, scope: IVaultDb.dictionaryId, value: untrimmedCodeVal },
        model: IVaultDb.dictionaryId,
        classFullName: SpatialCategory.classFullName,
      };
      return { trimmedCodeVal, untrimmedCodeVal, props };
    };

    expect(ivault.codeValueBehavior).to.equal("trim-unicode-whitespace");

    const code1 = getNumberedCodeValAndProps(1);
    const categ1Id = txn.insertElement(code1.props);
    const categ1 = ivault.elements.getElementProps({ id: categ1Id });
    expect(categ1.code.value).to.equal(code1.trimmedCodeVal);

    ivault.codeValueBehavior = "exact";
    const code2 = getNumberedCodeValAndProps(2);
    const categ2Id = txn.insertElement(code2.props);
    const categ2 = ivault.elements.getElementProps({ id: categ2Id });
    expect(categ2.code.value).to.equal(code2.untrimmedCodeVal);

    ivault.codeValueBehavior = "trim-unicode-whitespace";
    const code3 = getNumberedCodeValAndProps(3);
    const categ3Id = txn.insertElement(code3.props);
    const categ3 = ivault.elements.getElement({ id: categ3Id });
    expect(categ3.code.value).to.equal(code3.trimmedCodeVal);

    txn.end();
    ivault.close();
  });

  it("should throw szewTwinErrors on element CRUD opertion fails", async () => {
    const txn = new EditTxn(ivault1, "element CRUD failure cases");
    txn.start();
    const code = Code.createEmpty();
    code.value = "foo";

    const props: TypeDefinitionElementProps = {
      classFullName: GenericGraphicalType2d.classFullName,
      model: IVault.dictionaryId,
      code,
    };
    txn.insertElement(props);

    expect(() => txn.insertElement(props)).throws("Error inserting element [duplicate code]").to.have.property("szewTwinErrorId");
    const updateProps: TypeDefinitionElementProps = {
      id: Id64.fromString("0x111111"),
      classFullName: GenericGraphicalType2d.classFullName,
      model: IVault.dictionaryId,
      code,
    };
    expect(() => txn.updateElement(updateProps)).throws(`Error updating element [missing id], id: ${updateProps.id}`).to.have.property("szewTwinErrorId");
    expect(() => txn.deleteElement(updateProps.id!)).throws(`Error deleting element [missing id], id: ${updateProps.id}`).to.have.property("szewTwinErrorId");

    expect(() => txn.insertModel({ classFullName: DefinitionModel.classFullName, modeledElement: { id: "0x10000000bad" } })).throws("Error inserting model [error=10004], class=BisCore:DefinitionModel").to.have.property("szewTwinErrorId");
    expect(() => txn.updateModel({
      id: Id64.fromString("0x111111"),
      modeledElement: { id: Id64.fromString("0x111111") },
      classFullName: ""
    })).throws(`Error updating model [missing id], id: ${Id64.fromString("0x111111")}`).to.have.property("szewTwinErrorId");
    expect(() => txn.deleteModel(Id64.fromString("0x111111"))).throws(`Error deleting model [missing id], id: ${Id64.fromString("0x111111")}`).to.have.property("szewTwinErrorId");
    txn.end("abandon");
  });

  it("throws NotFound when attempting to access element props after closing the iVault", () => {
    const ivaultPath = IVaultTestUtils.prepareOutputFile("IVault", "accessAfterClose.dtw");
    const ivault = SnapshotDb.createEmpty(ivaultPath, { rootSubject: { name: "accessAfterClose" } });

    const elem = ivault.elements.getElement<Subject>(IVault.rootSubjectId);
    expect(elem.id).to.equal(IVault.rootSubjectId);

    ivault.close();

    expect(() => ivault.elements.getElement<Subject>(IVault.rootSubjectId)).to.throw(IVaultError, "Element=0x1", "Not Found");
  });

  it("should throw \"constraint failed (BE_SQLITE_CONSTRAINT_UNIQUE)\" when inserting a relationsip instance with the same prop twice", () => {
    const ivaultPath = IVaultTestUtils.prepareOutputFile("IVault", "insertDuplicateInstance.dtw");
    const ivault = SnapshotDb.createEmpty(ivaultPath, { rootSubject: { name: "insertDuplicateInstance" } });
    const txn = new EditTxn(ivault, "insert duplicate relationship instance");
    txn.start();
    // Create a new physical model
    const newModelId = PhysicalModel.insert(txn, IVault.rootSubjectId, "TestModel");

    // create a SpatialCategory
    const spatialCategoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "MySpatialCategory", new SubCategoryAppearance({ color: ColorByName.darkRed }));

    // Create a couple of physical elements.
    const elementProps: GeometricElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: newModelId,
      category: spatialCategoryId,
      code: Code.createEmpty(),
    };

    const id0 = txn.insertElement(elementProps);
    const id1 = txn.insertElement(elementProps);

    const props: ElementGroupsMembersProps = {
      classFullName: "BisCore:ElementGroupsMembers",
      sourceId: id0,
      targetId: id1,
      memberPriority: 1,
    };

    txn.insertRelationship(props);
    expect(() => txn.insertRelationship(props)).to.throw(`Failed to insert relationship [${ivaultPath}]: rc=2067, constraint failed (BE_SQLITE_CONSTRAINT_UNIQUE)`);

    txn.end("abandon");
    ivault.close();
  });

  function createElemProps(_ivault: IVaultDb, modId: Id64String, catId: Id64String, className: string): GeometricElementProps {
    // Create props
    const elementProps: GeometricElementProps = {
      classFullName: className,
      model: modId,
      category: catId,
      code: Code.createEmpty(),
    };
    return elementProps;
  }

  function insertElement(ivault: IVaultDb, mId: Id64String, cId: Id64String, cName: string, propName: string, txn: EditTxn): Id64String {
    const elementProps = createElemProps(ivault, mId, cId, cName);
    const geomElement = ivault.elements.createElement(elementProps);
    (geomElement as any).name = propName; // Add a custom property to the element
    const id = txn.insertElement(geomElement.toJSON());
    assert.isTrue(Id64.isValidId64(id), "insert failed");
    return id;
  }

  function validateADrivesBRowCount(ivault: IVaultDb, expectedRows: number): void {
    const reader = IVaultTestUtils.executeQuery(ivault, `select * from trs.ADrivesB`);
    assert.strictEqual(reader.length, expectedRows, `Expected ${expectedRows} rows in trs.ADrivesB table`);
  }

  function validateNavProp(ivault: IVaultDb, expectedNavPropValue: any): void {
    const reader = IVaultTestUtils.executeQuery(ivault, `select NavPropChildB from trs.ChildA`);
    assert.strictEqual(reader.length, 1);
    assert.deepEqual(reader[0].navPropChildB, expectedNavPropValue, `Expected NavPropChildB to be "${expectedNavPropValue}"`);
  }

  it("Validate invalid relationship classes being inserted/updated", async () => {
    const ivaultPath = IVaultTestUtils.prepareOutputFile("IVault", "invalidRelationshipClass.dtw");

    if (IVaultJsFs.existsSync(ivaultPath))
      IVaultJsFs.unlinkSync(ivaultPath);

    const testIvault = SnapshotDb.createEmpty(ivaultPath, { rootSubject: { name: "invalidRelationshipClass" } });

    await testIvault.importSchemaStrings([
      `<?xml version="1.0" encoding="UTF-8"?>
      <DMSchema schemaName="TestRelationSchema" alias="trs" version="01.00" xmlns="http://www.szewec.com/schemas/Szewec.DMXML.3.1">
          <DMSchemaReference name="BisCore" version="01.00" alias="bis"/>
          <DMEntityClass typeName="TestElement">
              <BaseClass>bis:PhysicalElement</BaseClass>
              <DMProperty propertyName="Name" typeName="string" />
          </DMEntityClass>

          <DMEntityClass typeName="ChildA" >
            <BaseClass>TestElement</BaseClass>
            <DMNavigationProperty propertyName="NavPropChildB" relationshipName="ADrivesB" direction="Forward" readOnly="True">
            </DMNavigationProperty>
          </DMEntityClass>

          <DMEntityClass typeName="ChildB" >
            <BaseClass>TestElement</BaseClass>
          </DMEntityClass>

          <DMRelationshipClass typeName="ADrivesB" strengthDirection="Backward" strength="referencing" modifier="Sealed">
            <Source multiplicity="(0..*)" polymorphic="true" roleLabel="drives">
              <Class class="ChildA"/>
            </Source>
            <Target multiplicity="(0..1)" polymorphic="true" roleLabel="is driven by">
              <Class class="ChildB"/>
            </Target>
          </DMRelationshipClass>

          <DMEntityClass typeName="ChildC">
            <BaseClass>TestElement</BaseClass>
          </DMEntityClass>

          <DMEntityClass typeName="ChildD">
            <BaseClass>TestElement</BaseClass>
          </DMEntityClass>

          <DMRelationshipClass typeName="CIsRelatedToD" strength="referencing" modifier="Sealed">
             <BaseClass>bis:ElementRefersToElements</BaseClass>
            <Source multiplicity="(0..*)" roleLabel="IsRelatedTo" polymorphic="true">
              <Class class="ChildC"/>
            </Source>
            <Target multiplicity="(0..*)" roleLabel="IsRelatedTo (Reversed)" polymorphic="true">
              <Class class="ChildD"/>
            </Target>
          </DMRelationshipClass>
        </DMSchema>`]);

    // Enable DMSQL write validation and verify it's set
    const pragmaRows = IVaultTestUtils.executeQuery(testIvault, `PRAGMA validate_dmsql_writes=true`);
    assert.exists(pragmaRows);
    assert.strictEqual(pragmaRows[0].validate_dmsql_writes, true);

    // Ensure ADrivesB table is empty before test
    validateADrivesBRowCount(testIvault, 0);

    // Create a physical model and spatial category if needed
    const setupTxn = new EditTxn(testIvault, "setup invalid relationship class test");
    setupTxn.start();
    const [, newModelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(setupTxn, Code.createEmpty(), true);
    const spatialCategoryId = SpatialCategory.queryCategoryIdByName(testIvault, IVault.dictionaryId, "MySpatialCategory")
      ?? SpatialCategory.insert(setupTxn,
        IVault.dictionaryId,
        "MySpatialCategory",
        new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() })
      );
    const idB = insertElement(testIvault, newModelId, spatialCategoryId, "TestRelationSchema:ChildB", "ChildBElement", setupTxn);
    setupTxn.end();
    assert.isTrue(Id64.isValidId64(idB), "Insert ChildBElement failed");

    // Prepare base props for ChildA
    const elementProps = createElemProps(testIvault, newModelId, spatialCategoryId, "TestRelationSchema:ChildA");

    // Test various relationship class names for navigation property
    const testCases = [
      { name: "trs:ADrivesB", shouldSucceed: true, expectedRows: 1 },
      { name: "trs.FakeClass", shouldSucceed: true, expectedRows: 0 },
      { name: "trs:ChildA", shouldSucceed: false, expectedRows: 0 },
      { name: "trs:ChildB", shouldSucceed: false, expectedRows: 0 },
      { name: "trs:CIsRelatedToD", shouldSucceed: false, expectedRows: 0 },
    ];

    for (const { name, shouldSucceed, expectedRows } of testCases) {
      const txn = new EditTxn(testIvault, `invalid relationship class ${name}`);
      txn.start();
      try {
        const elemRef = new RelatedElement({ id: idB, relClassName: name });
        (elementProps as any).navPropChildB = elemRef;
        (elementProps as any).name = "ChildAElement";
        const geomElement = testIvault.elements.createElement(elementProps);

        let idA: Id64String | undefined;
        try {
          idA = txn.insertElement(geomElement.toJSON());
          if (shouldSucceed)
            assert.isTrue(Id64.isValidId64(idA), `Insert should have succeeded for ${name}.`);
          else
            assert.fail(`Insert should have failed for ${name}.`);
        } catch (err: any) {
          if (shouldSucceed)
            assert.fail(`Insert should have succeeded for ${name}. Error: ${err.message}`);

          // If should not succeed, error is expected
        }

        // Validate row count in ADrivesB table
        validateADrivesBRowCount(testIvault, expectedRows);

        // If insert succeeded, test update and delete scenarios
        if (expectedRows === 1 && idA !== undefined) {
          validateNavProp(testIvault, { id: idB, relClassName: "TestRelationSchema.ADrivesB" });

          const editElem: any = testIvault.elements.getElement(idA);
          editElem.navPropChildB = new RelatedElement({ id: idB, relClassName: "trs.FakeClass" });
          editElem.name = "ChildAElementUpdated";
          txn.updateElement(editElem);

          validateADrivesBRowCount(testIvault, 1);
          validateNavProp(testIvault, { id: idB, relClassName: "TestRelationSchema.ADrivesB" });

          const editedElem: any = testIvault.elements.getElement(idA);
          assert.equal(editedElem.name, "ChildAElementUpdated", `Expected name to be "ChildAElementUpdated" after update, but got "${editedElem.name}"`);
          assert.strictEqual(editedElem.navPropChildB.relClassName, "TestRelationSchema.ADrivesB", `Expected navPropChildB to be "TestRelationSchema.ADrivesB" after update, but got "${editedElem.navPropChildB}"`);

          // Set the nav prop value to null
          editElem.name = "ChildAElementNulled";
          editElem.navPropChildB = null;
          txn.updateElement(editElem);

          validateADrivesBRowCount(testIvault, 0);
          const nulledElem: any = testIvault.elements.getElement(idA);
          assert.equal(nulledElem.name, "ChildAElementNulled", `Expected name to be "ChildAElementNulled" after nulling, but got "${nulledElem.name}"`);
          assert.isUndefined(nulledElem.navPropChildB, `Expected navPropChildB to be undefined after nulling, but got "${nulledElem.navPropChildB}"`);

          if (shouldSucceed) {
            txn.deleteElement(idA);
            assert.isUndefined(testIvault.elements.tryGetElement(idA), `Expected element with id ${idA} to be deleted, but it still exists.`);
          }
        }
      } finally {
        txn.end("abandon");
      }
    }
    testIvault.close();
  });

  it("should update codeValues that are switched between elements", async () => {
    const dbFileName = IVaultTestUtils.prepareOutputFile("IVault", "change-codeValues.dtw");
    const ivaultDb = SnapshotDb.createEmpty(dbFileName, {
      rootSubject: { name: "change-codeValues" },
    });
    let categoryA = SpatialCategory.create(
      ivaultDb,
      IVault.dictionaryId,
      "A"
    );
    let categoryB = SpatialCategory.create(
      ivaultDb,
      IVault.dictionaryId,
      "B"
    );
    categoryA.userLabel = "A";
    categoryB.userLabel = "B";
    const txn = new EditTxn(ivaultDb, "change codeValues");
    txn.start();
    categoryA.insert(txn);
    categoryB.insert(txn);
    txn.saveChanges();

    categoryA = ivaultDb.elements.getElement(
      SpatialCategory.createCode(ivaultDb, IVault.dictionaryId, "A")
    );
    categoryB = ivaultDb.elements.getElement(
      SpatialCategory.createCode(ivaultDb, IVault.dictionaryId, "B")
    );
    categoryA.code.value = "temp";
    categoryA.update(txn);
    categoryB.code.value = "A";
    categoryB.update(txn);
    categoryA.code.value = "B";
    categoryA.update(txn);
    txn.end();

    categoryA = ivaultDb.elements.getElement(
      SpatialCategory.createCode(ivaultDb, IVault.dictionaryId, "A")
    );
    categoryB = ivaultDb.elements.getElement(
      SpatialCategory.createCode(ivaultDb, IVault.dictionaryId, "B")
    );

    expect(categoryA.userLabel).to.equal("B", `categoryA.userLabel mismatch in ${ivaultDb.name}`);
    expect(categoryB.userLabel).to.equal("A", `categoryB.userLabel mismatch in ${ivaultDb.name}`);
    ivaultDb.close();
  });

  it("should provide meaningful error when querying a closed iVault", () => {
    const testIvault = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("IVault", "QueryingClosedIvault.dtw"), { rootSubject: { name: "QueryClosedTest" } });
    assert.isTrue(testIvault.isOpen);

    // Close the iVault for the tests
    testIvault.close();
    assert.isFalse(testIvault.isOpen);

    const closedDbError = "Cannot query a closed Db";
    expect(() => testIvault.withPreparedSqliteStatement("SELECT 1", () => { })).to.throw(closedDbError);
    expect(() => testIvault.withPreparedSqliteStatement("SELECT 1", () => { })).to.throw(closedDbError);
    expect(() => testIvault.prepareSqliteStatement("SELECT 1")).to.throw(closedDbError);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(() => testIvault.prepareStatement("SELECT 1")).to.throw(closedDbError);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(() => testIvault.withPreparedStatement("SELECT DMInstanceId FROM BisCore:Element LIMIT 1", () => { })).to.throw(closedDbError);
    expect(() => testIvault.elements.queryChildren(IVault.rootSubjectId)).to.throw(closedDbError);
    expect(() => testIvault.elements.getAspects("0x1", "WrongSchema:WrongClass")).to.throw("db is not open");
    expect(() => testIvault.createQueryReader("SELECT 1")).to.throw("db not open");
  });

  describe("Delete relationship instances", () => {
    let testIvault: SnapshotDb;
    const relationshipClasses = [
      "BisCore:ElementGroupsMembers",
      "BisCore:ElementDrivesElement",
      "BisCore:ElementRefersToDocuments"
    ];

    afterEach(() => {
      if (testIvault !== undefined) {
        const iVaultPath = testIvault.pathName;
        if (testIvault.isOpen)
          testIvault.close();
        IVaultJsFs.unlinkSync(iVaultPath);
      }
    });

    function setupRelationships(numOfRelationships: number, multipleClasses: boolean = false): RelationshipProps[] {
      testIvault = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("IVault", "DeleteRelationshipInstances.dtw"), { rootSubject: { name: "DeleteRelationshipInstances" } });
      assert.isTrue(testIvault.isOpen);

      const txn = new EditTxn(testIvault, "setup delete relationships");
      txn.start();
      const [, newModelId] = IVaultTestUtils.createAndInsertPhysicalPartitionAndModel(txn, Code.createEmpty(), true);
      let spatialCategoryId = SpatialCategory.queryCategoryIdByName(testIvault, IVault.dictionaryId, "MySpatialCategory");
      if (!spatialCategoryId) {
        spatialCategoryId = SpatialCategory.insert(txn, IVault.dictionaryId, "MySpatialCategory", new SubCategoryAppearance());
      }

      const relationships: RelationshipProps[] = [];
      for (let i = 0; i < numOfRelationships; ++i) {
        const sourceProps = createElemProps(testIvault, newModelId, spatialCategoryId, "Generic:PhysicalObject");
        const sourceId = txn.insertElement(sourceProps);

        const targetProps = createElemProps(testIvault, newModelId, spatialCategoryId, "Generic:PhysicalObject");
        const targetId = txn.insertElement(targetProps);

        let relationshipClass = "BisCore:ElementGroupsMembers";
        if (multipleClasses)
          relationshipClass = relationshipClasses[i % relationshipClasses.length];

        const relationshipProps: RelationshipProps = {
          classFullName: relationshipClass,
          sourceId,
          targetId,
        };

        relationshipProps.id = txn.insertRelationship(relationshipProps);
        relationships.push(relationshipProps);
      }
      txn.end();
      return relationships;
    }

    async function getRelationshipCount(iVault: IVaultDb, relationshipClass: string): Promise<number> {
      const reader = iVault.createQueryReader(`SELECT COUNT(*) AS [count] FROM ${relationshipClass}`);
      await reader.step();
      return reader.current.count;
    }

    it("deleteInstances with an empty array", async () => {
      const relationships = setupRelationships(10);
      assert.equal(relationships.length, await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers"));

      withEditTxn(testIvault, (txn) => {
        txn.deleteRelationships([]);
      });

      assert.equal(relationships.length, await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers"));
    });

    it("deleteInstances with a single relationship instance", async () => {
      const relationships = setupRelationships(10);
      assert.equal(relationships.length, await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers"), "Should delete exactly one relationship");

      // Delete just one relationship using deleteInstances method
      withEditTxn(testIvault, (txn) => {
        txn.deleteRelationships([relationships[0]]);
      });

      const remainingCount = await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers");
      assert.equal(remainingCount, relationships.length - 1, "Should delete exactly one relationship");
    });

    it("deleteInstances with different relationship classes", async () => {
      const relationships = setupRelationships(500, true);

      // Verify relationships were created across different classes
      assert.isTrue(await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers") >= Math.floor(relationships.length / 3));
      assert.isTrue(await getRelationshipCount(testIvault, "BisCore.ElementDrivesElement") >= Math.floor(relationships.length / 3));
      assert.isTrue(await getRelationshipCount(testIvault, "BisCore.ElementRefersToDocuments") >= Math.floor(relationships.length / 3));

      // Test deleteInstances with mixed relationship classes
      withEditTxn(testIvault, (txn) => {
        txn.deleteRelationships(relationships);
      });

      // Verify all relationships were deleted regardless of their class
      assert.equal(0, await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers"), "All ElementGroupsMembers relationships should be deleted");
      assert.equal(0, await getRelationshipCount(testIvault, "BisCore.ElementDrivesElement"), "All ElementDrivesElement relationships should be deleted");
      assert.equal(0, await getRelationshipCount(testIvault, "BisCore.ElementRefersToDocuments"), "All ElementRefersToDocuments relationships should be deleted");
    });

    it("deleteInstances for random relationship instances", async () => {
      const relationships = setupRelationships(1000, true);

      // Verify relationships exist before deletion
      assert.isTrue(await getRelationshipCount(testIvault, "BisCore.ElementGroupsMembers") >= Math.floor(relationships.length / 3));
      assert.isTrue(await getRelationshipCount(testIvault, "BisCore.ElementDrivesElement") >= Math.floor(relationships.length / 3));
      assert.isTrue(await getRelationshipCount(testIvault, "BisCore.ElementRefersToDocuments") >= Math.floor(relationships.length / 3));

      // Create a subset of random relationship entries to delete
      const relationshipsToDelete: RelationshipProps[] = [];
      for (let i = 0; i < 250; ++i) {
        relationshipsToDelete.push(relationships[Math.floor(Math.random() * relationships.length)]);
      }

      withEditTxn(testIvault, (txn) => {
        txn.deleteRelationships(relationshipsToDelete);
      });

      // Verify all relationships were deleted
      for (const relClass of relationshipsToDelete) {
        const reader = testIvault.createQueryReader(`SELECT DMInstanceId FROM ${relClass.classFullName} WHERE SourceDMInstanceId=? AND TargetDMInstanceId=?`, new QueryBinder().bindId(1, relClass.sourceId).bindId(2, relClass.targetId));
        assert.isFalse(await reader.step(), `Relationship ${relClass.id} should be deleted`); // No row should be returned
      }
    });
  });
});

describe("IVaultDb.requireMinimumSchemaVersion", () => {
  let ivault: SnapshotDb;

  before(() => ivault = SnapshotDb.createEmpty(IVaultTestUtils.prepareOutputFile("IVault", "MinSchemaVer.dtw"), { rootSubject: { name: "MinSchemaVer" } }));
  after(() => ivault.close());

  it("throws if the schema does not exist", () => {
    expect(
      () => ivault.requireMinimumSchemaVersion("FakeSchema", new DMVersion(1, 0, 0), "Scrobbles")
    ).to.throw("Scrobbles requires FakeSchema v01.00.00 or newer");
  });

  it("throws IFF the schema version is older than the minimum", () => {
    function test(minVer: DMVersion, expectError: boolean): void {
      expect(ivault.meetsMinimumSchemaVersion("BisCore", minVer)).to.equal(!expectError);
      const require = () => ivault.requireMinimumSchemaVersion("BisCore", minVer, "Scrobbles");
      if (expectError) {
        expect(require).to.throw(`Scrobbles requires BisCore v${minVer.toString()} or newer`);
      } else {
        require();
      }
    }

    const bisVer = ivault.querySchemaVersionNumbers("BisCore")!;
    expect(bisVer.read).to.equal(1);
    expect(bisVer.write).to.equal(0);
    expect(bisVer.minor).to.least(24);

    test(bisVer, false);
    test(new DMVersion(bisVer.read, bisVer.write, bisVer.minor - 1), false);
    test(new DMVersion(0, 0, 1), false);

    test(new DMVersion(bisVer.read, bisVer.write, bisVer.minor + 1), true);
    test(new DMVersion(bisVer.read, bisVer.write, bisVer.minor + 1), true);
    test(new DMVersion(bisVer.read + 1, bisVer.write + 1, bisVer.minor), true);
  });
});




