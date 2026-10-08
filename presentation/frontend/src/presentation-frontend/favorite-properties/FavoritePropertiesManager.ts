/*---------------------------------------------------------------------------------------------
 * Copyright (c) Szewec Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { BeEvent, isDisposable, isIDisposable } from "@szewtwin/core-szewec";
import { QueryRowFormat } from "@szewtwin/core-common";
import { IVaultConnection } from "@szewtwin/core-frontend";
import { ClassId, Field, NestedContentField, PropertiesField } from "@szewtwin/presentation-common";
import { IFavoritePropertiesStorage } from "./FavoritePropertiesStorage.js";
import { IVaultConnectionInitializationHandler, ivaultInitializationHandlers } from "../IVaultConnectionInitialization.js";

/**
 * Scopes that favorite properties can be stored in.
 * @public
 */
export enum FavoritePropertiesScope {
  Global,
  SZEWTwin,
  IVault,
}

/**
 * Format:
 * Regular property - [{path from parent class}-]{schema name}:{class name}:{property name}.
 * Nested property - [{path from parent class}-]{content class schema name}:{content class name}.
 * Primitive property - {field name}.
 * @public
 */
export type PropertyFullName = string;

/**
 * Holds the information of favorite properties ordering.
 * @public
 */
export interface FavoritePropertiesOrderInfo {
  parentClassName: string | undefined;
  name: PropertyFullName;
  priority: number;
  orderedTimestamp: Date;
}

/**
 * Properties for initializing [[FavoritePropertiesManager]]
 * @public
 */
export interface FavoritePropertiesManagerProps {
  /**
   * Implementation of a persistence layer for storing favorite properties and their order.
   * @public
   */
  storage: IFavoritePropertiesStorage;
}

/**
 * The favorite property manager which lets to store favorite properties
 * and check if field contains favorite properties.
 *
 * @public
 */
export class FavoritePropertiesManager implements Disposable {
  /** Event raised after favorite properties have changed. */
  public onFavoritesChanged = new BeEvent<() => void>();

  public readonly storage: IFavoritePropertiesStorage;

  private _globalProperties: Set<PropertyFullName> | undefined;
  private _szewTwinProperties: Map<string, Set<PropertyFullName>>;
  private _ivaultProperties: Map<string, Set<PropertyFullName>>;
  private _ivaultBaseClassesByClass: Map<string, { [className: string]: string[] }>;
  private _ivaultInitializationPromises: Map<IVaultConnection, Promise<void>>;
  private _ivaultInitializationHandler: IVaultConnectionInitializationHandler;

  /** Property order is saved only in iVault scope */
  private _propertiesOrder: Map<string, FavoritePropertiesOrderInfo[]>;

  public constructor(props: FavoritePropertiesManagerProps) {
    this.storage = props.storage;
    this._szewTwinProperties = new Map<string, Set<PropertyFullName>>();
    this._ivaultProperties = new Map<string, Set<PropertyFullName>>();
    this._propertiesOrder = new Map<string, FavoritePropertiesOrderInfo[]>();
    this._ivaultBaseClassesByClass = new Map<string, { [className: string]: string[] }>();
    this._ivaultInitializationPromises = new Map<IVaultConnection, Promise<void>>();
    ivaultInitializationHandlers.add(
      (this._ivaultInitializationHandler = {
        startInitialization: (ivault) => this.startConnectionInitialization(ivault),
        ensureInitialized: async (ivault) => this.ensureInitialized(ivault),
      }),
    );
  }

  public [Symbol.dispose]() {
    ivaultInitializationHandlers.delete(this._ivaultInitializationHandler);
    if (isDisposable(this.storage)) {
      this.storage[Symbol.dispose]();
      /* c8 ignore next 4 */
      /* eslint-disable-next-line @typescript-eslint/no-deprecated */
    } else if (isIDisposable(this.storage)) {
      this.storage.dispose();
    }
  }

