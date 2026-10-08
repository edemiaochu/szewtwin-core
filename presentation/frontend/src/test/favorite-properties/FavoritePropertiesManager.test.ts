/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import sinon from "sinon";
import { IVaultConnection } from "@szewtwin/core-frontend";
import { Field, NestedContentField, PropertiesField, PropertyInfo } from "@szewtwin/presentation-common";
import {
  createTestDMClassInfo,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestPropertyInfo,
  createTestRelatedClassInfo,
  createTestSimpleContentField,
} from "@szewtwin/presentation-common/test-utils";
import {
  createFieldOrderInfos,
  FavoritePropertiesManager,
  FavoritePropertiesOrderInfo,
  FavoritePropertiesScope,
  getFieldInfos,
  PropertyFullName,
} from "../../presentation-frontend/favorite-properties/FavoritePropertiesManager.js";
import { ensureIVaultInitialized, startIVaultInitialization } from "../../presentation-frontend/IVaultConnectionInitialization.js";

describe("FavoritePropertiesManager", () => {
  let manager: FavoritePropertiesManager;
  let propertyField1: PropertiesField;
  let propertyField2: PropertiesField;
  let primitiveField: Field;
  let nestedContentField: NestedContentField;
  let storageMock: ReturnType<typeof stubFavoritePropertiesStorage>;

  let szewTwinId: string;
  let ivaultId: string;
  let ivault: IVaultConnection;
  let ivaultMock: ReturnType<typeof stubIVaultConnection>;

  before(() => {
    szewTwinId = "szewtwin-id";
    ivaultId = "ivault-id";
    propertyField1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ classInfo: createTestDMClassInfo({ name: "Schema:ClassName1" }) }) }],
    });
    propertyField2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ classInfo: createTestDMClassInfo({ name: "Schema:ClassName2" }) }) }],
    });
    primitiveField = createTestSimpleContentField();
    nestedContentField = createTestNestedContentField({
      contentClassInfo: createTestDMClassInfo({ name: "Schema:NestedContentClassName" }),
      nestedFields: [propertyField1, propertyField2, primitiveField],
    });
  });

  beforeEach(async () => {
    storageMock = stubFavoritePropertiesStorage();
    manager = new FavoritePropertiesManager({ storage: storageMock });
    ivaultMock = stubIVaultConnection();
    ivault = ivaultMock as unknown as IVaultConnection;
  });

  afterEach(() => {
    manager[Symbol.dispose]();
    sinon.reset();
  });

  function stubIVaultConnection() {
    return {
      iVaultId: ivaultId,
      szewTwinId,
      createQueryReader: sinon.stub(),
    };
  }

  function stubFavoritePropertiesStorage() {
    return {
      [Symbol.dispose]: sinon.stub(),
      loadProperties: sinon.stub(),
      saveProperties: sinon.stub(),
      loadPropertiesOrder: sinon.stub(),
      savePropertiesOrder: sinon.stub(),
    };
  }

  function setupMocksForQueryingBaseClasses(classBaseClass: Array<{ classFullName: string; baseClassFullName: string }>) {
    let currIndex = -1;
    const dmSqlReader = {
      step: sinon.stub().callsFake(async () => ++currIndex < classBaseClass.length),
      get current() {
        return {
          toRow: () => classBaseClass[currIndex],
        };
      },
    };
    ivaultMock.createQueryReader.returns(dmSqlReader);
    return ivaultMock.createQueryReader;
  }

  /* eslint-disable @typescript-eslint/no-deprecated */
  describe("initializeConnection", () => {
    it("loads szewTwin and iVault scopes", async () => {
      await manager.initializeConnection(ivault);
      expect(storageMock.loadProperties).to.have.been.calledThrice;
      expect(storageMock.loadProperties).to.have.been.calledWithExactly();
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId);
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId, ivaultId);
    });

    it("loads iVault scope when szewTwin scope is already loaded", async () => {
      await manager.initializeConnection(ivault);

      const ivaultId2 = "ivault-id-2";
      const ivault2 = {
        iVaultId: ivaultId2,
        szewTwinId,
      } as IVaultConnection;
      await manager.initializeConnection(ivault2);

      expect(storageMock.loadProperties.callCount).to.eq(4);
      expect(storageMock.loadProperties).to.have.been.calledWithExactly();
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId);
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId, ivaultId);
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId, ivaultId2);
    });

    it("does not load iVault scope when iVault scope is already loaded", async () => {
      await manager.initializeConnection(ivault);
      await manager.initializeConnection(ivault);

      expect(storageMock.loadProperties).to.have.been.calledThrice;
      expect(storageMock.loadProperties).to.have.been.calledWithExactly();
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId);
      expect(storageMock.loadProperties).to.have.been.calledWithExactly(szewTwinId, ivaultId);
    });

    it("removes non-favorited property order information", async () => {
      const globalField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "global" }) }] });
      const szewTwinField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "szewTwin" }) }] });

      const globalFieldInfos = new Set<PropertyFullName>(getFieldsInfos([globalField]));
      storageMock.loadProperties.withArgs().resolves(globalFieldInfos);

      const szewTwinFieldInfos = new Set<PropertyFullName>(getFieldsInfos([szewTwinField]));
      storageMock.loadProperties.withArgs(sinon.match.any).resolves(szewTwinFieldInfos);

      const nonFavoritedField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "non-favorite" }) }] });
      const allFields = [globalField, szewTwinField, nonFavoritedField];
      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      await manager.initializeConnection(ivault);

      expect(globalFieldInfos.size).to.eq(1);
      expect(szewTwinFieldInfos.size).to.eq(1);
      expect(orderInfos.length).to.eq(2);
    });

    it("adds favorited property order information for those who don't have it", async () => {
      const withOrderInfo = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo({ name: "global", classInfo: createTestDMClassInfo({ name: "Schema:ClassName" }) }) }],
      });
      const allFields = [withOrderInfo, propertyField1, nestedContentField, primitiveField];

      const fieldInfos = new Set<PropertyFullName>(getFieldsInfos(allFields));
      storageMock.loadProperties.withArgs().resolves(fieldInfos);

      const fields = [withOrderInfo];
      const orderInfos = getFieldsOrderInfos(fields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      await manager.initializeConnection(ivault);

      expect(fieldInfos.size).to.eq(4);
      expect(orderInfos.length).to.eq(4);
    });
  });
  /* eslint-enable @typescript-eslint/no-deprecated */

  it("initializes connection when `startIVaultInitialization` is called", () => {
    const spy = sinon.spy(manager, "initializeConnection");
    startIVaultInitialization(ivault);
    startIVaultInitialization(ivault);
    expect(spy).to.be.calledOnce;
  });

  it("initializes connection when `ensureInitialized` is called", async () => {
    const spy = sinon.spy(manager, "initializeConnection");
    await ensureIVaultInitialized(ivault);
    expect(spy).to.be.calledOnce;
  });

  describe("has", () => {
    it("[deprecated] throws if not initialized", () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(() => manager.has(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.throw(
        `Favorite properties are not initialized for iVault: '${ivaultId}', in szewTwin: '${szewTwinId}'. Call initializeConnection() with an IVaultConnection to initialize.`,
      );
    });

    it("returns false for not favorite property field", async () => {
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("returns true for favorite property field", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.Global)).to.eventually.be.true;
    });

    it("returns false for not favorite primitive fields", async () => {
      const field = createTestSimpleContentField();
      await expect(manager.hasAsync(field, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("returns true for favorite primitive fields", async () => {
      const field = createTestSimpleContentField();
      await manager.add(field, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(field, ivault, FavoritePropertiesScope.Global)).to.eventually.be.true;
    });

    it("returns false for not favorite nested content fields", async () => {
      const field = createTestNestedContentField({ nestedFields: [] });
      await expect(manager.hasAsync(field, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("returns true for favorite nested content fields", async () => {
      const field = createTestNestedContentField({ nestedFields: [] });
      await manager.add(field, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(field, ivault, FavoritePropertiesScope.Global)).to.eventually.be.true;
    });

    it("returns false for not favorite property fields", async () => {
      const field = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo() }] });
      await expect(manager.hasAsync(field, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("returns true for favorite nested fields", async () => {
      const field = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo() }] });
      await manager.add(field, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(field, ivault, FavoritePropertiesScope.Global)).to.eventually.be.true;
    });

    it("returns false for not favorite nested fields", async () => {
      const nestedField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo() }] });
      const parentField = createTestNestedContentField({
        nestedFields: [nestedField],
      });
      parentField.rebuildParentship();
      await expect(manager.hasAsync(nestedField, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("returns true for favorite nested fields", async () => {
      const nestedField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo() }] });
      const parentField = createTestNestedContentField({
        nestedFields: [nestedField],
      });
      parentField.rebuildParentship();
      await manager.add(nestedField, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(nestedField, ivault, FavoritePropertiesScope.Global)).to.eventually.be.true;
    });

    it("checks iVault scope for favorite properties", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.IVault);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.true;
    });

    it("checks szewTwin scope for favorite properties", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.true;
    });
  });

  describe("add", () => {
    it("calls `ensureInitialized`", async () => {
      const spy = sinon.spy(manager, "initializeConnection");
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);
      expect(spy).to.be.calledOnce;
    });

    it("raises onFavoritesChanged event", async () => {
      const s = sinon.spy(manager.onFavoritesChanged, "raiseEvent");
      await manager.add(nestedContentField, ivault, FavoritePropertiesScope.Global);
      expect(s).to.be.calledOnce;
    });

    it("adds to szewTwin scope", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.true;
    });

    it("adds to iVault scope", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.IVault);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.true;
    });

    it("does not raise onFavoritesChanged event if property is already favorite", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);

      const s = sinon.spy(manager.onFavoritesChanged, "raiseEvent");
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);
      expect(s).to.be.not.called;
    });

    it("adds new favorited properties to the end of the list", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);
      await manager.add(propertyField2, ivault, FavoritePropertiesScope.Global);
      await manager.add(primitiveField, ivault, FavoritePropertiesScope.Global);
    });
  });

  describe("remove", () => {
    it("calls `ensureInitialized`", async () => {
      const spy = sinon.spy(manager, "initializeConnection");
      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.Global);
      expect(spy).to.be.calledOnce;
    });

    it("removes single property field", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);

      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("removes single nested property field", async () => {
      await manager.add(nestedContentField, ivault, FavoritePropertiesScope.Global);

      await manager.remove(nestedContentField, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(nestedContentField, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("removes single primitive field", async () => {
      await manager.add(primitiveField, ivault, FavoritePropertiesScope.Global);

      await manager.remove(primitiveField, ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(primitiveField, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("raises onFavoritesChanged event", async () => {
      await manager.add(nestedContentField, ivault, FavoritePropertiesScope.Global);

      const s = sinon.spy(manager.onFavoritesChanged, "raiseEvent");
      await manager.remove(nestedContentField, ivault, FavoritePropertiesScope.Global);
      expect(s).to.be.calledOnce;
    });

    it("removes from szewTwin scope", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);

      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.false;
    });

    it("removes from iVault scope", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.IVault);

      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.IVault);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.false;
    });

    it("removes from all scopes", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.IVault);

      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.IVault);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.false;
    });

    it("removes only from global and szewTwin scopes", async () => {
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.IVault);

      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.true;
    });

    it("does not raise onFavoritesChanged event if property is not favorite", async () => {
      const s = sinon.spy(manager.onFavoritesChanged, "raiseEvent");
      await manager.remove(propertyField1, ivault, FavoritePropertiesScope.Global);
      expect(s).to.be.not.called;
    });
  });

  describe("clear", () => {
    it("initializes connection", async () => {
      const spy = sinon.spy(manager, "initializeConnection");
      await manager.clear(ivault, FavoritePropertiesScope.Global);
      expect(spy).to.be.calledOnce;
    });

    it("clears global", async () => {
      await manager.add(nestedContentField, ivault, FavoritePropertiesScope.Global);
      await manager.add(primitiveField, ivault, FavoritePropertiesScope.Global);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.Global);

      await manager.clear(ivault, FavoritePropertiesScope.Global);
      await expect(manager.hasAsync(nestedContentField, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
      await expect(manager.hasAsync(primitiveField, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.Global)).to.eventually.be.false;
    });

    it("clears szewTwin", async () => {
      await manager.add(nestedContentField, ivault, FavoritePropertiesScope.SZEWTwin);
      await manager.add(primitiveField, ivault, FavoritePropertiesScope.SZEWTwin);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin);

      await manager.clear(ivault, FavoritePropertiesScope.SZEWTwin);
      await expect(manager.hasAsync(nestedContentField, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.false;
      await expect(manager.hasAsync(primitiveField, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.SZEWTwin)).to.eventually.be.false;
    });

    it("clears iVault", async () => {
      await manager.add(nestedContentField, ivault, FavoritePropertiesScope.IVault);
      await manager.add(primitiveField, ivault, FavoritePropertiesScope.IVault);
      await manager.add(propertyField1, ivault, FavoritePropertiesScope.IVault);

      await manager.clear(ivault, FavoritePropertiesScope.IVault);
      await expect(manager.hasAsync(nestedContentField, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.false;
      await expect(manager.hasAsync(primitiveField, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.false;
      await expect(manager.hasAsync(propertyField1, ivault, FavoritePropertiesScope.IVault)).to.eventually.be.false;
    });

    it("does not raise onFavoritesChanged event if there are no favorite properties", async () => {
      const s = sinon.spy(manager.onFavoritesChanged, "raiseEvent");
      await manager.clear(ivault, FavoritePropertiesScope.Global);
      expect(s).to.be.not.called;
    });

    it("removes property order information", async () => {
      const globalA = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "global-a" }) }] });
      const globalB = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "global-b" }) }] });
      const szewTwinA = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "szewTwin-a" }) }] });

      const globalFields = [globalA, globalB];
      const globalFieldInfos = new Set<PropertyFullName>(getFieldsInfos(globalFields));
      storageMock.loadProperties.withArgs().resolves(globalFieldInfos);

      const szewTwinFields = [szewTwinA];
      const szewTwinFieldInfos = new Set<PropertyFullName>(getFieldsInfos(szewTwinFields));
      storageMock.loadProperties.withArgs(sinon.match.any).resolves(szewTwinFieldInfos);

      const nonFavoritedField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "non-favorite" }) }] });
      const allFields = [globalA, globalB, szewTwinA, nonFavoritedField];
      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      await manager.clear(ivault, FavoritePropertiesScope.Global);

      expect(globalFieldInfos.size).to.eq(0);
      expect(szewTwinFieldInfos.size).to.eq(1);
      expect(orderInfos.length).to.eq(1);
    });
  });

  describe("sortFields", () => {
    it("sorts favorite properties", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }] });
      const b = createTestNestedContentField({ nestedFields: [] });
      const c = createTestSimpleContentField();
      const d = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "d" }) }] });
      const favoriteFields = [a, b, c, d];

      const fieldInfos = getFieldsInfos(favoriteFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
      const orderInfos = getFieldsOrderInfos(favoriteFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      const fields = [b, d, a, c];
      await manager.sortFieldsAsync(ivault, fields);

      expect(fields[0]).to.eq(a);
      expect(fields[1]).to.eq(b);
      expect(fields[2]).to.eq(c);
      expect(fields[3]).to.eq(d);
    });

    it("sorts partially non-favorite and favorite properties", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }], priority: 1, name: "A" });
      const b = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "b" }) }], priority: 2, name: "B" });
      const c = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "c" }) }], priority: 10, name: "C" });
      const d = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "d" }) }], priority: 10, name: "D" });
      const e = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "e" }) }], priority: 9, name: "E" });

      const favoriteFields = [a, b];
      const fieldInfos = getFieldsInfos(favoriteFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
      const orderInfos = getFieldsOrderInfos(favoriteFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      const fields = [b, d, e, c, a];
      await manager.sortFieldsAsync(ivault, fields);

      expect(fields[0]).to.eq(a);
      expect(fields[1]).to.eq(b);
      expect(fields[2]).to.eq(c);
      expect(fields[3]).to.eq(d);
      expect(fields[4]).to.eq(e);
    });

    it("uses fields most recent property to sort by", async () => {
      /** Class hierarchy:
       *  A <- B
       * Field properties:
       * F1 - a1, b1
       * F2 - a2, b2
       * F3 - a3, b3
       */
      const f1 = createTestPropertiesContentField({
        properties: [
          { property: createTestPropertyInfo({ name: "f1-1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) },
          { property: createTestPropertyInfo({ name: "f1-2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) },
        ],
      });
      const f2 = createTestPropertiesContentField({
        properties: [
          { property: createTestPropertyInfo({ name: "f2-1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) },
          { property: createTestPropertyInfo({ name: "f2-2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) },
        ],
      });
      const f3 = createTestPropertiesContentField({
        properties: [
          { property: createTestPropertyInfo({ name: "f3-1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) },
          { property: createTestPropertyInfo({ name: "f3-2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) },
        ],
      });
      const fields = [f1, f2, f3];
      const properties = [
        f3.properties[0].property,
        f1.properties[0].property,
        f2.properties[0].property,
        f1.properties[1].property,
        f2.properties[1].property,
        f3.properties[1].property,
      ];

      const fieldInfos = getFieldsInfos(fields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));

      let priority = properties.length;
      const orderInfos = properties.map(
        (property: PropertyInfo): FavoritePropertiesOrderInfo => ({
          parentClassName: property.classInfo.name,
          name: `${property.classInfo.name}:${property.name}`,
          orderedTimestamp: new Date(),
          priority: priority--,
        }),
      );
      orderInfos[3].orderedTimestamp.setDate(orderInfos[3].orderedTimestamp.getDate() + 1); // make b1 more recent than a1
      orderInfos[2].orderedTimestamp.setDate(orderInfos[2].orderedTimestamp.getDate() + 1); // make a2 more recent than b2
      orderInfos[0].orderedTimestamp = orderInfos[5].orderedTimestamp; // make a3 and b3 equal

      storageMock.loadPropertiesOrder.resolves(orderInfos);

      await manager.sortFieldsAsync(ivault, fields);

      expect(fields[0]).to.eq(f3);
      expect(fields[1]).to.eq(f2);
      expect(fields[2]).to.eq(f1);
    });
  });

  describe("changeFieldPriority", () => {
    it("throws if both fields are the same object", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }] });
      const allFields = [a];

      const fieldInfos = getFieldsInfos(allFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));

      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      await expect(manager.changeFieldPriority(ivault, a, a, allFields)).to.be.rejectedWith("`field` can not be the same as `afterField`.");
    });

    it("throws if given non-visible field", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }] });
      const b = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "b" }) }] });
      const allFields = [a, b];

      const fieldInfos = getFieldsInfos(allFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));

      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      const fakeField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "does-not-exist" }) }] });
      await expect(manager.changeFieldPriority(ivault, fakeField, b, allFields)).to.be.rejectedWith("Field is not contained in visible fields.");
    });

    it("throws if given non-favorite field", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }] });
      const b = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "b" }) }] });
      const allFields = [a, b];

      const fieldInfos = getFieldsInfos(allFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));

      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      const nonFavoriteField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "non-favorite" }) }] });
      const visibleFields = [...allFields, nonFavoriteField];
      await expect(manager.changeFieldPriority(ivault, nonFavoriteField, b, visibleFields)).to.be.rejectedWith("Field has no property order information.");
    });

    it("throws if given non-visible afterField", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }] });
      const b = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "b" }) }] });
      const allFields = [a, b];

      const fieldInfos = getFieldsInfos(allFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));

      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      const fakeField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "does-not-exist" }) }] });
      await expect(manager.changeFieldPriority(ivault, a, fakeField, allFields)).to.be.rejectedWith("Field is not contained in visible fields.");
    });

    it("throws if given non-favorite afterField", async () => {
      const a = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "a" }) }] });
      const b = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "b" }) }] });
      const allFields = [a, b];

      const fieldInfos = getFieldsInfos(allFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));

      const orderInfos = getFieldsOrderInfos(allFields);
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      const nonFavoriteField = createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "non-favorite" }) }] });
      const visibleFields = [...allFields, nonFavoriteField];
      await expect(manager.changeFieldPriority(ivault, a, nonFavoriteField, visibleFields)).to.be.rejectedWith("Field has no property order information.");
    });

    it("does not query for base classes if it already has it cached", async () => {
      const a = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo({ name: "a", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
      });
      const b = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo({ name: "b", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
      });
      const allFields = [a, b];

      const classBaseClass = [
        { classFullName: "S:A", baseClassFullName: "S:A" },
        { classFullName: "S:B", baseClassFullName: "S:B" },
        { classFullName: "S:B", baseClassFullName: "S:A" },
      ];
      const createQueryReaderStub = setupMocksForQueryingBaseClasses(classBaseClass);

      const fieldInfos = getFieldsInfos(allFields);
      storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
      const orderInfos = getFieldsOrderInfos(allFields);
      const oldOrderInfo = [...orderInfos];
      storageMock.loadPropertiesOrder.resolves(orderInfos);

      await manager.changeFieldPriority(ivault, a, b, allFields);
      expect(orderInfos[0]).to.eq(oldOrderInfo[1]); // b
      expect(orderInfos[1]).to.eq(oldOrderInfo[0]); // a

      await manager.changeFieldPriority(ivault, b, a, allFields);
      expect(orderInfos[0]).to.eq(oldOrderInfo[0]); // a
      expect(orderInfos[1]).to.eq(oldOrderInfo[1]); // b
      expect(createQueryReaderStub).to.have.been.calledOnce;
    });
  });

  it("does not change the order of irrelevant properties", async () => {
    /** Class hierarchy:
     *    A
     *   / \
     *  B   C
     * Moving a1 after c:
     *  a1    b1
     *  b1    a2
     *  a2 -> c
     *  b2    a1
     *  c     b2
     */
    const a1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const b1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b1", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const a2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a2", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const b2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const c = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "c", classInfo: createTestDMClassInfo({ name: "S:C" }) }) }],
    });
    const allFields = [a1, b1, a2, b2, c];
    const visibleFields = [a1, a2, c]; // imitating a selection of a class C instance

    // data of table DMDbMeta.ClassHasAllBaseClasses
    const classBaseClass = [
      { classFullName: "S:A", baseClassFullName: "S:A" },
      { classFullName: "S:B", baseClassFullName: "S:B" },
      { classFullName: "S:B", baseClassFullName: "S:A" },
      { classFullName: "S:C", baseClassFullName: "S:C" },
      { classFullName: "S:C", baseClassFullName: "S:A" },
    ];
    setupMocksForQueryingBaseClasses(classBaseClass);

    const fieldInfos = getFieldsInfos(allFields);
    storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
    const orderInfos = getFieldsOrderInfos(allFields);
    const oldOrderInfo = [...orderInfos];
    storageMock.loadPropertiesOrder.resolves(orderInfos);

    await manager.changeFieldPriority(ivault, a1, c, visibleFields);

    expect(orderInfos[0]).to.eq(oldOrderInfo[1]); // b1
    expect(orderInfos[1]).to.eq(oldOrderInfo[2]); // a2
    expect(orderInfos[2]).to.eq(oldOrderInfo[4]); // c
    expect(orderInfos[3]).to.eq(oldOrderInfo[0]); // a1
    expect(orderInfos[4]).to.eq(oldOrderInfo[3]); // b2
  });

  it("does not change the order of irrelevant properties when moving up", async () => {
    /** Class hierarchy:
     *    A
     *   / \
     *  B   C
     * Moving a1 after c:
     *  c     c
     *  b2    b2
     *  a2 -> a1
     *  b1    a2
     *  a1    b1
     */
    const c = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "c", classInfo: createTestDMClassInfo({ name: "S:C" }) }) }],
    });
    const b2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const a2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a2", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const b1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b1", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const a1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const allFields = [c, b2, a2, b1, a1];
    const visibleFields = [c, a2, a1]; // imitating a selection of a class C instance

    // data of table DMDbMeta.ClassHasAllBaseClasses
    const classBaseClass = [
      { classFullName: "S:A", baseClassFullName: "S:A" },
      { classFullName: "S:B", baseClassFullName: "S:B" },
      { classFullName: "S:B", baseClassFullName: "S:A" },
      { classFullName: "S:C", baseClassFullName: "S:C" },
      { classFullName: "S:C", baseClassFullName: "S:A" },
    ];
    setupMocksForQueryingBaseClasses(classBaseClass);

    const fieldInfos = getFieldsInfos(allFields);
    storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
    const orderInfos = getFieldsOrderInfos(allFields);
    const oldOrderInfo = [...orderInfos];
    storageMock.loadPropertiesOrder.resolves(orderInfos);

    await manager.changeFieldPriority(ivault, a1, c, visibleFields);

    expect(orderInfos[0]).to.eq(oldOrderInfo[0]); // c
    expect(orderInfos[1]).to.eq(oldOrderInfo[1]); // b2
    expect(orderInfos[2]).to.eq(oldOrderInfo[4]); // a1
    expect(orderInfos[3]).to.eq(oldOrderInfo[2]); // a2
    expect(orderInfos[4]).to.eq(oldOrderInfo[3]); // b1
  });

  it("does not change the order of irrelevant properties when moving to top", async () => {
    /** Class hierarchy:
     *    A
     *   / \
     *  B   C
     * Moving a1 to top:
     *  c     b2
     *  b2    a1
     *  a2 -> c
     *  b1    a2
     *  a1    b1
     */
    const c = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "c", classInfo: createTestDMClassInfo({ name: "S:C" }) }) }],
    });
    const b2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const a2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a2", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const b1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b1", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const a1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const allFields = [c, b2, a2, b1, a1];
    const visibleFields = [c, a2, a1]; // imitating a selection of a class C instance

    // data of table DMDbMeta.ClassHasAllBaseClasses
    const classBaseClass = [
      { classFullName: "S:A", baseClassFullName: "S:A" },
      { classFullName: "S:B", baseClassFullName: "S:B" },
      { classFullName: "S:B", baseClassFullName: "S:A" },
      { classFullName: "S:C", baseClassFullName: "S:C" },
      { classFullName: "S:C", baseClassFullName: "S:A" },
    ];
    setupMocksForQueryingBaseClasses(classBaseClass);

    const fieldInfos = getFieldsInfos(allFields);
    storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
    const orderInfos = getFieldsOrderInfos(allFields);
    const oldOrderInfo = [...orderInfos];
    storageMock.loadPropertiesOrder.resolves(orderInfos);

    await manager.changeFieldPriority(ivault, a1, undefined, visibleFields);

    expect(orderInfos[0]).to.eq(oldOrderInfo[1]); // b2
    expect(orderInfos[1]).to.eq(oldOrderInfo[4]); // a1
    expect(orderInfos[2]).to.eq(oldOrderInfo[0]); // c
    expect(orderInfos[3]).to.eq(oldOrderInfo[2]); // a2
    expect(orderInfos[4]).to.eq(oldOrderInfo[3]); // b1
  });

  it("does not change non-visible primitive field order with respect to visible fields", async () => {
    /** Class hierarchy:
     *    A
     *   / \
     *  B   C
     * Moving a after c:
     * a       prim
     * b1      c
     * prim -> a
     * b2      b1
     * c       b2
     * Note:
     * prim is a primitive field, only visible having selected class B instances
     */

    const a = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const b1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b1", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const prim = createTestSimpleContentField();
    const b2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b2", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const c = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "c", classInfo: createTestDMClassInfo({ name: "S:C" }) }) }],
    });
    const allFields = [a, b1, prim, b2, c];
    const visibleFields = [a, c]; // imitating a selection of a class C instance

    // data of table DMDbMeta.ClassHasAllBaseClasses
    const classBaseClass = [
      { classFullName: "S:A", baseClassFullName: "S:A" },
      { classFullName: "S:B", baseClassFullName: "S:B" },
      { classFullName: "S:B", baseClassFullName: "S:A" },
      { classFullName: "S:C", baseClassFullName: "S:C" },
      { classFullName: "S:C", baseClassFullName: "S:A" },
    ];
    setupMocksForQueryingBaseClasses(classBaseClass);

    const fieldInfos = getFieldsInfos(allFields);
    storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
    const orderInfos = getFieldsOrderInfos(allFields);
    const oldOrderInfo = [...orderInfos];
    storageMock.loadPropertiesOrder.resolves(orderInfos);

    await manager.changeFieldPriority(ivault, a, c, visibleFields);

    expect(orderInfos[0]).to.eq(oldOrderInfo[2]); // prim
    expect(orderInfos[1]).to.eq(oldOrderInfo[4]); // c
    expect(orderInfos[2]).to.eq(oldOrderInfo[0]); // a
    expect(orderInfos[3]).to.eq(oldOrderInfo[1]); // b1
    expect(orderInfos[4]).to.eq(oldOrderInfo[3]); // b2
  });

  it("treats parent class as the primary class", async () => {
    /** Class hierarchy:
     *    A
     *   / \
     *  B   C
     * Moving a after C.A.a2:
     *  a1       C.A.a2
     *  b     -> a1
     *  C.A.a2   b
     */

    const a1 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a1", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const a2 = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "a2", classInfo: createTestDMClassInfo({ name: "S:A" }) }) }],
    });
    const b = createTestPropertiesContentField({
      properties: [{ property: createTestPropertyInfo({ name: "b", classInfo: createTestDMClassInfo({ name: "S:B" }) }) }],
    });
    const caa2 = createTestPropertiesContentField({ properties: a2.properties });

    const nestedMiddle = createTestNestedContentField({
      pathToPrimaryClass: [
        createTestRelatedClassInfo({
          sourceClassInfo: createTestDMClassInfo({ name: "S:A" }),
          targetClassInfo: createTestDMClassInfo({ name: "S:A" }),
        }),
      ],
      nestedFields: [caa2],
    });

    const nestedTop = createTestNestedContentField({
      pathToPrimaryClass: [
        createTestRelatedClassInfo({
          sourceClassInfo: createTestDMClassInfo({ name: "S:A" }),
          targetClassInfo: createTestDMClassInfo({ name: "S:C" }),
          isForwardRelationship: true,
        }),
      ],
      nestedFields: [nestedMiddle],
    });
    nestedTop.rebuildParentship();

    const allFields = [a1, b, caa2];
    const visibleFields = [a1, caa2]; // imitating a selection of a class C instance

    // data of table DMDbMeta.ClassHasAllBaseClasses
    const classBaseClass = [
      { classFullName: "S:A", baseClassFullName: "S:A" },
      { classFullName: "S:B", baseClassFullName: "S:B" },
      { classFullName: "S:B", baseClassFullName: "S:A" },
      { classFullName: "S:C", baseClassFullName: "S:C" },
      { classFullName: "S:C", baseClassFullName: "S:A" },
    ];
    setupMocksForQueryingBaseClasses(classBaseClass);

    const fieldInfos = getFieldsInfos(allFields);
    storageMock.loadProperties.resolves(new Set<PropertyFullName>(fieldInfos));
    const orderInfos = getFieldsOrderInfos(allFields);
    const oldOrderInfo = [...orderInfos];
    storageMock.loadPropertiesOrder.resolves(orderInfos);

    await manager.changeFieldPriority(ivault, a1, caa2, visibleFields);

    expect(orderInfos[0]).to.eq(oldOrderInfo[2]); // caa2
    expect(orderInfos[1]).to.eq(oldOrderInfo[0]); // a1
    expect(orderInfos[2]).to.eq(oldOrderInfo[1]); // b
  });
});

const getFieldsInfos = (fields: Field[]): PropertyFullName[] => fields.reduce((total: PropertyFullName[], field) => [...total, ...getFieldInfos(field)], []);

const getFieldsOrderInfos = (fields: Field[]): FavoritePropertiesOrderInfo[] => {
  const orderInfos = fields.reduce((total: FavoritePropertiesOrderInfo[], field) => [...total, ...createFieldOrderInfos(field)], []);
  let priority = orderInfos.length;
  orderInfos.forEach((orderInfo) => (orderInfo.priority = priority--));
  return orderInfos;
};