  /** @deprecated in 5.0 - will not be removed until after 2026-06-13. Use [Symbol.dispose] instead. */
  /* c8 ignore next 3 */
  public dispose() {
    this[Symbol.dispose]();
  }

  /**
   * Initialize favorite properties for the provided IVaultConnection.
   * @deprecated in 4.5 - will not be removed until after 2026-06-13. Initialization is performed automatically by all async methods and only needed for deprecated [[FavoritePropertiesManager.has]] and [[FavoritePropertiesManager.sortFields]].
   */
  public initializeConnection = async (ivault: IVaultConnection) => {
    const ivaultId = ivault.iVaultId!;
    const szewTwinId = ivault.szewTwinId!;

    if (this._globalProperties === undefined) {
      this._globalProperties = (await this.storage.loadProperties()) || new Set<PropertyFullName>();
    }

    if (!this._szewTwinProperties.has(szewTwinId)) {
      const szewTwinProperties = (await this.storage.loadProperties(szewTwinId)) || new Set<PropertyFullName>();
      this._szewTwinProperties.set(szewTwinId, szewTwinProperties);
    }

    if (!this._ivaultProperties.has(getiVaultInfo(szewTwinId, ivaultId))) {
      const ivaultProperties = (await this.storage.loadProperties(szewTwinId, ivaultId)) || new Set<PropertyFullName>();
      this._ivaultProperties.set(getiVaultInfo(szewTwinId, ivaultId), ivaultProperties);
    }
    const propertiesOrder = (await this.storage.loadPropertiesOrder(szewTwinId, ivaultId)) || [];
    this._propertiesOrder.set(getiVaultInfo(szewTwinId, ivaultId), propertiesOrder);
    await this._adjustPropertyOrderInfos(szewTwinId, ivaultId);
  };

  /**
   * Function that removes order information of properties that are no longer
   * favorited and adds missing order information for favorited properties.
   */
  private _adjustPropertyOrderInfos = async (szewTwinId: string, ivaultId: string) => {
    const propertiesOrder = this._propertiesOrder.get(getiVaultInfo(szewTwinId, ivaultId))!;

    const globalProperties = this._globalProperties!;
    const szewTwinProperties = this._szewTwinProperties.get(szewTwinId)!;
    const ivaultProperties = this._ivaultProperties.get(getiVaultInfo(szewTwinId, ivaultId))!;
    // favorite property infos that need to be added to the propertiesOrder array
    const infosToAdd = new Set<string>([...globalProperties, ...szewTwinProperties, ...ivaultProperties]);

    for (let i = propertiesOrder.length - 1; i >= 0; i--) {
      if (infosToAdd.has(propertiesOrder[i].name)) {
        infosToAdd.delete(propertiesOrder[i].name);
      } else {
        propertiesOrder.splice(i, 1);
      }
    }

    infosToAdd.forEach((info) =>
      propertiesOrder.push({
        name: info,
        parentClassName: getPropertyClassName(info),
        orderedTimestamp: new Date(),
        priority: 0,
      }),
    );

    let priority = propertiesOrder.length;
    propertiesOrder.forEach((oi) => (oi.priority = priority--));
  };

  private isInitialized(ivault: IVaultConnection): boolean {
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;
    return this._ivaultProperties.has(getiVaultInfo(szewTwinId, ivaultId));
  }

  /**
   * Checks if [[FavoritePropertiesManager.initializeConnection]] has been called for a given ivault.
   * Can be removed when [[FavoritePropertiesManager.has]] and [[FavoritePropertiesManager.sortFields]] are removed.
   */
  private validateInitialization(ivault: IVaultConnection) {
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;
    if (!this.isInitialized(ivault)) {
      throw Error(
        `Favorite properties are not initialized for iVault: '${ivaultId}', in szewTwin: '${szewTwinId}'. Call initializeConnection() with an IVaultConnection to initialize.`,
      );
    }
  }

  private startConnectionInitialization(ivault: IVaultConnection) {
    if (!this.isInitialized(ivault) && !this._ivaultInitializationPromises.has(ivault)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      this._ivaultInitializationPromises.set(ivault, this.initializeConnection(ivault));
    }
  }

  private async ensureInitialized(ivault: IVaultConnection) {
    if (this.isInitialized(ivault)) {
      return;
    }

    let promise = this._ivaultInitializationPromises.get(ivault);
    if (!promise) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      promise = this.initializeConnection(ivault);

      // Put the promise in the map to avoid possible multiple initializations from different promises.
      this._ivaultInitializationPromises.set(ivault, promise);
    }

    await promise;

    // Remove this promise from the map, because the next time this method is called, `this.isInitialized` should return true.
    this._ivaultInitializationPromises.delete(ivault);
  }

  /**
   * Adds favorite properties into a certain scope.
   * @param field Field that contains properties. If field contains multiple properties, all of them will be favorited.
   * @param ivault IVaultConnection.
   * @param scope FavoritePropertiesScope to put the favorite properties into.
   */
  public async add(field: Field, ivault: IVaultConnection, scope: FavoritePropertiesScope): Promise<void> {
    await this.ensureInitialized(ivault);
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    let favoriteProperties: Set<PropertyFullName>;
    let saveProperties: (properties: Set<PropertyFullName>) => Promise<void>;
    switch (scope) {
      case FavoritePropertiesScope.Global:
        favoriteProperties = this._globalProperties!;
        saveProperties = async (properties) => this.storage.saveProperties(properties);
        break;
      case FavoritePropertiesScope.SZEWTwin:
        favoriteProperties = this._szewTwinProperties.get(szewTwinId)!;
        saveProperties = async (properties) => this.storage.saveProperties(properties, szewTwinId);
        break;
      default:
        favoriteProperties = this._ivaultProperties.get(getiVaultInfo(szewTwinId, ivaultId))!;
        saveProperties = async (properties) => this.storage.saveProperties(properties, szewTwinId, ivaultId);
    }

    const countBefore = favoriteProperties.size;
    const fieldInfos = getFieldInfos(field);
    fieldInfos.forEach((info) => favoriteProperties.add(info));
    if (favoriteProperties.size !== countBefore) {
      const saves: Array<Promise<void>> = [];
      saves.push(saveProperties(favoriteProperties));

      const propertiesOrder = this._propertiesOrder.get(getiVaultInfo(szewTwinId, ivaultId))!;
      addOrderInfos(propertiesOrder, createFieldOrderInfos(field));
      saves.push(this.storage.savePropertiesOrder(propertiesOrder, szewTwinId, ivaultId));

      await Promise.all(saves);
      this.onFavoritesChanged.raiseEvent();
    }
  }

  /**
   * Removes favorite properties from a scope specified and all the more general scopes.
   * @param field Field that contains properties. If field contains multiple properties, all of them will be un-favorited.
   * @param ivault IVaultConnection.
   * @param scope FavoritePropertiesScope to remove the favorite properties from. It also removes from more general scopes.
   */
  public async remove(field: Field, ivault: IVaultConnection, scope: FavoritePropertiesScope): Promise<void> {
    await this.ensureInitialized(ivault);
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    const fieldInfos = getFieldInfos(field);
    const workingScopes: Array<{ properties: Set<PropertyFullName>; save: (properties: Set<PropertyFullName>) => Promise<void> }> = [];
    workingScopes.push({
      properties: this._globalProperties!,
      save: async (properties) => this.storage.saveProperties(properties),
    });
    if (scope === FavoritePropertiesScope.SZEWTwin || scope === FavoritePropertiesScope.IVault) {
      workingScopes.push({
        properties: this._szewTwinProperties.get(szewTwinId)!,
        save: async (properties) => this.storage.saveProperties(properties, szewTwinId),
      });
    }
    if (scope === FavoritePropertiesScope.IVault) {
      workingScopes.push({
        properties: this._ivaultProperties.get(getiVaultInfo(szewTwinId, ivaultId))!,
        save: async (properties) => this.storage.saveProperties(properties, szewTwinId, ivaultId),
      });
    }

    const saves: Array<Promise<void>> = [];
    let favoritesChanged = false;
    for (const { properties, save } of workingScopes) {
      const countBefore = properties.size;
      fieldInfos.forEach((info) => properties.delete(info));
      if (properties.size !== countBefore) {
        saves.push(save(properties));
        favoritesChanged = true;
      }
    }
    if (!favoritesChanged) {
      return;
    }

    const propertiesOrder = this._propertiesOrder.get(getiVaultInfo(szewTwinId, ivaultId))!;
    removeOrderInfos(propertiesOrder, createFieldOrderInfos(field));
    saves.push(this.storage.savePropertiesOrder(propertiesOrder, szewTwinId, ivaultId));

    await Promise.all(saves);
    this.onFavoritesChanged.raiseEvent();
  }

  /**
   * Removes all favorite properties from a certain scope.
   * @param ivault IVaultConnection.
   * @param scope FavoritePropertiesScope to remove the favorite properties from.
   */
  public async clear(ivault: IVaultConnection, scope: FavoritePropertiesScope): Promise<void> {
    await this.ensureInitialized(ivault);
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    let favoriteProperties: Set<PropertyFullName>;
    let saveProperties: () => Promise<void>;
    switch (scope) {
      case FavoritePropertiesScope.Global:
        favoriteProperties = this._globalProperties!;
        saveProperties = async () => this.storage.saveProperties(new Set<PropertyFullName>());
        break;
      case FavoritePropertiesScope.SZEWTwin:
        favoriteProperties = this._szewTwinProperties.get(szewTwinId)!;
        saveProperties = async () => this.storage.saveProperties(new Set<PropertyFullName>(), szewTwinId);
        break;
      default:
        favoriteProperties = this._ivaultProperties.get(getiVaultInfo(szewTwinId, ivaultId))!;
        saveProperties = async () => this.storage.saveProperties(new Set<PropertyFullName>(), szewTwinId, ivaultId);
    }

    if (favoriteProperties.size === 0) {
      return;
    }

    favoriteProperties.clear();
    const saves: Array<Promise<void>> = [];
    saves.push(saveProperties());
    saves.push(this._adjustPropertyOrderInfos(szewTwinId, ivaultId));
    await Promise.all(saves);
    this.onFavoritesChanged.raiseEvent();
  }

  /**
   * Check if field contains at least one favorite property.
   * @param field Field that contains properties.
   * @param ivault IVaultConnection.
   * @param scope FavoritePropertiesScope to check for favorite properties. It also checks the more general scopes.
   * @note `initializeConnection` must be called with the `ivault` before calling this function.
   * @deprecated in 4.5 - will not be removed until after 2026-06-13. Use [[FavoritePropertiesManager.hasAsync]] instead. This method is not async, therefore it requires early initialization by calling [[FavoritePropertiesManager.initializeConnection]].
   */
  public has(field: Field, ivault: IVaultConnection, scope: FavoritePropertiesScope): boolean {
    this.validateInitialization(ivault);
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    const fieldInfos = getFieldInfos(field);
    return (
      setHasAny(this._globalProperties!, fieldInfos) ||
      (scope !== FavoritePropertiesScope.Global && setHasAny(this._szewTwinProperties.get(szewTwinId)!, fieldInfos)) ||
      (scope === FavoritePropertiesScope.IVault && setHasAny(this._ivaultProperties.get(getiVaultInfo(szewTwinId, ivaultId))!, fieldInfos))
    );
  }

  /**
   * Check if field contains at least one favorite property.
   * @param field Field that contains properties.
   * @param ivault IVaultConnection.
   * @param scope FavoritePropertiesScope to check for favorite properties. It also checks the more general scopes.
   */
  public async hasAsync(field: Field, ivault: IVaultConnection, scope: FavoritePropertiesScope): Promise<boolean> {
    await this.ensureInitialized(ivault);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return this.has(field, ivault, scope);
  }

  /**
   * Sorts an array of fields with respect to favorite property order.
   * Non-favorited fields get sorted by their default priority and always have lower priority than favorited fields.
   * @param ivault IVaultConnection.
   * @param fields Array of Field's that needs to be sorted.
   * @note `initializeConnection` must be called with the `ivault` before calling this function.
   * @deprecated in 4.5 - will not be removed until after 2026-06-13. Use [[FavoritePropertiesManager.sortFieldsAsync]] instead. This method is not async, therefore it requires early initialization by calling [[FavoritePropertiesManager.initializeConnection]].
   */
  public sortFields = (ivault: IVaultConnection, fields: Field[]): Field[] => {
    this.validateInitialization(ivault);
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    const fieldPriority = new Map<Field, number>();
    fields.forEach((field) => fieldPriority.set(field, this.getFieldPriority(field, szewTwinId, ivaultId)));

    const sortFunction = (left: Field, right: Field): number => {
      const lp = fieldPriority.get(left)!;
      const rp = fieldPriority.get(right)!;
      return lp < rp
        ? 1
        : lp > rp
          ? -1
          : left.priority < right.priority
            ? 1 // if favorite fields have equal priorities, sort by field priority
            : left.priority > right.priority
              ? -1
              : left.name.localeCompare(right.name);
    };

    return fields.sort(sortFunction);
  };

  /**
   * Sorts an array of fields with respect to favorite property order.
   * Non-favorited fields get sorted by their default priority and always have lower priority than favorited fields.
   * @param ivault IVaultConnection.
   * @param fields Array of Field's that needs to be sorted.
   */
  public async sortFieldsAsync(ivault: IVaultConnection, fields: Field[]): Promise<Field[]> {
    await this.ensureInitialized(ivault);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return this.sortFields(ivault, fields);
  }

  private getFieldPriority(field: Field, szewTwinId: string, ivaultId: string): number {
    const orderInfos = this._propertiesOrder.get(getiVaultInfo(szewTwinId, ivaultId))!;
    const fieldOrderInfos = getFieldOrderInfos(field, orderInfos);
    if (fieldOrderInfos.length === 0) {
      return -1;
    }
    const mostRecent = getMostRecentOrderInfo(fieldOrderInfos);
    return mostRecent.priority;
  }

  private _getBaseClassesByClass = async (ivault: IVaultConnection, neededClasses: Set<string>): Promise<{ [className: string]: string[] }> => {
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    const ivaultInfo = getiVaultInfo(szewTwinId, ivaultId);
    let baseClasses: { [className: string]: string[] };
    if (this._ivaultBaseClassesByClass.has(ivaultInfo)) {
      baseClasses = this._ivaultBaseClassesByClass.get(ivaultInfo)!;
    } else {
      this._ivaultBaseClassesByClass.set(ivaultInfo, (baseClasses = {}));
    }

    const missingClasses = new Set<string>();
    neededClasses.forEach((className) => {
      if (!baseClasses.hasOwnProperty(className)) {
        missingClasses.add(className);
      }
    });
    if (missingClasses.size === 0) {
      return baseClasses;
    }

    const query = `
    SELECT (derivedSchema.Name || ':' || derivedClass.Name) AS "ClassFullName", (baseSchema.Name || ':' || baseClass.Name) AS "BaseClassFullName"
    FROM DMDbMeta.ClassHasAllBaseClasses baseClassRels
    INNER JOIN DMDbMeta.DMClassDef derivedClass ON derivedClass.DMInstanceId = baseClassRels.SourceDMInstanceId
    INNER JOIN DMDbMeta.DMSchemaDef derivedSchema ON derivedSchema.DMInstanceId = derivedClass.Schema.Id
    INNER JOIN DMDbMeta.DMClassDef baseClass ON baseClass.DMInstanceId = baseClassRels.TargetDMInstanceId
    INNER JOIN DMDbMeta.DMSchemaDef baseSchema ON baseSchema.DMInstanceId = baseClass.Schema.Id
    WHERE (derivedSchema.Name || ':' || derivedClass.Name) IN (${[...missingClasses].map((className) => `'${className}'`).join(",")})`;
    const reader = ivault.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
    while (await reader.step()) {
      const row = reader.current.toRow();
      if (!(row.classFullName in baseClasses)) {
        baseClasses[row.classFullName] = [];
      }
      baseClasses[row.classFullName].push(row.baseClassFullName);
    }
    return baseClasses;
  };

  /** Changes field properties priorities to lower than another fields priority
   * @param ivault IVaultConnection.
   * @param field Field that priority is being changed.
   * @param afterField Field that goes before the moved field. If undefined the moving field is changed to the highest priority (to the top).
   * @param visibleFields Array of fields to move the field in.
   */
  public async changeFieldPriority(ivault: IVaultConnection, field: Field, afterField: Field | undefined, visibleFields: Field[]) {
    /**
     * How it works:
     * 1. Gets the orderInfo's for `field` (`orderInfo`) and `afterField` (`afterOrderInfo`) by selecting the most recent order informations for each field
     * 2. Iterates all orderInfo's that are in between `afterOrderInfo` and `orderInfo` when sorted by priority
     * 3. For each iterated orderInfo it checks if it is relevant:
     * 3.1. If orderInfo belongs to a primitive property, orderInfo is relevant
     * 3.2. If orderInfo's field is visible, orderInfo is relevant
     * 3.3. If orderInfo's class has a base class or itself in previously labeled relevant orderInfo's, orderInfo is relevant
     * 3.4. If 3.1 - 3.3 don't pass, orderInfo is irrelevant
     * 4. Irrelevant orderInfos's get moved after `orderInfo` (depends on the direction)
     * 5. All `field` orderInfo's get moved after `afterOrderInfo`
     */
    await this.ensureInitialized(ivault);
    const szewTwinId = ivault.szewTwinId!;
    const ivaultId = ivault.iVaultId!;

    if (field === afterField) {
      throw Error("`field` can not be the same as `afterField`.");
    }

    const allOrderInfos = this._propertiesOrder.get(getiVaultInfo(szewTwinId, ivaultId))!;

    const findFieldOrderInfoData = (f: Field) => {
      if (!visibleFields.includes(f)) {
        throw Error("Field is not contained in visible fields.");
      }
      const infos = getFieldOrderInfos(f, allOrderInfos);

      if (infos.length === 0) {
        throw Error("Field has no property order information.");
      }
      const info = getMostRecentOrderInfo(infos);
      const index = allOrderInfos.indexOf(info);
      return { infos, mostRecent: { info, index } };
    };

    const {
      infos: movingOrderInfos,
      mostRecent: { index: orderInfoIndex },
    } = findFieldOrderInfoData(field);

    let afterOrderInfo: FavoritePropertiesOrderInfo | undefined;
    let afterOrderInfoIndex;
    if (afterField === undefined) {
      afterOrderInfo = undefined;
      afterOrderInfoIndex = -1;
    } else {
      ({
        mostRecent: { info: afterOrderInfo, index: afterOrderInfoIndex },
      } = findFieldOrderInfoData(afterField));
    }

    let direction: Direction; // where to go from `afterOrderInfo` to `orderInfo`
    let startIndex: number;
    if (orderInfoIndex < afterOrderInfoIndex) {
      direction = Direction.Up;
      startIndex = afterOrderInfoIndex;
    } else {
      direction = Direction.Down;
      startIndex = afterOrderInfoIndex + 1;
    }

    const neededClassNames: Set<string> = allOrderInfos.reduce((classNames: Set<string>, oi) => {
      if (oi.parentClassName) {
        classNames.add(oi.parentClassName);
      }
      return classNames;
    }, new Set<string>());
    const baseClassesByClass = await this._getBaseClassesByClass(ivault, neededClassNames);

    const visibleOrderInfos = visibleFields.reduce(
      (union: FavoritePropertiesOrderInfo[], currField) => union.concat(getFieldOrderInfos(currField, allOrderInfos)),
      [],
    );
    const irrelevantOrderInfos: FavoritePropertiesOrderInfo[] = []; // orderInfos's that won't change their logical order in respect to other properties
    const relevantClasses: Set<ClassId> = new Set<ClassId>(); // currently relevant classes

    for (let i = startIndex; i !== orderInfoIndex; i += direction) {
      const currOrderInfo = allOrderInfos[i];

      // primitive properties are always relevant, because we can't determine their relevance based on the class hierarchy
      if (currOrderInfo.parentClassName === undefined) {
        continue;
      }

      const visible = visibleOrderInfos.includes(currOrderInfo);
      if (visible) {
        relevantClasses.add(currOrderInfo.parentClassName);
        continue;
      }

      const hasBaseClasses = baseClassesByClass[currOrderInfo.parentClassName].some((classId) => relevantClasses.has(classId));
      if (hasBaseClasses) {
        continue;
      }

      if (direction === Direction.Down) {
        irrelevantOrderInfos.push(currOrderInfo);
      } else {
        irrelevantOrderInfos.unshift(currOrderInfo);
      }
    }

    // remove irrelevantOrderInfo's to add them after the `orderInfo`
    irrelevantOrderInfos.forEach((foi) => {
      const index = allOrderInfos.findIndex((oi) => oi.parentClassName === foi.parentClassName && oi.name === foi.name);
      allOrderInfos.splice(index, 1);
    });

    // remove movingOrderInfos's to add them after the `afterOrderInfo`
    movingOrderInfos.forEach((foi) => {
      const index = allOrderInfos.findIndex((oi) => oi.parentClassName === foi.parentClassName && oi.name === foi.name);
      allOrderInfos.splice(index, 1);
    });
    movingOrderInfos.forEach((oi) => (oi.orderedTimestamp = new Date()));

    afterOrderInfoIndex = afterOrderInfo === undefined ? -1 : allOrderInfos.indexOf(afterOrderInfo);
    allOrderInfos.splice(afterOrderInfoIndex + 1, 0, ...movingOrderInfos);
    allOrderInfos.splice(afterOrderInfoIndex + 1 + (direction === Direction.Up ? movingOrderInfos.length : 0), 0, ...irrelevantOrderInfos);

    // reassign priority numbers
    let priority = allOrderInfos.length;
    allOrderInfos.forEach((oi) => (oi.priority = priority--));

    await this.storage.savePropertiesOrder(allOrderInfos, szewTwinId, ivaultId);
    this.onFavoritesChanged.raiseEvent();
  }
}

enum Direction {
  Up = -1,
  Down = 1,
}

const getiVaultInfo = (szewTwinId: string, ivaultId: string) => `${szewTwinId}/${ivaultId}`;

const getPropertiesFieldPropertyNames = (field: PropertiesField) => {
  const nestingPrefix = getNestingPrefix(field.parent);
  return field.properties.map((property) => `${nestingPrefix}${property.property.classInfo.name}:${property.property.name}`);
};

const getNestedContentFieldPropertyName = (field: NestedContentField) => {
  const nestingPrefix = getNestingPrefix(field);
  return `${nestingPrefix}${field.contentClassInfo.name}`;
};

const getNestingPrefix = (field: NestedContentField | undefined) => {
  const path: string[] = [];
  let curr = field;
  while (curr !== undefined) {
    curr.pathToPrimaryClass.forEach((rel) => {
      // Relationship directions are reversed, because we are generating a relationship list starting from the parent
      path.push(`${rel.isForwardRelationship ? "B" : "F"}:${rel.relationshipInfo.name}`);
      path.push(rel.targetClassInfo.name);
    });
    curr = curr.parent;
  }
  if (path.length === 0) {
    return "";
  }

  path.reverse();
  return `${path.join("-")}-`;
};

const getPropertyClassName = (propertyName: PropertyFullName): string | undefined => {
  const propertyNameStart = propertyName.split("-")[0];
  const parts = propertyNameStart.split(":").length;
  if (parts === 1) {
    // primitive
    return undefined;
  }
  if (parts === 2) {
    // nested property OR nested property parent class OR regular property parent class
    return propertyNameStart;
  }
  // regular property without parent class
  return propertyNameStart.substring(0, propertyName.lastIndexOf(":"));
};

/** @internal */
export const getFieldInfos = (field: Field): Set<PropertyFullName> => {
  const fieldInfos: Set<PropertyFullName> = new Set<PropertyFullName>();
  if (field.isPropertiesField()) {
    getPropertiesFieldPropertyNames(field).forEach((info) => fieldInfos.add(info));
  } else if (field.isNestedContentField()) {
    fieldInfos.add(getNestedContentFieldPropertyName(field));
  } else {
    fieldInfos.add(field.name);
  }
  return fieldInfos;
};

const setHasAny = (set: Set<string>, lookup: Set<string>) => {
  for (const key of lookup) {
    if (set.has(key)) {
      return true;
    }
  }
  return false;
};

const addOrderInfos = (dest: FavoritePropertiesOrderInfo[], source: FavoritePropertiesOrderInfo[]) => {
  source.forEach((si) => {
    const index = dest.findIndex((di) => di.name === si.name);
    if (index === -1) {
      si.orderedTimestamp = new Date();
      dest.push(si);
    }
  });
  let priority = dest.length;
  dest.forEach((info) => (info.priority = priority--));
};

const removeOrderInfos = (container: FavoritePropertiesOrderInfo[], toRemove: FavoritePropertiesOrderInfo[]) => {
  toRemove.forEach((roi) => {
    const index = container.findIndex((oi) => oi.name === roi.name);
    if (index >= 0) {
      container.splice(index, 1);
    }
  });
};

/** @internal */
export const createFieldOrderInfos = (field: Field): FavoritePropertiesOrderInfo[] => {
  if (field.isNestedContentField()) {
    const propertyName = getNestedContentFieldPropertyName(field);
    return [
      {
        parentClassName: getPropertyClassName(propertyName),
        name: propertyName,
        priority: 0,
        orderedTimestamp: new Date(),
      },
    ];
  }
  if (field.isPropertiesField()) {
    return getPropertiesFieldPropertyNames(field).map((propertyName) => ({
      parentClassName: getPropertyClassName(propertyName),
      name: propertyName,
      priority: 0,
      orderedTimestamp: new Date(),
    }));
  }
  return [
    {
      parentClassName: undefined,
      name: field.name,
      priority: 0,
      orderedTimestamp: new Date(),
    },
  ];
};

const getFieldOrderInfos = (field: Field, orderInfos: FavoritePropertiesOrderInfo[]): FavoritePropertiesOrderInfo[] => {
  const fieldOrderInfos: FavoritePropertiesOrderInfo[] = [];
  const tryAddOrderInfo = (name: string) => {
    const fieldOrderInfo = orderInfos.find((oi) => oi.name === name);
    if (fieldOrderInfo !== undefined) {
      fieldOrderInfos.push(fieldOrderInfo);
    }
  };

  if (field.isPropertiesField()) {
    getPropertiesFieldPropertyNames(field).forEach(tryAddOrderInfo);
  } else if (field.isNestedContentField()) {
    tryAddOrderInfo(getNestedContentFieldPropertyName(field));
  } else {
    tryAddOrderInfo(field.name);
  }

  return fieldOrderInfos;
};

const getMostRecentOrderInfo = (orderInfos: FavoritePropertiesOrderInfo[]) =>
  orderInfos.reduce((recent, curr) => (recent && recent.orderedTimestamp >= curr.orderedTimestamp ? recent : curr));
